/**
 * Development-only endpoints
 * These endpoints are only available in development mode
 * They provide utilities for testing and debugging
 */

const express = require('express');
const db = require('../db/database');

const router = express.Router();

/**
 * Middleware to restrict to development mode only
 */
function devOnly(req, res, next) {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      error: 'This endpoint is only available in development mode'
    });
  }
  next();
}

/**
 * POST /api/dev/reset-database
 * Reset the database and recreate schema
 * DEVELOPMENT ONLY
 */
router.post('/reset-database', devOnly, async (req, res, next) => {
  try {
    const result = await db.reset();
    res.json({
      success: true,
      message: 'Database reset successfully',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error resetting database:', err.message);
    res.status(500).json({
      error: 'Failed to reset database',
      message: err.message
    });
  }
});

/**
 * GET /api/dev/info
 * Get development environment info
 */
router.get('/info', devOnly, (req, res) => {
  res.json({
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    devEndpoints: [
      'POST /api/dev/reset-database - Reset database',
      'GET /api/dev/info - This endpoint'
    ]
  });
});

module.exports = router;
