/**
 * availabilityTool.js
 *
 * Queries the availability_slots table for open slots matching
 * the requested service, date, and optional time.
 */
const pool = require('../models/db');

/**
 * Check slot availability.
 * @param {string} serviceName — e.g. "Haircut"
 * @param {string} date        — YYYY-MM-DD
 * @param {string} [time]      — HH:MM (optional; if omitted returns all open slots for the day)
 * @returns {object} { available: boolean, slots: string[] }
 */
async function checkAvailability(serviceName, date, time) {
  // Look up service
  const [services] = await pool.execute(
    'SELECT id, name, duration_minutes, price FROM services WHERE LOWER(name) = LOWER(?)',
    [serviceName]
  );

  if (services.length === 0) {
    return {
      available: false,
      message: `Service "${serviceName}" not found. Available services: Haircut, Hair Coloring, Beard Trim, Facial, Manicure.`,
    };
  }

  const service = services[0];

  // Build query for open slots on the given date
  let query = `
    SELECT slot_datetime
    FROM availability_slots
    WHERE service_id = ?
      AND DATE(slot_datetime) = ?
      AND is_booked = FALSE
  `;
  const params = [service.id, date];

  // If a specific time was requested, narrow the window to ±1 hour
  if (time) {
    query += ` AND TIME(slot_datetime) BETWEEN SUBTIME(?, '01:00:00') AND ADDTIME(?, '01:00:00')`;
    params.push(time, time);
  }

  query += ' ORDER BY slot_datetime LIMIT 10';

  const [rows] = await pool.execute(query, params);

  if (rows.length === 0) {
    // No exact match — fetch all available slots for this service on the same date
    const [allDaySlots] = await pool.execute(
      `SELECT slot_datetime FROM availability_slots
       WHERE service_id = ? AND DATE(slot_datetime) = ? AND is_booked = FALSE
       ORDER BY slot_datetime LIMIT 15`,
      [service.id, date]
    );

    if (allDaySlots.length > 0) {
      const availableSlots = allDaySlots.map((r) => {
        const dt = new Date(r.slot_datetime);
        return dt.toISOString().slice(0, 16).replace('T', ' ');
      });

      return {
        available: false,
        service: service.name,
        date,
        message: `No slots for ${service.name} around ${time} on ${date}, but other slots are available on the same day.`,
        available_slots: availableSlots,
      };
    }

    // No slots at all on that date — check the next 3 days
    const [nearbySlots] = await pool.execute(
      `SELECT slot_datetime FROM availability_slots
       WHERE service_id = ? AND DATE(slot_datetime) > ? AND is_booked = FALSE
       ORDER BY slot_datetime LIMIT 10`,
      [service.id, date]
    );

    const nearbyList = nearbySlots.map((r) => {
      const dt = new Date(r.slot_datetime);
      return dt.toISOString().slice(0, 16).replace('T', ' ');
    });

    return {
      available: false,
      service: service.name,
      date,
      message: `No available slots for ${service.name} on ${date}.${nearbyList.length > 0 ? ' Here are the nearest available slots:' : ' No upcoming slots found.'}`,
      available_slots: nearbyList,
    };
  }

  const slots = rows.map((r) => {
    const dt = new Date(r.slot_datetime);
    return dt.toISOString().slice(0, 16).replace('T', ' ');
  });

  return {
    available: true,
    service: service.name,
    price: service.price,
    duration_minutes: service.duration_minutes,
    date,
    slots,
    message: `Found ${slots.length} available slot(s) for ${service.name} on ${date}.`,
  };
}

module.exports = { checkAvailability };
