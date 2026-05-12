const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const db = require('../db/database');

// Import enhanced OCR module with directional search and confidence scoring
let extractSignerLabels;
try {
  extractSignerLabels = require('../../form-markup-poc/label-extractor-ocr-enhanced').extractSignerLabels;
} catch (e) {
  console.warn('[form-markup] Enhanced OCR module not available:', e.message);
  extractSignerLabels = null;
}

/**
 * Generate an anchor (reference point) for a field
 * Anchors help locate fields again if the document is modified
 * Format: {identifier}.{fieldType}.{pageNumber}
 */
function generateAnchor(fieldName, fieldType, page, signer = null) {
  let identifier = signer && signer !== 'unassigned' ? signer : fieldName;
  const safeName = identifier
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toLowerCase()
    .substring(0, 30);
  return `${safeName}.${fieldType}.${page || 1}`;
}

/**
 * Detect form fields from PDF using pikepdf via Python field detector
 * Extracts field names, types, positions, and correct page numbers
 */
async function detectFieldsFromPDF(pdfPath) {
  return new Promise((resolve, reject) => {
    try {
      const fieldDetectorPath = path.join(__dirname, 'pdf-field-detector.py');

      if (!fs.existsSync(fieldDetectorPath)) {
        throw new Error(`pdf-field-detector.py not found at ${fieldDetectorPath}`);
      }

      console.log(`[form-markup] Spawning field detector: ${fieldDetectorPath}`);

      const pythonProcess = spawn('python', [fieldDetectorPath, pdfPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`[form-markup] ${data.toString().trim()}`);
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Field detection failed with code ${code}: ${stderr}`));
        }

        try {
          const result = JSON.parse(stdout);

          if (result.status !== 'success') {
            return reject(new Error(`Field detection error: ${result.error}`));
          }

          console.log(`[form-markup] Detected ${result.fields.length} fields across ${result.total_pages} pages`);

          if (result.fields.length === 0) {
            console.warn('[form-markup] No fields found in PDF');
          }

          resolve(result.fields);
        } catch (parseErr) {
          reject(new Error(`Failed to parse field detection output: ${parseErr.message}`));
        }
      });

      pythonProcess.on('error', (err) => {
        reject(new Error(`Could not spawn field detector process: ${err.message}`));
      });

    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Orchestrate the complete form markup analysis pipeline with OCR
 */
async function runFormMarkupJob(jobId, options) {
  const {
    pdfPath,
    companyName,
    documentTitle,
    ocrSearchRadius = 100,
    formTemplate,
    signers = []
  } = options;

  console.log(`[${jobId}] Starting form markup analysis...`);

  try {
    // Phase 1: Detect fields with correct page numbers
    console.log(`[${jobId}] Phase 1: Detecting AcroForm fields...`);
    let fields = await detectFieldsFromPDF(pdfPath);
    console.log(`[${jobId}] Detected ${fields.length} fields`);

    if (fields.length === 0) {
      throw new Error('No form fields detected in PDF');
    }

    // Phase 1b: Run enhanced OCR for signer detection and confidence scoring
    console.log(`[${jobId}] Phase 1b: Running enhanced OCR (radius: ${ocrSearchRadius}px)...`);
    let ocrResults = {};

    if (extractSignerLabels) {
      try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const availableSigners = signers.length > 0 ? signers : ['resident', 'responsible party', 'staff', 'family', 'admin', 'physician', 'medical provider'];

        const labelResults = await extractSignerLabels(
          pdfBuffer,
          fields,
          availableSigners,
          ocrSearchRadius
        );

        // Index OCR results by field name
        if (labelResults && Array.isArray(labelResults)) {
          labelResults.forEach(result => {
            ocrResults[result.field_name] = {
              signer: result.signer,
              confidence: result.confidence,
              match_text: result.match_text,
              match_zone: result.match_zone,
              match_reason: result.match_reason
            };
          });
          console.log(`[${jobId}] OCR: Found signer labels for ${Object.keys(ocrResults).length} fields`);
        }
      } catch (ocrErr) {
        console.warn(`[${jobId}] OCR processing failed:`, ocrErr.message);
        console.warn(`[${jobId}] Continuing with generic suggestions (0% confidence)`);
      }
    } else {
      console.warn(`[${jobId}] Enhanced OCR module not available`);
    }

    // Phase 2: Generate basic suggestions
    console.log(`[${jobId}] Phase 2: Generating suggestions...`);
    const suggestions = fields.map((field, idx) => {
      const alisCode = `FAC.${field.field_type}.${idx + 1}`;
      const anchorName = generateAnchor(field.field_name, field.field_type, field.field_page);

      return {
        field_name: field.field_name,
        field_type: field.field_type,
        field_page: field.field_page,        // ← PAGE NUMBER INCLUDED
        field_index: field.field_index,
        suggested_code: alisCode,
        signer: 'unassigned',
        confidence: 0.0,
        approval_status: 'review_needed',
        required: field.field_type === 'signature',
        read_only: false
      };
    });

    // Phase 2b: Merge OCR results into suggestions
    console.log(`[${jobId}] Phase 2b: Merging OCR results...`);
    const mergedSuggestions = suggestions.map((suggestion, idx) => {
      const ocrData = ocrResults[suggestion.field_name];
      if (ocrData) {
        const signer = ocrData.signer || suggestion.signer;
        const confidence = ocrData.confidence || suggestion.confidence;
        // Regenerate suggested_code with actual signer from OCR
        const suggestionCode = `${signer}.${suggestion.field_type}.${idx + 1}`;
        return {
          ...suggestion,
          signer,
          confidence,
          suggested_code: suggestionCode,
          match_text: ocrData.match_text,
          match_zone: ocrData.match_zone,
          match_reason: ocrData.match_reason
        };
      }
      return suggestion;
    });

    console.log(`[${jobId}] Merged OCR results: ${mergedSuggestions.filter(s => s.confidence > 0).length} fields with confidence > 0%`);

    // Phase 3: Store suggestions in database
    console.log(`[${jobId}] Phase 3: Storing suggestions in database...`);
    for (const suggestion of mergedSuggestions) {
      const anchorName = generateAnchor(suggestion.field_name, suggestion.field_type, suggestion.field_page, suggestion.signer);

      try {
        await db.run(
          `INSERT INTO suggestions (
            job_id, field_page, field_name, field_type, suggested_code,
            signer, anchor_name, required, read_only, confidence, approval_status, match_text, match_zone
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            jobId,
            suggestion.field_page,         // ← CORRECT PAGE NUMBER
            suggestion.field_name,
            suggestion.field_type,
            suggestion.suggested_code,
            suggestion.signer,
            anchorName,
            suggestion.required ? 1 : 0,
            suggestion.read_only ? 1 : 0,
            suggestion.confidence,
            suggestion.approval_status,
            suggestion.match_text || null,
            suggestion.match_zone || null
          ]
        );
      } catch (insertErr) {
        // Handle different database schemas gracefully
        if (insertErr.message.includes('no such column')) {
          // Try without match_text and match_zone for older schema
          await db.run(
            `INSERT INTO suggestions (
              job_id, field_page, field_name, field_type, suggested_code,
              signer, anchor_name, required, read_only, confidence, approval_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              jobId,
              suggestion.field_page,
              suggestion.field_name,
              suggestion.field_type,
              suggestion.suggested_code,
              suggestion.signer,
              anchorName,
              suggestion.required ? 1 : 0,
              suggestion.read_only ? 1 : 0,
              suggestion.confidence,
              suggestion.approval_status
            ]
          );
        } else {
          throw insertErr;
        }
      }
    }

    // Phase 4: Update job status
    console.log(`[${jobId}] Phase 4: Updating job status...`);
    const pageCount = Math.max(...mergedSuggestions.map(s => s.field_page || 1));

    await db.run(
      `UPDATE jobs SET status = ?, completed_at = ? WHERE id = ?`,
      ['reviewed', new Date().toISOString(), jobId]
    );

    console.log(`[${jobId}] ✓ Job completed: ${mergedSuggestions.length} fields across ${pageCount} pages`);

    return {
      jobId,
      status: 'reviewed',
      totalFields: mergedSuggestions.length,
      totalPages: pageCount,
      suggestionsGenerated: mergedSuggestions.length
    };

  } catch (err) {
    console.error(`[${jobId}] Job failed:`, err.message);

    await db.run(
      `UPDATE jobs SET status = ?, error_message = ?, completed_at = ? WHERE id = ?`,
      ['failed', err.message, new Date().toISOString(), jobId]
    );

    throw err;
  }
}

module.exports = {
  runFormMarkupJob,
  detectFieldsFromPDF
};
