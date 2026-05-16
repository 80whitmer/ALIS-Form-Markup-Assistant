const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const db = require('../db/database');
const { mergeAlisSuggestions } = require('./alis-suggestion-matcher');

/**
 * Generate a preview image for a field region
 * Spawns pdf-preview-extractor.py to extract and render the field area
 * @param {string} pdfPath - Path to PDF file
 * @param {number} pageNum - Page number (0-indexed)
 * @param {number} x - X coordinate of field
 * @param {number} y - Y coordinate of field
 * @param {number} width - Width of field region
 * @param {number} height - Height of field region
 * @param {number} padding - Padding around field (default 40)
 * @param {string} fieldName - Optional field name for debug output
 */
function generateFieldPreview(pdfPath, pageNum, x, y, width, height, padding = 40, fieldName = null) {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(pdfPath)) {
        console.log('[form-markup] PDF file not found, skipping preview');
        resolve(null);
        return;
      }

      // Calculate crop region with padding
      const cropX = Math.max(0, x - padding);
      const cropY = Math.max(0, y - padding);
      const cropWidth = width + (padding * 2);
      const cropHeight = height + (padding * 2);

      const pythonScript = path.join(__dirname, 'pdf-preview-extractor.py');

      if (!fs.existsSync(pythonScript)) {
        console.log('[form-markup] PDF preview extractor script not found at:', pythonScript);
        resolve(null);
        return;
      }

      console.log('[form-markup] Spawning preview for page', pageNum, 'crop region:', cropX, cropY, cropWidth, cropHeight);
      console.log('[form-markup] Python script:', pythonScript);
      console.log('[form-markup] PDF path:', pdfPath);

      const pythonProcess = spawn('python', [
        pythonScript,
        pdfPath,
        pageNum.toString(),
        cropX.toString(),
        cropY.toString(),
        cropWidth.toString(),
        cropHeight.toString()
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Set timeout to prevent hanging
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        pythonProcess.kill();
        console.log('[form-markup] Preview generation timeout');
        resolve(null);
      }, 30000); // 30 second timeout

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log('[form-markup] Python stderr:', data.toString().trim());
      });

      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutHandle);

        if (timedOut) return;

        if (code !== 0) {
          console.log('[form-markup] Preview generation failed with code', code);
          console.log('[form-markup] stderr:', stderr.slice(0, 500));
          resolve(null);
          return;
        }

        if (!stdout || stdout.length === 0) {
          console.log('[form-markup] Preview generation produced no output');
          resolve(null);
          return;
        }

        try {
          const base64Data = stdout.trim();

          // Validate base64 data
          if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
            console.log('[form-markup] Invalid base64 data received');
            resolve(null);
            return;
          }

          const dataUrl = `data:image/png;base64,${base64Data}`;
          console.log('[form-markup] Generated preview image, size:', base64Data.length, 'bytes');

          // DEBUG: Write PNG to disk for visual inspection
          try {
            const debugDir = path.join(__dirname, '..', 'debug-previews');
            if (!fs.existsSync(debugDir)) {
              fs.mkdirSync(debugDir, { recursive: true });
            }
            const safeFieldName = fieldName ? fieldName.replace(/[^a-z0-9._-]/gi, '_').slice(0, 50) : `page${pageNum}`;
            const timestamp = Date.now();
            const filename = `${safeFieldName}_${timestamp}.png`;
            const filepath = path.join(debugDir, filename);
            const pngBuffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(filepath, pngBuffer);
            console.log('[form-markup] [DEBUG] Saved preview to:', filepath);
          } catch (diskErr) {
            console.log('[form-markup] [DEBUG] Could not save preview file:', diskErr.message);
          }

          resolve(dataUrl);
        } catch (err) {
          console.log('[form-markup] Failed to parse preview data:', err.message);
          resolve(null);
        }
      });

      pythonProcess.on('error', (err) => {
        clearTimeout(timeoutHandle);
        console.log('[form-markup] Failed to spawn preview generator:', err.message);
        console.log('[form-markup] Python script path:', pythonScript);
        resolve(null);
      });

    } catch (err) {
      console.log('[form-markup] Error generating preview:', err.message);
      resolve(null);
    }
  });
}

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
function normalizeSigner(signer) {
  /**
   * Normalize signer names to lowercase
   * Examples: 'Resident' -> 'resident', 'RESPONSIBLE PARTY' -> 'responsible party'
   */
  if (!signer) return 'resident';
  return signer.toLowerCase().trim();
}

