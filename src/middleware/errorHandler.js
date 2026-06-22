/**
 * errorHandler.js
 *
 * Central Express error-handling middleware.
 * Must be registered AFTER all routes.
 */

/**
 * Logs the error and sends a clean JSON response.
 */
function errorHandler(err, req, res, _next) {
  console.error('💥 Unhandled error:', err.stack || err.message);

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
}

module.exports = errorHandler;
