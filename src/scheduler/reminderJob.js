/**
 * reminderJob.js
 *
 * Runs a node-cron job every hour to send WhatsApp reminders
 * for upcoming confirmed bookings (24h and 1h before).
 */
const cron = require('node-cron');
const pool = require('../models/db');
const { sendTextMessage } = require('../whatsapp/whatsappClient');

/**
 * Start the reminder cron job.
 * Runs every hour at minute 0.
 */
function startReminderJob() {
  // Run every hour at :00
  cron.schedule('0 * * * *', async () => {
    console.log('⏰ Running reminder job…');

    try {
      // Find bookings happening in ~24 hours (between 23h and 25h from now)
      await sendReminders(23, 25, '24-hour');

      // Find bookings happening in ~1 hour (between 0.5h and 1.5h from now)
      await sendReminders(0.5, 1.5, '1-hour');
    } catch (err) {
      console.error('❌ Reminder job error:', err.message);
    }
  });

  console.log('📅 Reminder cron job scheduled (runs every hour).');
}

/**
 * Query bookings in a time window and send reminders.
 * @param {number} hoursMin — lower bound (hours from now)
 * @param {number} hoursMax — upper bound (hours from now)
 * @param {string} label    — for logging ("24-hour" or "1-hour")
 */
async function sendReminders(hoursMin, hoursMax, label) {
  const [bookings] = await pool.execute(
    `SELECT b.id, b.phone_number, b.slot_datetime, b.party_size,
            s.name AS service_name
     FROM bookings b
     JOIN services s ON s.id = b.service_id
     WHERE b.status = 'confirmed'
       AND b.reminder_sent = FALSE
       AND b.slot_datetime BETWEEN DATE_ADD(NOW(), INTERVAL ? HOUR)
                                AND DATE_ADD(NOW(), INTERVAL ? HOUR)`,
    [hoursMin, hoursMax]
  );

  for (const booking of bookings) {
    const dt = new Date(booking.slot_datetime);
    const dateStr = dt.toISOString().slice(0, 10);
    const timeStr = dt.toTimeString().slice(0, 5);

    const message =
      `⏰ Reminder: You have a ${booking.service_name} booking ` +
      `on ${dateStr} at ${timeStr}. ` +
      `Booking ID: #${booking.id}. See you soon! 😊`;

    try {
      await sendTextMessage(booking.phone_number, message);

      // Mark reminder as sent (only for the 1-hour reminder to avoid re-sending)
      if (label === '1-hour') {
        await pool.execute(
          'UPDATE bookings SET reminder_sent = TRUE WHERE id = ?',
          [booking.id]
        );
      }

      console.log(`📤 ${label} reminder sent to ${booking.phone_number} for booking #${booking.id}`);
    } catch (err) {
      console.error(`❌ Failed to send ${label} reminder for booking #${booking.id}:`, err.message);
    }
  }
}

module.exports = { startReminderJob };
