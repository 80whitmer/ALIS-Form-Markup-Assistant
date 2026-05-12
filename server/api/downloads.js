const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');

const router = express.Router();

// GET /api/downloads/jobs/:jobId/output - Download modified PDF
router.get('/jobs/:jobId/output', async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const job = await db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const outputPath = path.join(__dirname, '../jobs', jobId, 'output.pdf');

    if (!fs.existsSync(outputPath)) {
      return res.status(404).json({ error: 'PDF not found. Job may not have been applied yet.' });
    }

    const filename = `${job.document_title}-applied.pdf`.replace(/[^a-z0-9.-]/gi, '_');

    res.download(outputPath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
    });

  } catch (err) {
    next(err);
  }
});

// GET /api/downloads/jobs/:jobId/input - Download original PDF
router.get('/jobs/:jobId/input', async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const job = await db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const inputPath = path.join(__dirname, '../jobs', jobId, 'input.pdf');

    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const filename = `${job.document_title}-original.pdf`.replace(/[^a-z0-9.-]/gi, '_');

    res.download(inputPath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
