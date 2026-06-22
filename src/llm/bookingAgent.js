/**
 * bookingAgent.js
 *
 * OpenAI-powered booking agent using function/tool calling.
 * The model decides which tool to invoke; we execute the tool and feed
 * the result back until the model produces a final text reply.
 */
const OpenAI = require('openai');
const config = require('../config/config');
const { checkAvailability } = require('../tools/availabilityTool');
const { confirmBooking } = require('../tools/confirmTool');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

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

// ─── Tool definitions (OpenAI function calling schema) ──────
const tools = [
  {
    type: 'function',
    function: {
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
  },
  {
    type: 'function',
    function: {
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

// ─── Main agent loop ────────────────────────────────────────
/**
 * Run the booking agent.
 * @param {Array} messageHistory — array of {role, content} objects
 * @returns {{ reply: string, updatedHistory: Array }}
 */
async function runBookingAgent(messageHistory) {
  // Build messages array with system prompt
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messageHistory,
  ];

  // Allow up to 5 tool-call rounds to prevent infinite loops
  const MAX_ROUNDS = 5;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      tools,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    // Add assistant message to history
    messages.push(assistantMessage);

    // If the model wants to call tools
    if (choice.finish_reason === 'tool_calls' || assistantMessage.tool_calls?.length) {
      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments);

        console.log(`🔧 Tool call: ${fnName}`, fnArgs);

        const result = await executeTool(fnName, fnArgs);

        // Feed tool result back
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      // Loop again — the model will process the tool results
      continue;
    }

    // Model produced a final text reply
    const reply = assistantMessage.content || '';

    // Build cleaned history (strip system prompt for storage)
    const updatedHistory = messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'tool') {
          return { role: m.role, tool_call_id: m.tool_call_id, content: m.content };
        }
        if (m.tool_calls) {
          return { role: m.role, content: m.content, tool_calls: m.tool_calls };
        }
        return { role: m.role, content: m.content };
      });

    return { reply, updatedHistory };
  }

  // Fallback if we hit max rounds
  return {
    reply: "I'm sorry, I couldn't complete your request right now. Please try again.",
    updatedHistory: messageHistory,
  };
}

module.exports = { runBookingAgent };
