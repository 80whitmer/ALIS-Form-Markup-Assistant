const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize database
const db = require('./db/database');
db.initialize();

// Routes
app.use('/api/jobs', require('./api/jobs'));
app.use('/api/downloads', require('./api/downloads'));

// Development endpoints (dev mode only)
if (process.env.NODE_ENV === 'development') {
  app.use('/api/dev', require('./api/dev'));
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   ALIS Form Markup Assistant               ║
║   Server running on http://localhost:${PORT}    ║
╚════════════════════════════════════════════╝
  `);
});

module.exports = app;
