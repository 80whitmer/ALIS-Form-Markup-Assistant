const path = require('path');
const db = require('../db/database');
const { detectFieldsFromPDF } = require('../../form-markup-poc/field-detector');
const { extractTextNearFields } = require('../../form-markup-poc/label-extractor');
const { generatePropertySuggestions } = require('../../form-markup-poc/property-suggester');
const { createFieldsFromLabels } = require('../../form-markup-poc/field-creator');

/**
 * Generate an anchor (reference point) for a field
 * Anchors help locate fields again if the document is modified
 * Format: {identifier}.{fieldType}.{pageNumber}
 *
 * If a signer is provided, use signer name as identifier (more meaningful)
 * Otherwise use field name as identifier (fallback)
 */
function generateAnchor(fieldName, fieldType, position, signer = null) {
  // Use signer name if provided and assigned, otherwise use field name
  let identifier = signer && signer !== 'unassigned' ? signer : fieldName;

  const safeName = identifier
    .replace(/[^a-zA-Z0-9]/g, '_')  // Replace special chars with underscore
    .toLowerCase()
    .substring(0, 30);               // Limit to 30 chars

  const page = position?.page || 1;
  return `${safeName}.${fieldType}.${page}`;
}

/**
 * Orchestrate the complete form markup analysis pipeline
 *
 * Emits database updates for real-time progress tracking via SSE
 *
 * Processing includes:
 *   - Detection: Extract all AcroForm fields and their properties
 *   - Labeling: OCR text near fields to identify purpose
 *   - Matching: Fuzzy match to ALIS compliance codes
 *   - Application: Apply changes to PDF with defaults:
 *     * Text boxes and signatures: outline color defaults to no color
 *     * Field naming: formatted as {alisCode}|{anchor}
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
    let fields = await detectFieldsFromPDF(pdfPath);
    console.log(`[${jobId}] Detected ${fields.length} fields`);

    // Phase 1b: If no fields found, try to create them from labels
    if (fields.length === 0) {
      console.log(`[${jobId}] Phase 1b: No AcroForm fields found, attempting to create from OCR-detected labels...`);

      try {
        // Create fields from detected text labels in the PDF
        const creationResult = await createFieldsFromLabels(pdfPath, {});

        if (creationResult.success && creationResult.fieldsCreated > 0) {
          console.log(`[${jobId}] ✓ Created ${creationResult.fieldsCreated} AcroForm fields from labels`);
          console.log(`[${jobId}]   Breakdown: ${creationResult.breakdown.text} text, ${creationResult.breakdown.signature} signature, ${creationResult.breakdown.checkbox} checkbox`);

          // Re-detect fields from the enhanced PDF
          fields = await detectFieldsFromPDF(pdfPath);
          console.log(`[${jobId}] Re-detected ${fields.length} fields in enhanced PDF`);
        } else {
          const failReason = creationResult.reason || 'Unknown reason';
          console.warn(`[${jobId}] Field creation did not produce fields: ${failReason}`);
          throw new Error(`No AcroForm fields found in PDF and field creation failed: ${failReason}`);
        }
      } catch (creationErr) {
        console.error(`[${jobId}] Field creation failed:`, creationErr.message);
        throw new Error(`No AcroForm fields found in PDF. Failed to create fields: ${creationErr.message}`);
      }
    }

    // Phase 2: Extract labels via OCR
    console.log(`[${jobId}] Phase 2: Extracting labels via OCR (radius: ${ocrSearchRadius}px)...`);
    const labels = await extractTextNearFields(pdfPath, fields, ocrSearchRadius);
    console.log(`[${jobId}] Extracted labels for ${Object.keys(labels).length} fields`);

    // Phase 3: Generate suggestions via fuzzy matching
    console.log(`[${jobId}] Phase 3: Matching to ALIS codes...`);
    const suggestions = await generatePropertySuggestions(labels, fields, formTemplate);
    console.log(`[${jobId}] Generated ${suggestions.length} suggestions`);

    // Phase 4: Store suggestions in database
    console.log(`[${jobId}] Phase 4: Storing suggestions in database...`);
    for (const suggestion of suggestions) {
      // Generate an anchor based on field name and position
      // Anchors are used to find fields again if the document is modified
      const anchorName = generateAnchor(suggestion.field_name, suggestion.field_type, suggestion.position);

      // Check if field_properties column exists, if not use older INSERT without it
      let insertSQL = `INSERT INTO suggestions (
          job_id, field_page, field_name, field_type, suggested_code,
          signer, anchor_name, required, read_only, confidence, approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      let insertParams = [
        jobId,
        suggestion.position?.page || 1,
        suggestion.field_name,           // Original PDF field name (e.g., "Text2")
        suggestion.field_type,           // Field type from PDF (e.g., "text", "checkbox")
        suggestion.suggested_code,       // ALIS code
        suggestion.signer || 'unassigned',
        anchorName,
        suggestion.properties?.required ? 1 : 0,
        suggestion.properties?.read_only ? 1 : 0,
        suggestion.confidence || 0,
        suggestion.status || 'review_needed'
      ];

      // Try with field_properties first, fall back to without if it doesn't exist
      try {
        await db.run(
          `INSERT INTO suggestions (
            job_id, field_page, field_name, field_type, suggested_code,
            signer, anchor_name, required, read_only, field_properties, confidence, approval_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ...insertParams.slice(0, 9),
            JSON.stringify(suggestion.properties || {}),  // field_properties
            insertParams[9],  // confidence
            insertParams[10]  // approval_status
          ]
        );
      } catch (fieldPropsErr) {
        // If field_properties column doesn't exist, use the basic insert
        if (fieldPropsErr.message.includes('field_properties')) {
          console.log(`[${jobId}] Note: field_properties column not in database yet, storing without it`);
          await db.run(insertSQL, insertParams);
        } else {
          throw fieldPropsErr;
        }
      }
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
