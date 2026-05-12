const path = require('path');
const db = require('../db/database');
const { detectFieldsFromPDF } = require('../../form-markup-poc/field-detector');
const { extractTextNearFields } = require('../../form-markup-poc/label-extractor');
const { generatePropertySuggestions } = require('../../form-markup-poc/property-suggester');

/**
 * Orchestrate the complete form markup analysis pipeline
 *
 * Emits database updates for real-time progress tracking via SSE
 *
 * @param {string} jobId - Unique job identifier
 * @param {object} options - Configuration options
 *   - pdfPath: Full path to input PDF
 *   - companyName: Company/facility name
 *   - documentTitle: Document title
 *   - ocrSearchRadius: OCR text search radius (default 100px)
 *   - formTemplate: Optional form template ID for suggestions
 */
async function runFormMarkupJob(jobId, options) {
  const {
    pdfPath,
    companyName,
    documentTitle,
    ocrSearchRadius = 100,
    formTemplate
  } = options;

  console.log(`[${jobId}] Starting form markup analysis...`);

  try {
    // Phase 1: Detect fields
    console.log(`[${jobId}] Phase 1: Detecting AcroForm fields...`);
    const fields = await detectFieldsFromPDF(pdfPath);
    console.log(`[${jobId}] Detected ${fields.length} fields`);

    if (fields.length === 0) {
      throw new Error('No AcroForm fields found in PDF. Is this a form?');
    }

    // Phase 2: Extract labels via OCR
    console.log(`[${jobId}] Phase 2: Extracting labels via OCR (radius: ${ocrSearchRadius}px)...`);
    const labels = await extractTextNearFields(pdfPath, fields, ocrSearchRadius);
    console.log(`[${jobId}] Extracted labels for ${Object.keys(labels).length} fields`);

    // Phase 3: Generate suggestions via fuzzy matching
    console.log(`[${jobId}] Phase 3: Matching to ALIS codes...`);
    const suggestions = await generatePropertySuggestions(labels, formTemplate);
    console.log(`[${jobId}] Generated ${suggestions.length} suggestions`);

    // Phase 4: Store suggestions in database
    console.log(`[${jobId}] Phase 4: Storing suggestions in database...`);
    for (const suggestion of suggestions) {
      await db.run(
        `INSERT INTO suggestions (
          job_id, field_page, field_name, field_type, suggested_code,
          signer, anchor_name, required, read_only, confidence, approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          jobId,
          suggestion.page || 1,
          suggestion.original_label || suggestion.field_name,
          suggestion.field_type,
          suggestion.code,
          suggestion.signer || 'unassigned',
          suggestion.anchor || `${suggestion.signer || 'field'}.${suggestion.field_type}.${suggestion.page || 1}`,
          suggestion.required ? 1 : 0,
          suggestion.read_only ? 1 : 0,
          suggestion.confidence || 0,
          suggestion.approval_status || 'review_needed'
        ]
      );
    }

    // Update job status to 'reviewed'
    await db.run(
      `UPDATE jobs SET status = ?, completed_at = ? WHERE id = ?`,
      ['reviewed', new Date().toISOString(), jobId]
    );

    console.log(`[${jobId}] Job completed successfully`);
    return {
      jobId,
      status: 'reviewed',
      totalFields: fields.length,
      suggestionsGenerated: suggestions.length
    };

  } catch (err) {
    console.error(`[${jobId}] Job failed:`, err.message);

    // Update job with error status
    await db.run(
      `UPDATE jobs SET status = ?, error_message = ?, completed_at = ? WHERE id = ?`,
      ['failed', err.message, new Date().toISOString(), jobId]
    );

    throw err;
  }
}

module.exports = {
  runFormMarkupJob
};
