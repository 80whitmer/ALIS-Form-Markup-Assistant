const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { runFormMarkupJob } = require('../services/form-markup');
const { runManualEditJob } = require('../services/manual-edit-markup');

const router = express.Router();

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// POST /api/jobs - Submit a new PDF for analysis
router.post('/', upload.single('pdf'), async (req, res, next) => {
  try {
    // Handle both FormData (from frontend) and legacy base64 JSON
    let pdfBuffer;
    const { company_name, document_title, ocr_radius = 100, form_template, signers = [], workflow_type = 'auto_edit' } = req.body;

    // Get PDF either from multer file or from base64 body
    if (req.file) {
      // FormData: file is in req.file
      pdfBuffer = req.file.buffer;
    } else if (req.body.pdf && req.body.pdf.startsWith('data:application/pdf')) {
      // Legacy: base64 data URL in body
      pdfBuffer = Buffer.from(req.body.pdf.split(',')[1], 'base64');
    } else {
      return res.status(400).json({
        error: 'Missing required field: pdf file'
      });
    }

    if (!company_name || !document_title) {
      return res.status(400).json({
        error: 'Missing required fields: company_name, document_title'
      });
    }

    // Validate workflow type
    if (!['auto_edit', 'manual_edit'].includes(workflow_type)) {
      return res.status(400).json({
        error: 'Invalid workflow_type. Must be "auto_edit" or "manual_edit"'
      });
    }

    const jobId = uuidv4();

    // Create job directory
    const jobDir = path.join(__dirname, '../jobs', jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    // Save input PDF
    const inputPath = path.join(jobDir, 'input.pdf');
    fs.writeFileSync(inputPath, pdfBuffer);

    // Store signers as JSON string
    const signersJSON = signers && signers.length > 0 ? JSON.stringify(signers) : null;

    // Create job record with workflow type
    await db.run(
      `INSERT INTO jobs (id, company_name, document_title, ocr_radius, form_template, signers, workflow_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'analyzing')`,
      [jobId, company_name, document_title, ocr_radius, form_template || null, signersJSON, workflow_type]
    );

    // Start analysis in background (non-blocking)
    setImmediate(() => {
      // Route to appropriate job processor based on workflow type
      const jobProcessor = workflow_type === 'manual_edit' ? runManualEditJob : runFormMarkupJob;

      jobProcessor(jobId, {
        pdfPath: inputPath,
        companyName: company_name,
        documentTitle: document_title,
        ocrSearchRadius: ocr_radius,
        formTemplate: form_template,
        signers: signers || []
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
      workflowType: workflow_type,
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

// PATCH /api/jobs/:jobId/suggestions - Update suggestions (auto-save for bulk operations)
router.patch('/:jobId/suggestions', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { suggestions: suggestionsToUpdate } = req.body;

    const job = await db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!suggestionsToUpdate || !Array.isArray(suggestionsToUpdate)) {
      return res.status(400).json({ error: 'Invalid suggestions array' });
    }

    // Update each suggestion in the database
    let updatedCount = 0;
    for (const suggestion of suggestionsToUpdate) {
      await db.run(
        `UPDATE suggestions
         SET field_name = ?, signer = ?, required = ?, read_only = ?, field_type = ?
         WHERE job_id = ? AND field_name = ?`,
        [
          suggestion.field_name,
          suggestion.signer || null,
          suggestion.required ? 1 : 0,
          suggestion.read_only ? 1 : 0,
          suggestion.field_type,
          jobId,
          suggestion.field_name_original || suggestion.field_name
        ]
      );
      updatedCount++;
    }

    // Fetch updated suggestions to return
    const updatedSuggestions = await db.all(
      'SELECT * FROM suggestions WHERE job_id = ? ORDER BY field_page, id',
      [jobId]
    );

    res.json({
      jobId,
      message: `Updated ${updatedCount} suggestions`,
      suggestions: updatedSuggestions,
      updatedCount
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

// GET /api/jobs/:jobId/progress - Get current job progress for loading bar
router.get('/:jobId/progress', async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const job = await db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Calculate progress based on status and phase
    let percentage = 0;
    let phaseDisplay = job.progress_phase || 'Initializing';

    switch (job.status) {
      case 'analyzing':
        // Map phase to percentage
        if (phaseDisplay.includes('Detecting')) percentage = 15;
        else if (phaseDisplay.includes('Generating suggestions')) percentage = 35;
        else if (phaseDisplay.includes('Generating previews')) percentage = 65;
        else if (phaseDisplay.includes('Storing')) percentage = 85;
        else percentage = 50;
        break;
      case 'completed':
      case 'applied':
        percentage = 100; // Done
        phaseDisplay = 'Complete';
        break;
      case 'failed':
        percentage = 100;
        phaseDisplay = 'Failed';
        break;
      default:
        percentage = 25;
    }

    res.json({
      jobId,
      status: job.status,
      percentage: Math.min(Math.max(percentage, 0), 100),
      phase: phaseDisplay,
      label: job.document_title || 'Processing PDF',
      updated_at: job.updated_at || job.created_at
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

// DELETE /api/jobs/:jobId - Delete a job and all its related records
router.delete('/:jobId', async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const job = await db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Delete all suggestions for this job
    await db.run('DELETE FROM suggestions WHERE job_id = ?', [jobId]);

    // Delete all versions for this job
    await db.run('DELETE FROM job_versions WHERE job_id = ?', [jobId]);

    // Delete the job record
    await db.run('DELETE FROM jobs WHERE id = ?', [jobId]);

    // Delete job directory and files
    const jobDir = path.join(__dirname, '../jobs', jobId);
    if (fs.existsSync(jobDir)) {
      fs.rmSync(jobDir, { recursive: true, force: true });
    }

    res.json({
      success: true,
      message: 'Job deleted successfully',
      jobId
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
