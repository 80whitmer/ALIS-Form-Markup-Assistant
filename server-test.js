#!/usr/bin/env node

/**
 * server-test.js
 * Simplified test server with enhanced debugging
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Enhanced logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('  Body:', JSON.stringify(req.body).substring(0, 200));
  }
  next();
});

// Multer for uploads with detailed logging
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    console.log(`  [multer] File received: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);
    cb(null, true);
  }
});

// In-memory job storage
const jobs = {};

// ============================================================================
// HEALTH & STATUS
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    port: PORT,
    version: '1.0.0-test',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// UNIFIED JOBS API
// ============================================================================

/**
 * POST /api/jobs
 * Create a new job
 */
app.post('/api/jobs', upload.single('pdf'), (req, res) => {
  try {
    console.log(`  [api] POST /api/jobs`);
    console.log(`  [api] File present: ${!!req.file}`);
    console.log(`  [api] Body keys: ${Object.keys(req.body).join(', ')}`);
    console.log(`  [api] workflow_type: ${req.body.workflow_type}`);

    if (!req.file) {
      console.log(`  [api] ❌ No file provided`);
      return res.status(400).json({
        error: 'No PDF file provided',
        debug: { filePresent: !!req.file, bodyKeys: Object.keys(req.body) }
      });
    }

    const jobId = uuidv4();
    const workflowType = req.body.workflow_type || 'auto_edit';

    console.log(`  [api] Workflow type: ${workflowType}`);

    if (!['auto_edit', 'manual_edit'].includes(workflowType)) {
      console.log(`  [api] ❌ Invalid workflow type: ${workflowType}`);
      return res.status(400).json({
        error: 'Invalid workflow_type. Must be "auto_edit" or "manual_edit".',
        received: workflowType
      });
    }

    // Store job in memory
    jobs[jobId] = {
      id: jobId,
      filename: req.file.originalname,
      workflow_type: workflowType,
      status: 'processing',
      created_at: new Date().toISOString(),
      suggestions: [],
      filesize: req.file.size
    };

    console.log(`  [api] ✅ Created ${workflowType} job: ${jobId}`);

    res.json({
      jobId,
      workflow_type: workflowType,
      status: 'processing',
      message: 'Job started'
    });

  } catch (err) {
    console.error('[api] ❌ Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs/:jobId
 * Get job status and suggestions
 */
app.get('/api/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs[jobId];

  console.log(`  [api] GET /api/jobs/${jobId} - Found: ${!!job}`);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    job: {
      jobId: job.id,
      workflow_type: job.workflow_type,
      status: job.status,
      filename: job.filename,
      created_at: job.created_at
    },
    suggestions: job.suggestions,
    total: job.suggestions.length
  });
});

/**
 * POST /api/jobs/:jobId/apply
 * Apply suggestions
 */
app.post('/api/jobs/:jobId/apply', express.json({ limit: '50mb' }), (req, res) => {
  const { jobId } = req.params;
  const { suggestions } = req.body;

  console.log(`  [api] POST /api/jobs/${jobId}/apply`);

  if (!jobs[jobId]) {
    console.log(`  [api] ❌ Job not found: ${jobId}`);
    return res.status(404).json({ error: 'Job not found' });
  }

  jobs[jobId].suggestions = suggestions || [];
  jobs[jobId].status = 'completed';

  console.log(`  [api] ✅ Applied ${(suggestions || []).length} suggestions`);

  res.json({
    jobId,
    status: 'completed',
    message: 'Suggestions applied',
    suggestionCount: (suggestions || []).length
  });
});

/**
 * GET /api/jobs/:jobId/progress
 * Get progress
 */
app.get('/api/jobs/:jobId/progress', (req, res) => {
  const { jobId } = req.params;
  const job = jobs[jobId];

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    jobId,
    percentage: job.status === 'completed' ? 100 : 50,
    status: job.status,
    label: job.status === 'completed' ? 'Complete' : 'Processing'
  });
});

/**
 * GET /api/jobs/:jobId/download
 * Download PDF
 */
app.get('/api/jobs/:jobId/download', (req, res) => {
  const { jobId } = req.params;
  const job = jobs[jobId];

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({ message: 'Download endpoint (mock)', jobId });
});

// Legacy compatibility
app.post('/api/form-markup/upload', upload.single('pdf'), (req, res) => {
  req.body.workflow_type = 'auto_edit';
  const uploadHandler = app._router.stack.find(r => r.route && r.route.path === '/api/jobs').handle[0];
  return uploadHandler(req, res);
});

app.get('/api/form-markup/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs[jobId];
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({
    job: {
      jobId: job.id,
      status: job.status,
      filename: job.filename
    },
    suggestions: job.suggestions
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[api] ❌ Error:', err.message);
  res.status(500).json({ error: err.message });
});

// 404
app.use((req, res) => {
  console.log(`  [api] ❌ 404: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Not found' });
});

// Start
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(70));
  console.log('ALIS Form Markup - TEST SERVER (with debugging)');
  console.log('='.repeat(70));
  console.log(`\nServer:    http://localhost:${PORT}`);
  console.log(`Health:    http://localhost:${PORT}/health`);
  console.log('\n📋 API ENDPOINTS:');
  console.log(`  POST   /api/jobs                  - Create job`);
  console.log(`  GET    /api/jobs/:jobId           - Get job`);
  console.log(`  POST   /api/jobs/:jobId/apply     - Apply suggestions`);
  console.log(`  GET    /api/jobs/:jobId/progress  - Get progress`);
  console.log('='.repeat(70) + '\n');
});

module.exports = app;
