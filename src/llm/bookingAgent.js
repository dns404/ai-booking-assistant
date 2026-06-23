/**
 * bookingAgent.js
 *
 * Gemini-powered booking agent using function/tool calling.
 * The model decides which tool to invoke; we execute the tool and feed
 * the result back until the model produces a final text reply.
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

// ─── Convert stored history to Gemini format ────────────────
/**
 * Gemini expects: [{ role: 'user', parts: [...] }, { role: 'model', parts: [...] }]
 * Rules:
 *   - Every part must have non-empty text (otherwise Gemini throws INVALID_ARGUMENT)
 *   - Roles must alternate between 'user' and 'model'
 *   - Our stored history uses 'assistant' → mapped to 'model'
 */
function toGeminiHistory(messageHistory) {
  const geminiHistory = [];

  for (const msg of messageHistory) {
    // Skip tool messages, status messages, or messages with empty/null content
    if (!msg.content || msg.content.trim() === '') continue;
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;

    const geminiRole = msg.role === 'assistant' ? 'model' : 'user';

    // Gemini requires alternating roles — merge if same role appears consecutively
    const lastEntry = geminiHistory[geminiHistory.length - 1];
    if (lastEntry && lastEntry.role === geminiRole) {
      // Append to existing entry's text
      lastEntry.parts[0].text += '\n' + msg.content;
    } else {
      geminiHistory.push({ role: geminiRole, parts: [{ text: msg.content }] });
    }
  }

  // Gemini history must start with 'user' — drop leading 'model' messages if any
  while (geminiHistory.length > 0 && geminiHistory[0].role === 'model') {
    geminiHistory.shift();
  }

  return geminiHistory;
}


// ─── Main agent loop ────────────────────────────────────────
/**
 * Run the booking agent.
 * @param {Array} messageHistory — array of {role, content} objects
 * @returns {{ reply: string, updatedHistory: Array }}
 */
async function runBookingAgent(messageHistory) {
  // Separate the latest user message from history
  const lastMessage = messageHistory[messageHistory.length - 1];
  const previousHistory = messageHistory.slice(0, -1);

  // Convert prior messages to Gemini format for context
  const geminiHistory = toGeminiHistory(previousHistory);
  console.log(config.gemini.model);

  // Create a chat session
  const chat = ai.chats.create({
    model: config.gemini.model,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools,
    },
    history: geminiHistory,
  });

  // Allow up to 5 tool-call rounds to prevent infinite loops
  const MAX_ROUNDS = 5;
  let currentInput = lastMessage.content;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await chat.sendMessage({ message: currentInput });

    // Check if the model wants to call a function
    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      // Process each function call
      const functionResponses = [];

      for (const fc of functionCalls) {
        console.log(`🔧 Tool call: ${fc.name}`, fc.args);
        const result = await executeTool(fc.name, fc.args);

        functionResponses.push({
          name: fc.name,
          response: result,
        });
      }

      // Send function results back as the next input
      currentInput = { functionResponses };
      continue;
    }

    // Model produced a final text reply
    const reply = response.text || '';

    // Build updated history for storage
    const updatedHistory = [
      ...messageHistory,
      { role: 'assistant', content: reply },
    ];

    return { reply, updatedHistory };
  }

  // Fallback if we hit max rounds
  return {
    reply: "I'm sorry, I couldn't complete your request right now. Please try again.",
    updatedHistory: messageHistory,
  };
}

module.exports = { runBookingAgent };
