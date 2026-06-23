/**
 * bookingAgent.js
 *
 * Gemini-powered booking agent using function/tool calling.
 * Uses generateContent directly (not the Chat API) for full control
 * over the contents array, avoiding empty-parts errors.
 */
const { GoogleGenAI } = require('@google/genai');
const config = require('../config/config');
const { checkAvailability } = require('../tools/availabilityTool');
const { confirmBooking } = require('../tools/confirmTool');

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

// ─── System prompt ──────────────────────────────────────────
const SYSTEM_PROMPT = `You are a friendly and professional AI booking assistant for a salon.
Your job is to help customers book, enquire about, and manage their salon appointments via WhatsApp.

Available services: Haircut, Hair Coloring, Beard Trim, Facial, Manicure.

Follow these rules:
1. Greet the customer warmly and ask how you can help.
2. Extract the service name, preferred date, and preferred time from the conversation.
3. If any required information is missing, ask for it politely.
4. Once you have all details, call check_availability to see if a slot is open.
5. If a slot is available, summarize the booking details and ask the customer to confirm.
6. When the customer confirms, call confirm_booking to finalize.
7. Always be concise, clear, and helpful. Use emojis sparingly.
8. If no slots are available, suggest nearby alternatives.

Today's date is: ${new Date().toISOString().slice(0, 10)}.`;

// ─── Tool declarations (Gemini function calling schema) ─────
const tools = [
  {
    functionDeclarations: [
      {
        name: 'check_availability',
        description:
          'Check whether a booking slot is available for a given service, date, and optional time.',
        parameters: {
          type: 'object',
          properties: {
            service_name: {
              type: 'string',
              description: 'Name of the service (e.g. "Haircut")',
            },
            date: {
              type: 'string',
              description: 'Date in YYYY-MM-DD format',
            },
            time: {
              type: 'string',
              description: 'Preferred time in HH:MM (24h) format. Optional.',
            },
          },
          required: ['service_name', 'date'],
        },
      },
      {
        name: 'confirm_booking',
        description:
          'Confirm and finalize a booking after the customer has agreed.',
        parameters: {
          type: 'object',
          properties: {
            phone_number: {
              type: 'string',
              description: 'Customer phone number',
            },
            service_name: {
              type: 'string',
              description: 'Name of the service',
            },
            slot_datetime: {
              type: 'string',
              description: 'The exact slot datetime in YYYY-MM-DD HH:MM format',
            },
            party_size: {
              type: 'integer',
              description: 'Number of people (default 1)',
            },
          },
          required: ['phone_number', 'service_name', 'slot_datetime'],
        },
      },
    ],
  },
];

// ─── Tool dispatcher ────────────────────────────────────────
async function executeTool(name, args) {
  switch (name) {
    case 'check_availability':
      return await checkAvailability(args.service_name, args.date, args.time);
    case 'confirm_booking':
      return await confirmBooking(
        args.phone_number,
        args.service_name,
        args.slot_datetime,
        args.party_size
      );
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Build Gemini contents from stored history ──────────────
/**
 * Convert our stored history [{role, content}] to Gemini contents format.
 * Gemini requires:
 *   - Every part must have non-empty text
 *   - Roles must alternate between 'user' and 'model'
 *   - History must start with 'user'
 */
function buildGeminiContents(messageHistory) {
  const contents = [];

  for (const msg of messageHistory) {
    // Skip messages with empty/null/whitespace content
    if (!msg.content || (typeof msg.content === 'string' && msg.content.trim() === '')) continue;

    // Only process user and assistant roles
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;

    const geminiRole = msg.role === 'assistant' ? 'model' : 'user';

    // Gemini requires alternating roles — merge consecutive same-role messages
    const lastEntry = contents[contents.length - 1];
    if (lastEntry && lastEntry.role === geminiRole) {
      lastEntry.parts[0].text += '\n' + msg.content;
    } else {
      contents.push({ role: geminiRole, parts: [{ text: msg.content }] });
    }
  }

  // History must start with 'user'
  while (contents.length > 0 && contents[0].role === 'model') {
    contents.shift();
  }

  // History must end with 'user' for generateContent to work
  // (Gemini expects the last message to be the user's turn)
  // If it ends with 'model', that's fine — the last user message was already processed

  return contents;
}

// ─── Main agent loop ────────────────────────────────────────
/**
 * Run the booking agent using generateContent directly.
 * @param {Array} messageHistory — array of {role, content} objects
 * @returns {{ reply: string, updatedHistory: Array }}
 */
async function runBookingAgent(messageHistory) {
  // Build the contents array from full history
  const contents = buildGeminiContents(messageHistory);

  if (contents.length === 0) {
    return {
      reply: "Hi! 😊 Welcome to our salon. How can I help you today?",
      updatedHistory: [...messageHistory, { role: 'assistant', content: "Hi! 😊 Welcome to our salon. How can I help you today?" }],
    };
  }

  // Allow up to 5 tool-call rounds
  const MAX_ROUNDS = 5;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    console.log(`🔄 Round ${round + 1} | Contents length: ${contents.length}`);

    const response = await ai.models.generateContent({
      model: config.gemini.model,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools,
      },
    });

    // Check for function calls
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    const functionCalls = parts.filter(p => p.functionCall);
    const textParts = parts.filter(p => p.text);

    if (functionCalls.length > 0) {
      // Add the model's FULL response to contents (preserves thought_signature)
      contents.push(candidate.content);

      // Execute each function call and build function responses
      const functionResponseParts = [];
      for (const fc of functionCalls) {
        const { name, args } = fc.functionCall;
        console.log(`🔧 Tool call: ${name}`, args);

        const result = await executeTool(name, args);
        console.log(result);


        functionResponseParts.push({
          functionResponse: {
            name,
            response: result,
          },
        });
      }

      // Add function responses as a user turn
      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });

      // Loop again for the model to process the results
      continue;
    }

    // Model produced a final text reply
    const reply = textParts.map(p => p.text).join('') || '';

    // Store only user/assistant messages (not tool call internals)
    const updatedHistory = [
      ...messageHistory,
      { role: 'assistant', content: reply },
    ];

    return { reply, updatedHistory };
  }

  // Fallback
  return {
    reply: "I'm sorry, I couldn't complete your request right now. Please try again.",
    updatedHistory: messageHistory,
  };
}

module.exports = { runBookingAgent };
