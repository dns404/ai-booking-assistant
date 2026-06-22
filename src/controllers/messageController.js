/**
 * messageController.js
 *
 * Orchestrates the full flow:
 *   incoming text → load/create conversation → LLM agent → return reply
 *
 * Note: WhatsApp sending is handled by parchika-backend.
 * This controller only processes the message and returns the AI reply.
 */
const pool = require('../models/db');
const { runBookingAgent } = require('../llm/bookingAgent');

/**
 * Handle a single inbound message.
 * @param {string} from  — sender phone number (e.g. "919876543210")
 * @param {string} text  — message body
 * @returns {{ reply: string }}
 */
async function handleIncomingMessage(from, text) {
  console.log(`📩 Message from ${from}: ${text}`);

  // 1. Load or create conversation
  const conversation = await getOrCreateConversation(from);

  // 2. Append user message to history
  const history = conversation.messages || [];
  history.push({ role: 'user', content: text });

  // 3. Run LLM booking agent (may invoke tools internally)
  const { reply, updatedHistory } = await runBookingAgent(history);

  // 4. Persist updated conversation
  await updateConversation(from, updatedHistory);

  // 5. Return reply (parchika-backend will send it via WhatsApp)
  return { reply: reply || '' };
}

// ─── Conversation helpers ──────────────────────────────────

async function getOrCreateConversation(phone) {
  const [rows] = await pool.execute(
    'SELECT id, messages, state FROM conversations WHERE phone_number = ?',
    [phone]
  );

  if (rows.length > 0) {
    const row = rows[0];
    return {
      id: row.id,
      messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages,
      state: typeof row.state === 'string' ? JSON.parse(row.state) : row.state,
    };
  }

  // Create new conversation
  const [result] = await pool.execute(
    'INSERT INTO conversations (phone_number, messages, state) VALUES (?, ?, ?)',
    [phone, JSON.stringify([]), JSON.stringify({})]
  );

  return { id: result.insertId, messages: [], state: {} };
}

async function updateConversation(phone, messages) {
  await pool.execute(
    'UPDATE conversations SET messages = ? WHERE phone_number = ?',
    [JSON.stringify(messages), phone]
  );
}

module.exports = { handleIncomingMessage };
