/**
 * whatsappClient.js
 *
 * Send messages via Meta's WhatsApp Cloud API (Graph API).
 */
const axios = require('axios');
const config = require('../config/config');

const BASE_URL = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;

/**
 * Send a plain text message (works within the 24h session window).
 * @param {string} to   — recipient phone number (with country code, no +)
 * @param {string} text — message body
 */
async function sendTextMessage(to, text) {
  try {
    const response = await axios.post(
      BASE_URL,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`📤 Message sent to ${to}:`, response.data);
    return response.data;
  } catch (err) {
    console.error(
      '❌ Failed to send message:',
      err.response?.data || err.message
    );
    throw err;
  }
}

/**
 * Send a template message (works outside the 24h session window).
 * @param {string} to           — recipient phone number
 * @param {string} templateName — approved template name
 * @param {string} languageCode — e.g. "en_US"
 * @param {Array}  components   — template components (header, body params, etc.)
 */
async function sendTemplateMessage(to, templateName, languageCode = 'en_US', components = []) {
  try {
    const response = await axios.post(
      BASE_URL,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`📤 Template "${templateName}" sent to ${to}:`, response.data);
    return response.data;
  } catch (err) {
    console.error(
      '❌ Failed to send template:',
      err.response?.data || err.message
    );
    throw err;
  }
}

module.exports = { sendTextMessage, sendTemplateMessage };
