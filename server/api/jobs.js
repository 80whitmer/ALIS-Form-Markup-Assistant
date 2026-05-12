const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { runFormMarkupJob } = require('../services/form-markup');

const router = express.Router();

// POST /api/jobs - Submit a new PDF for analysis
router.post('/', async (req, res, next) => {
  try {
    const { pdf, company_name, document_title, ocr_radius = 100, form_template } = req.body;

    if (!pdf || !company_name || !document_title) {
      return res.status(400).json({
        error: 'Missing required fields: pdf, company_name, document_title'
      });
    }

    // Validate base64 PDF
    if (typeof pdf !== 'string' || !pdf.startsWith('data:application/pdf')) {
      return res.status(400).json({
        error: 'Invalid PDF format. Expected base64 data URL.'
      });
    }

    const jobId = uuidv4();

    // Create job directory
    const jobDir = path.join(__dirname, '../jobs', jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    // Save input PDF
    const pdfBuffer = Buffer.from(pdf.split(',')[1], 'base64');
    const inputPath = path.join(jobDir, 'input.pdf');
    fs.writeFileSync(inputPath, pdfBuffer);

    // Create job record
    await db.run(
      `INSERT INTO jobs (id, company_name, document_title, ocr_radius, form_template, status)
       VALUES (?, ?, ?, ?, ?, 'analyzing')`,
      [jobId, company_name, document_title, ocr_radius, form_template || null]
    );

    // Start analysis in background (non-blocking)
    setImmediate(() => {
      runFormMarkupJob(jobId, {
        pdfPath: inputPath,
        companyName: company_name,
        documentTitle: document_title,
        ocrSearchRadius: ocr_radius,
        formTemplate: form_template
      }).catch(err => {
        console.error(`Job ${jobId} failed:`, err.message);
        db.run(
          `UPDATE jobs SET status = ?, error_message = ? WHERE id = ?`,
          ['failed', err.message, jobId]
        );
      });
    });

    res.status(202).json({
      jobId,
      status: 'analyzing',
      createdAt: new Date().toISOString()
    });

  } catch (err) {
    next(err);
  }
});

// GET /api/jobs - List all jobs with filtering
router.get('/', async (req, res, next) => {
  try {
    const { company, status, search, limit = 50, offset = 0 } = req.query;

    let sql = 'SELECT * FROM jobs';
    let params = [];
    let conditions = [];

    if (company) {
      conditions.push('company_name = ?');
      params.push(company);
    }

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('(document_title LIKE ? OR company_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Get total count
    const countResult = await db.get(
      `SELECT COUNT(*) as total FROM jobs ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}`,
      params
    );

    // Get paginated results
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const jobs = await db.all(sql, params);

    res.json({
      jobs,
      total: countResult.total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:jobId - Get job details
router.get('/:jobId', async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const job = await db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const versions = await db.all(
      'SELECT * FROM job_versions WHERE job_id = ? ORDER BY created_at DESC',
      [jobId]
    );

    const suggestions = await db.all(
      'SELECT * FROM suggestions WHERE job_id = ? ORDER BY field_page, id',
      [jobId]
    );

    res.json({
      job,
      versions,
      suggestions,
      summary: {
        total: suggestions.length,
        approved: suggestions.filter(s => s.approval_status === 'approved').length,
        reviewed: suggestions.filter(s => s.approval_status === 'review_needed').length,
        rejected: suggestions.filter(s => s.approval_status === 'rejected').length,
        autoApproved: suggestions.filter(s => s.approval_status === 'auto_approve').length
      }
    });

  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:jobId/suggestions - Fetch suggestions with optional filtering
router.get('/:jobId/suggestions', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { signer, page, approval_status } = req.query;

    const job = await db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let sql = 'SELECT * FROM suggestions WHERE job_id = ?';
    let params = [jobId];
    let conditions = [];

    if (signer) {
      conditions.push('signer = ?');
      params.push(signer);
    }

    if (page) {
      conditions.push('field_page = ?');
      params.push(parseInt(page));
    }

    if (approval_status) {
      conditions.push('approval_status = ?');
      params.push(approval_status);
    }

    if (conditions.length > 0) {
      sql += ' AND ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY field_page, id';

    const suggestions = await db.all(sql, params);

    res.json({
      jobId,
      status: job.status,
      suggestions,
      summary: {
        total: suggestions.length,
        approved: suggestions.filter(s => s.approval_status === 'approved').length,
        reviewed: suggestions.filter(s => s.approval_status === 'review_needed').length
      }
    });

  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:jobId/apply - Apply suggestions to PDF
router.post('/:jobId/apply', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { suggestions: editedSuggestions } = req.body;

    const job = await db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!editedSuggestions || !Array.isArray(editedSuggestions)) {
      return res.status(400).json({ error: 'Invalid suggestions array' });
    }

    // TODO: Implement property-applier to modify PDF
    // For now, return a placeholder response
    const { applyChangesToPDF } = require('../services/property-applier');

    const inputPath = path.join(__dirname, '../jobs', jobId, 'input.pdf');
    const outputPath = path.join(__dirname, '../jobs', jobId, 'output.pdf');

    const result = await applyChangesToPDF(inputPath, editedSuggestions, outputPath);

    // Archive both PDFs
    const archiveDir = path.join(
      __dirname,
      '../archived',
      job.company_name.replace(/[^a-z0-9]/gi, '_'),
      new Date().toISOString().split('T')[0]
    );
    fs.mkdirSync(archiveDir, { recursive: true });

    const docName = job.document_title.replace(/[^a-z0-9]/gi, '_');
    const originalArchivePath = path.join(archiveDir, `original-${docName}.pdf`);
    const appliedArchivePath = path.join(archiveDir, `applied-${docName}.pdf`);

    fs.copyFileSync(inputPath, originalArchivePath);
    fs.copyFileSync(outputPath, appliedArchivePath);

    // Record versions
    await db.run(
      `INSERT INTO job_versions (job_id, version_type, file_path, suggestion_count, approved_count)
       VALUES (?, ?, ?, ?, ?)`,
      [jobId, 'original', originalArchivePath, editedSuggestions.length, 0]
    );

    await db.run(
      `INSERT INTO job_versions (job_id, version_type, file_path, suggestion_count, approved_count)
       VALUES (?, ?, ?, ?, ?)`,
      [jobId, 'applied', appliedArchivePath, editedSuggestions.length, editedSuggestions.filter(s => s.approval_status === 'approved').length]
    );

    // Update job status
    await db.run(
      `UPDATE jobs SET status = ?, completed_at = ? WHERE id = ?`,
      ['applied', new Date().toISOString(), jobId]
    );

    // Return modified PDF as base64
    const outputBuffer = fs.readFileSync(outputPath);
    const pdfBase64 = outputBuffer.toString('base64');

    res.json({
      jobId,
      status: 'applied',
      pdf: `data:application/pdf;base64,${pdfBase64}`,
      archivePaths: {
        original: originalArchivePath,
        applied: appliedArchivePath
      }
    });

  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:jobId/stream - Server-Sent Events for real-time progress
router.get('/:jobId/stream', (req, res, next) => {
  try {
    const { jobId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial comment to keep connection alive
    res.write(': Server-Sent Events connection established\n\n');

    // Poll database for job status updates
    const pollInterval = setInterval(async () => {
      try {
        const job = await db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);

        if (!job) {
          clearInterval(pollInterval);
          res.write('event: error\ndata: {"error":"Job not found"}\n\n');
          res.end();
          return;
        }

        // Send job status
        res.write(`event: job_status\ndata: ${JSON.stringify(job)}\n\n`);

        // If job is done, send suggestions and close
        if (['applied', 'failed', 'completed'].includes(job.status)) {
          const suggestions = await db.all('SELECT * FROM suggestions WHERE job_id = ?', [jobId]);
          res.write(`event: suggestions\ndata: ${JSON.stringify(suggestions)}\n\n`);
          clearInterval(pollInterval);
          res.end();
        }

      } catch (err) {
        console.error('SSE poll error:', err);
        clearInterval(pollInterval);
        res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    }, 1000);

    // Cleanup on client disconnect
    req.on('close', () => {
      clearInterval(pollInterval);
      res.end();
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
