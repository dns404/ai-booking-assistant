/**
 * seed.js — Populate services & availability_slots with sample data.
 * Usage: npm run seed
 *
 * Change the `services` array below to match your chosen vertical.
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function seed() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ai_booking',
  });

  // ── Sample services (salon vertical) ──
  const services = [
    { name: 'Haircut', duration: 30, price: 25.0, desc: 'Standard haircut' },
    { name: 'Hair Coloring', duration: 60, price: 75.0, desc: 'Full hair coloring' },
    { name: 'Beard Trim', duration: 15, price: 15.0, desc: 'Beard shaping & trim' },
    { name: 'Facial', duration: 45, price: 50.0, desc: 'Deep cleanse facial' },
    { name: 'Manicure', duration: 30, price: 20.0, desc: 'Classic manicure' },
  ];

  console.log('⏳ Seeding services…');
  for (const s of services) {
    await connection.execute(
      `INSERT IGNORE INTO services (name, duration_minutes, price, description) VALUES (?, ?, ?, ?)`,
      [s.name, s.duration, s.price, s.desc]
    );
  }

  // ── Generate availability slots for the next 7 days, 9 AM – 6 PM ──
  console.log('⏳ Seeding availability slots…');
  const [rows] = await connection.execute('SELECT id, duration_minutes FROM services');

  for (const service of rows) {
    for (let day = 0; day < 7; day++) {
      const date = new Date();
      date.setDate(date.getDate() + day);
      date.setHours(9, 0, 0, 0);

      // Create slots from 9:00 to 18:00 based on service duration
      while (date.getHours() < 18) {
        const slotDatetime = date.toISOString().slice(0, 19).replace('T', ' ');
        await connection.execute(
          `INSERT IGNORE INTO availability_slots (service_id, slot_datetime) VALUES (?, ?)`,
          [service.id, slotDatetime]
        );
        date.setMinutes(date.getMinutes() + service.duration_minutes);
      }
    }
  }

  console.log('✅ Seeding complete.');
  await connection.end();
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err.message);
  process.exit(1);
});
