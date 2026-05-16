#!/usr/bin/env node

/**
 * server.js
 *
 * Main Express.js server for ALIS Form Markup Assistant
 * Exposes REST API for PDF field detection, suggestion generation, and field updating
 *
 * Endpoints:
 * POST   /api/form-markup/upload      - Upload PDF and detect fields
 * GET    /api/form-markup/:jobId      - Get job status and suggestions
 * POST   /api/form-markup/:jobId/approve - Approve suggestions and apply changes
 * GET    /download/:jobId/:filename   - Download processed PDF
 *
 * Start: npm start
 * Dev:   npm run dev
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// Import API handlers
const {
  handleUpload,
  handleGetJob,
  handleApprove,
  handleDownload,
  ensureJobDir
} = require('./server/api-handlers');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /api/status
 * Server status endpoint
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    port: PORT,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// Form Markup API Routes (v1)
// ============================================================================

/**
 * POST /api/form-markup/upload
 * Upload PDF and start form markup job
 */
app.post('/api/form-markup/upload', upload.single('pdf'), handleUpload);

/**
 * GET /api/form-markup/:jobId
 * Get job status and current suggestions
 */
app.get('/api/form-markup/:jobId', handleGetJob);

/**
 * POST /api/form-markup/:jobId/approve
 * Approve suggestions and apply to PDF
 */
app.post('/api/form-markup/:jobId/approve', express.json({ limit: '50mb' }), handleApprove);

/**
 * GET /download/:jobId/:filename
 * Download processed PDF
 */
app.get('/download/:jobId/:filename', handleDownload);

// ============================================================================
// Jobs API Routes (v2 - Unified Interface)
// ============================================================================

// In-memory job tracking (for demo; would be database in production)
const jobs = {};

/**
 * POST /api/jobs
 * Create a new job (unified endpoint for both auto-edit and manual-edit)
 */
app.post('/api/jobs', upload.single('pdf'), async (req, res) => {
  try {
    // Use handleUpload which manages job creation
    await handleUpload(req, res);
  } catch (err) {
    console.error('[server] Error in /api/jobs:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs/:jobId
 * Get job details and current status
 */
app.get('/api/jobs/:jobId', async (req, res) => {
  const { jobId } = req.params;

  try {
    // Use handleGetJob for compatibility
    await handleGetJob(req, res);
  } catch (err) {
    console.error('[server] Error in GET /api/jobs/:jobId:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jobs/:jobId/apply
 * Apply suggestions and generate PDF
 */
app.post('/api/jobs/:jobId/apply', express.json({ limit: '50mb' }), async (req, res) => {
  const { jobId } = req.params;

  try {
    // Use handleApprove for compatibility
    await handleApprove(req, res);
  } catch (err) {
    console.error('[server] Error in /api/jobs/:jobId/apply:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs/:jobId/progress
 * Get job progress for polling
 */
app.get('/api/jobs/:jobId/progress', async (req, res) => {
  const { jobId } = req.params;

  try {
    const job = jobs[jobId];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Calculate progress based on completion
    let percentage = 50; // Default: in progress
    if (job.status === 'completed' || job.status === 'applied') {
      percentage = 100;
    }

    res.json({
      jobId,
      status: job.status,
      percentage,
      label: job.label || 'Analyzing PDF...',
      created_at: job.created_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jobs/:jobId/suggestions
 * Update suggestions for a job
 */
app.post('/api/jobs/:jobId/suggestions', express.json({ limit: '50mb' }), async (req, res) => {
  const { jobId } = req.params;
  const { suggestions } = req.body;

  try {
    if (!jobs[jobId]) {
      return res.status(404).json({ error: 'Job not found' });
    }

    jobs[jobId].suggestions = suggestions;
    jobs[jobId].status = 'review_needed';

    res.json({
      success: true,
      jobId,
      message: 'Suggestions updated',
      suggestionCount: suggestions.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs/:jobId/download
 * Download the processed PDF
 */
app.get('/api/jobs/:jobId/download', (req, res) => {
  const { jobId } = req.params;

  try {
    if (!jobs[jobId]) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobs[jobId];
    const outputPath = path.join(job.jobDir, 'output.pdf');

    if (!fs.existsSync(outputPath)) {
      return res.status(404).json({ error: 'Output PDF not found' });
    }

    res.download(outputPath, `${jobId}-markup.pdf`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs
 * List all jobs
 */
app.get('/api/jobs', (req, res) => {
  try {
    const jobList = Object.entries(jobs).map(([jobId, job]) => ({
      jobId,
      status: job.status,
      filename: job.filename,
      created_at: job.created_at,
      suggestion_count: job.suggestions ? job.suggestions.length : 0
    }));

    res.json({
      total: jobList.length,
      jobs: jobList
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * 404 Not Found handler
 */
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  console.error('[server] Error:', err.message);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      status: 'error',
      message: `File upload error: ${err.message}`
    });
  }

  if (err.message && err.message.includes('Only PDF files')) {
    return res.status(400).json({
      status: 'error',
      message: err.message
    });
  }

  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('ALIS Form Markup Assistant - Server Running');
  console.log('='.repeat(60));
  console.log(`Server:    http://localhost:${PORT}`);
  console.log(`Health:    http://localhost:${PORT}/health`);
  console.log(`Status:    http://localhost:${PORT}/api/status`);
  console.log('\nAPI Endpoints:');
  console.log(`  POST   /api/form-markup/upload           - Upload PDF`);
  console.log(`  GET    /api/form-markup/:jobId           - Get suggestions`);
  console.log(`  POST   /api/form-markup/:jobId/approve   - Apply changes`);
  console.log(`  GET    /download/:jobId/:filename        - Download PDF`);
  console.log(`\n  POST   /api/jobs                         - Create job`);
  console.log(`  GET    /api/jobs                         - List jobs`);
  console.log(`  GET    /api/jobs/:jobId                  - Get job`);
  console.log(`  POST   /api/jobs/:jobId/apply            - Apply suggestions`);
  console.log(`  GET    /api/jobs/:jobId/progress         - Get progress`);
  console.log(`  GET    /api/jobs/:jobId/download         - Download PDF`);
  console.log('='.repeat(60) + '\n');
});

module.exports = app;
