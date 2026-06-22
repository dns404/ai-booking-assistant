/**
 * server.js — Entry point for the AI Booking Assistant.
 *
 * Starts Express, registers API routes, and kicks off the reminder cron job.
 */
const express = require('express');
const config = require('./config/config');
const apiRoutes = require('./routes/api');
const errorHandler = require('./middleware/errorHandler');
const { startReminderJob } = require('./scheduler/reminderJob');

const app = express();

// ─── Middleware ──────────────────────────────────────────────
app.use(express.json());

// ─── Health check ───────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'AI Booking Assistant',
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ─────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ─── Error handler (must be last) ───────────────────────────
app.use(errorHandler);

// ─── Start ──────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`🚀 AI Booking Assistant running on port ${config.port}`);
  console.log(`   Environment : ${config.nodeEnv}`);
  console.log(`   API URL     : http://localhost:${config.port}/api`);

  // Start the reminder cron job
  startReminderJob();
});