function generateAnchor(fieldName, fieldType, page, signer = null) {
  let identifier = signer && signer !== 'resident' ? signer : fieldName;
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
    alisAggressiveness = 'off',
    signers = []
  } = options;

  console.log(`[${jobId}] Starting form markup analysis...`);

  try {
    // Phase 1: Detect fields with correct page numbers
    console.log(`[${jobId}] Phase 1: Detecting AcroForm fields...`);
    await db.run(`UPDATE jobs SET progress_phase = ? WHERE id = ?`, ['Detecting fields...', jobId]);
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
    await db.run(`UPDATE jobs SET progress_phase = ? WHERE id = ?`, ['Generating suggestions...', jobId]);
    const suggestions = fields.map((field, idx) => {
      // Normalize field type: button -> check (buttons are checkboxes)
      const normalizedType = field.field_type === 'button' ? 'check' : field.field_type;
      const alisCode = `resident.${normalizedType}.${idx + 1}`;
      const anchorName = generateAnchor(field.field_name, normalizedType, field.field_page);

      return {
        field_name: field.field_name,
        field_type: normalizedType,  // Store normalized type
        field_page: field.field_page,        // ← PAGE NUMBER INCLUDED
        field_index: field.field_index,
        suggested_code: alisCode,
        signer: 'resident',
        confidence: 0.0,
        approval_status: 'review_needed',
        required: normalizedType === 'signature',
        read_only: false
      };
    });

    // Phase 2b: Merge OCR results into suggestions
    console.log(`[${jobId}] Phase 2b: Merging OCR results...`);
    const mergedSuggestions = suggestions.map((suggestion, idx) => {
      const ocrData = ocrResults[suggestion.field_name];
      if (ocrData) {
        const signer = normalizeSigner(ocrData.signer || suggestion.signer);
        const confidence = ocrData.confidence || suggestion.confidence;
        // Normalize field type: button -> check (buttons are checkboxes)
        const normalizedType = suggestion.field_type === 'button' ? 'check' : suggestion.field_type;
        // Regenerate suggested_code with actual signer from OCR (normalized to lowercase)
        const suggestionCode = `${signer}.${normalizedType}.${idx + 1}`;
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
      // Return with normalized signer even if no OCR match
      return {
        ...suggestion,
        signer: normalizeSigner(suggestion.signer)
      };
    });

    console.log(`[${jobId}] Merged OCR results: ${mergedSuggestions.filter(s => s.confidence > 0).length} fields with confidence > 0%`);

    // Phase 2c: Merge ALIS suggestions if aggressiveness level is set
    let suggestionsWithAlis = mergedSuggestions;
    if (alisAggressiveness !== 'off') {
      console.log(`[${jobId}] Phase 2c: Adding ALIS suggestions (aggressiveness: ${alisAggressiveness})...`);
      suggestionsWithAlis = mergeAlisSuggestions(mergedSuggestions, alisAggressiveness);
      const alisCount = suggestionsWithAlis.filter(s => s.alis_suggestion).length;
      console.log(`[${jobId}] ALIS: Generated ${alisCount} ALIS field suggestions`);
    }

    // Phase 3b: Generate preview images (with concurrency limit)
    console.log(`[${jobId}] Phase 3b: Generating field preview images for ${suggestionsWithAlis.length} fields...`);
    await db.run(`UPDATE jobs SET progress_phase = ? WHERE id = ?`, ['Generating previews...', jobId]);
    const suggestionsWithPreviews = [];
    const previewBatchSize = 3;

    for (let i = 0; i < suggestionsWithAlis.length; i += previewBatchSize) {
      const batch = suggestionsWithAlis.slice(i, i + previewBatchSize);
      console.log(`[${jobId}] Processing preview batch ${Math.floor(i / previewBatchSize) + 1}/${Math.ceil(suggestionsWithAlis.length / previewBatchSize)}`);

      const previewPromises = batch.map(async (suggestion, batchIdx) => {
        try {
          // Find the corresponding field for position data
          const field = fields.find(f => f.field_name === suggestion.field_name);
          if (!field || field.x === undefined) {
            console.log(`[${jobId}] Field ${suggestion.field_name}: No position data available`);
            return { ...suggestion, preview_image: null };
          }

          console.log(`[${jobId}] Generating preview for field "${suggestion.field_name}" on page ${field.field_page || 1}`);

          const preview = await generateFieldPreview(
            pdfPath,
            field.field_page || 1,
            field.x,
            field.y,
            field.width,
            field.height,
            40, // padding
            suggestion.field_name // pass field name for debug output
          );

          if (preview) {
            console.log(`[${jobId}] ✓ Preview generated for "${suggestion.field_name}"`);
          } else {
            console.log(`[${jobId}] ✗ Preview failed for "${suggestion.field_name}"`);
          }

          return { ...suggestion, preview_image: preview };
        } catch (err) {
          console.warn(`[${jobId}] Exception generating preview for ${suggestion.field_name}:`, err.message);
          return { ...suggestion, preview_image: null };
        }
      });

      const results = await Promise.all(previewPromises);
      suggestionsWithPreviews.push(...results);
    }

    const previewCount = suggestionsWithPreviews.filter(s => s.preview_image).length;
    const failedCount = suggestionsWithPreviews.filter(s => !s.preview_image).length;
    console.log(`[${jobId}] Phase 3b complete: ${previewCount} images generated, ${failedCount} failed`);
    if (previewCount === 0 && suggestionsWithAlis.length > 0) {
      console.warn(`[${jobId}] WARNING: No preview images were generated. Check logs for pdf-preview-extractor.py errors`);
    }

    // Phase 3c: Store suggestions in database
    console.log(`[${jobId}] Phase 3c: Storing suggestions in database...`);
    await db.run(`UPDATE jobs SET progress_phase = ? WHERE id = ?`, ['Storing data...', jobId]);
    for (const suggestion of suggestionsWithPreviews) {
      const anchorName = generateAnchor(suggestion.field_name, suggestion.field_type, suggestion.field_page, suggestion.signer);

      try {
        await db.run(
          `INSERT INTO suggestions (
            job_id, field_page, field_name, field_type, suggested_code,
            signer, anchor_name, required, read_only, confidence, approval_status, match_text, match_zone, preview_image
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            suggestion.match_zone || null,
            suggestion.preview_image || null
          ]
        );
      } catch (insertErr) {
        // Handle different database schemas gracefully
        if (insertErr.message.includes('no such column')) {
          // Try without preview_image for older schema
          await db.run(
            `INSERT INTO suggestions (
              job_id, field_page, field_name, field_type, suggested_code,
              signer, anchor_name, required, read_only, confidence, approval_status, match_text, match_zone
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
              suggestion.approval_status,
              suggestion.match_text || null,
              suggestion.match_zone || null
            ]
          );
        } else {
          throw insertErr;
        }
      }
    }

    // Phase 4: Update job status
    console.log(`[${jobId}] Phase 4: Updating job status...`);
    const pageCount = Math.max(...suggestionsWithPreviews.map(s => s.field_page || 1));

    await db.run(
      `UPDATE jobs SET status = ?, completed_at = ? WHERE id = ?`,
      ['reviewed', new Date().toISOString(), jobId]
    );

    console.log(`[${jobId}] ✓ Job completed: ${suggestionsWithPreviews.length} fields across ${pageCount} pages`);

    return {
      jobId,
      status: 'reviewed',
      totalFields: suggestionsWithPreviews.length,
      totalPages: pageCount,
      suggestionsGenerated: suggestionsWithPreviews.length
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
