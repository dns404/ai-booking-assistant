/**
 * API Routes
 *
 * Exposes endpoints for external services (e.g. parchika-backend)
 * to send messages into the booking agent for processing.
 */
const express = require('express');
const router = express.Router();
const { handleIncomingMessage } = require('../controllers/messageController');

/**
 * POST /api/message
 * Body: { "from": "919876543210", "text": "I want a haircut tomorrow" }
 *
 * Called by your parchika-backend when it receives a WhatsApp message.
 */
router.post('/message', async (req, res, next) => {
  try {
    const { from, text } = req.body;

    if (!from || !text) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: "from" and "text"',
      });
    }

    const result = await handleIncomingMessage(from, text);

    return res.json({
      success: true,
      reply: result.reply,
      booking: result.booking || null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
