/**
 * confirmTool.js
 *
 * Finalizes a booking: marks the slot as booked and inserts a bookings row.
 */
const pool = require('../models/db');

/**
 * Confirm a booking.
 * @param {string} phoneNumber  — customer phone
 * @param {string} serviceName  — e.g. "Haircut"
 * @param {string} slotDatetime — "YYYY-MM-DD HH:MM"
 * @param {number} [partySize]  — default 1
 * @returns {object}
 */
async function confirmBooking(phoneNumber, serviceName, slotDatetime, partySize = 1) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Look up service
    const [services] = await conn.execute(
      'SELECT id, name FROM services WHERE LOWER(name) = LOWER(?)',
      [serviceName]
    );

    if (services.length === 0) {
      await conn.rollback();
      return { success: false, message: `Service "${serviceName}" not found.` };
    }

    const service = services[0];

    // 2. Find matching open slot (exact datetime match, ± 1 minute tolerance)
    const [slots] = await conn.execute(
      `SELECT id, slot_datetime
       FROM availability_slots
       WHERE service_id = ?
         AND is_booked = FALSE
         AND ABS(TIMESTAMPDIFF(MINUTE, slot_datetime, ?)) <= 1
       LIMIT 1
       FOR UPDATE`,
      [service.id, slotDatetime]
    );

    if (slots.length === 0) {
      await conn.rollback();
      return {
        success: false,
        message: `The slot at ${slotDatetime} for ${service.name} is no longer available.`,
      };
    }

    const slot = slots[0];

    // 3. Mark slot as booked
    await conn.execute(
      'UPDATE availability_slots SET is_booked = TRUE WHERE id = ?',
      [slot.id]
    );

    // 4. Insert booking
    const [result] = await conn.execute(
      `INSERT INTO bookings (phone_number, service_id, slot_id, slot_datetime, party_size, status)
       VALUES (?, ?, ?, ?, ?, 'confirmed')`,
      [phoneNumber, service.id, slot.id, slot.slot_datetime, partySize]
    );

    await conn.commit();

    const dt = new Date(slot.slot_datetime);
    const formattedDate = dt.toISOString().slice(0, 10);
    const formattedTime = dt.toTimeString().slice(0, 5);

    return {
      success: true,
      booking_id: result.insertId,
      service: service.name,
      date: formattedDate,
      time: formattedTime,
      party_size: partySize,
      message: `Booking confirmed! ${service.name} on ${formattedDate} at ${formattedTime}. Booking ID: #${result.insertId}.`,
    };
  } catch (err) {
    await conn.rollback();
    console.error('❌ confirmBooking error:', err.message);
    return { success: false, message: 'Failed to confirm booking. Please try again.' };
  } finally {
    conn.release();
  }
}

module.exports = { confirmBooking };
