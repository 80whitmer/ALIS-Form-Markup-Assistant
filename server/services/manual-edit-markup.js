const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const db = require('../db/database');

/**
 * Generate a preview image for a field region
 * Spawns pdf-preview-extractor.py to extract and render the field area
 */
function generateFieldPreview(pdfPath, pageNum, x, y, width, height, padding = 40, fieldName = null) {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(pdfPath)) {
        console.log('[manual-edit] PDF file not found, skipping preview');
        resolve(null);
        return;
      }

      const cropX = Math.max(0, x - padding);
      const cropY = Math.max(0, y - padding);
      const cropWidth = width + (padding * 2);
      const cropHeight = height + (padding * 2);

      const pythonScript = path.join(__dirname, 'pdf-preview-extractor.py');

      if (!fs.existsSync(pythonScript)) {
        console.log('[manual-edit] PDF preview extractor script not found at:', pythonScript);
        resolve(null);
        return;
      }

      console.log('[manual-edit] Spawning preview for page', pageNum, 'crop region:', cropX, cropY, cropWidth, cropHeight);

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

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        pythonProcess.kill();
        console.log('[manual-edit] Preview generation timeout');
        resolve(null);
      }, 30000);

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log('[manual-edit] Python stderr:', data.toString().trim());
      });

      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutHandle);

        if (timedOut) return;

        if (code !== 0) {
          console.log('[manual-edit] Preview generation failed with code', code);
          resolve(null);
          return;
        }

        if (!stdout || stdout.length === 0) {
          console.log('[manual-edit] Preview generation produced no output');
          resolve(null);
          return;
        }

        try {
          const base64Data = stdout.trim();
          resolve(`data:image/png;base64,${base64Data}`);
        } catch (err) {
          console.log('[manual-edit] Failed to process preview output:', err.message);
          resolve(null);
        }
      });

      pythonProcess.on('error', (err) => {
        clearTimeout(timeoutHandle);
        console.log('[manual-edit] Failed to spawn preview process:', err.message);
        resolve(null);
      });

    } catch (err) {
      console.log('[manual-edit] Exception in preview generation:', err.message);
      resolve(null);
    }
  });
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

      console.log(`[manual-edit] Spawning field detector: ${fieldDetectorPath}`);

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
        console.log(`[manual-edit] ${data.toString().trim()}`);
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

          console.log(`[manual-edit] Detected ${result.fields.length} fields across ${result.total_pages} pages`);

          if (result.fields.length === 0) {
            console.warn('[manual-edit] No fields found in PDF');
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
 * Detect duplicate field names and label them
 * Returns map of fieldName -> { count, index }
 */
function detectDuplicates(fields) {
  const nameCount = {};
  const nameIndices = {};

  // First pass: count occurrences
  fields.forEach((field) => {
    const name = field.field_name;
    nameCount[name] = (nameCount[name] || 0) + 1;
    if (!nameIndices[name]) {
      nameIndices[name] = [];
    }
    nameIndices[name].push(field);
  });

  // Return duplicate info
  return {
    nameCount,
    nameIndices,
    hasDuplicates: Object.values(nameCount).some(count => count > 1)
  };
}

/**
 * Generate a display name for a field, including duplicate indicator if needed
 */
function getDisplayFieldName(fieldName, duplicateInfo) {
  if (!duplicateInfo.hasDuplicates || duplicateInfo.nameCount[fieldName] === 1) {
    return fieldName;
  }

  const indices = duplicateInfo.nameIndices[fieldName];
  const currentIndex = indices.findIndex(f => f.field_name === fieldName);
  const count = duplicateInfo.nameCount[fieldName];

  return `${fieldName} [Duplicate ${currentIndex + 1}/${count}]`;
}

/**
 * Orchestrate the manual edit analysis pipeline (no OCR, current values only)
 */
async function runManualEditJob(jobId, options) {
  const {
    pdfPath,
    companyName,
    documentTitle
  } = options;

  console.log(`[${jobId}] Starting manual edit analysis (no OCR)...`);

  try {
    // Phase 1: Detect fields
    console.log(`[${jobId}] Phase 1: Detecting AcroForm fields...`);
    await db.run(`UPDATE jobs SET progress_phase = ? WHERE id = ?`, ['Detecting fields...', jobId]);
    let fields = await detectFieldsFromPDF(pdfPath);
    console.log(`[${jobId}] Detected ${fields.length} fields`);
    // Ensure phase is visible for at least 300ms
    await new Promise(resolve => setTimeout(resolve, 300));

    if (fields.length === 0) {
      throw new Error('No form fields detected in PDF');
    }

    // Phase 1b: Detect duplicates
    console.log(`[${jobId}] Phase 1b: Detecting duplicate field names...`);
    const duplicateInfo = detectDuplicates(fields);
    if (duplicateInfo.hasDuplicates) {
      const duplicateCount = Object.values(duplicateInfo.nameCount).filter(c => c > 1).length;
      console.log(`[${jobId}] Found ${duplicateCount} duplicate field names`);
    }

    // Phase 2: Generate suggestions from current values (no OCR, no predictions)
    console.log(`[${jobId}] Phase 2: Generating suggestions from current field values...`);
    await db.run(`UPDATE jobs SET progress_phase = ? WHERE id = ?`, ['Generating suggestions...', jobId]);
    await new Promise(resolve => setTimeout(resolve, 200));
    const suggestions = fields.map((field, idx) => {
      const normalizedType = field.field_type === 'button' ? 'check' : field.field_type;
      // NOTE: Do NOT use displayFieldName here - that includes "[Duplicate 1/3]" suffixes
      // Frontend will detect duplicates independently and display them visually
      // Backend must use original field_name so pdf-field-updater.py can match against PDF

      return {
        original_field_name: field.field_name, // IMMUTABLE: Store ORIGINAL field name for pdf-field-updater.py lookup
        field_name: field.field_name, // EDITABLE: User can change this for ALIS naming (but original_field_name stays the same)
        field_type: normalizedType,
        field_page: field.field_page,
        field_index: field.field_index,
        suggested_code: null, // No suggested code in manual edit
        signer: undefined, // Undefined - user will fill in
        confidence: 1.0, // Manual edit has highest confidence
        approval_status: 'approved', // Auto-approve in manual edit
        required: normalizedType === 'signature',
        read_only: false,
        border: false
      };
    });

    console.log(`[${jobId}] Generated ${suggestions.length} suggestions`);

    // Add intermediate progress updates during suggestion generation
    const suggestionBatchSize = Math.max(1, Math.ceil(suggestions.length / 3));
    for (let i = 0; i < suggestions.length; i += suggestionBatchSize) {
      const progress = Math.floor((i / suggestions.length) * 100);
      const batch = Math.ceil(i / suggestionBatchSize) + 1;
      await db.run(`UPDATE jobs SET progress_phase = ? WHERE id = ?`,
        [`Generating suggestions (${Math.min(batch * suggestionBatchSize, suggestions.length)}/${suggestions.length})...`, jobId]);
    }

    // Phase 3: Generate preview images
    console.log(`[${jobId}] Phase 3: Generating field preview images for ${suggestions.length} fields...`);
    await db.run(`UPDATE jobs SET progress_phase = ? WHERE id = ?`, ['Generating previews...', jobId]);
    const suggestionsWithPreviews = [];
    const previewBatchSize = 3;

    for (let i = 0; i < suggestions.length; i += previewBatchSize) {
      const batch = suggestions.slice(i, i + previewBatchSize);
      const batchNum = Math.floor(i / previewBatchSize) + 1;
      const totalBatches = Math.ceil(suggestions.length / previewBatchSize);
      console.log(`[${jobId}] Processing preview batch ${batchNum}/${totalBatches}`);
      await db.run(`UPDATE jobs SET progress_phase = ? WHERE id = ?`, [`Generating previews (${batchNum}/${totalBatches})...`, jobId]);

      const previewPromises = batch.map(async (suggestion) => {
        try {
          const field = fields.find(f => {
            const normalized = f.field_type === 'button' ? 'check' : f.field_type;
            return f.field_name === suggestion.field_name;
          });

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
            40,
            suggestion.field_name
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
    console.log(`[${jobId}] Phase 3 complete: ${previewCount} images generated, ${failedCount} failed`);

    // Phase 4: Store suggestions in database
    console.log(`[${jobId}] Phase 4: Storing suggestions in database...`);
    await db.run(`UPDATE jobs SET progress_phase = ? WHERE id = ?`, ['Storing data...', jobId]);
    await new Promise(resolve => setTimeout(resolve, 200));
    for (const suggestion of suggestionsWithPreviews) {
      try {
        await db.run(
          `INSERT INTO suggestions (
            job_id, field_page, original_field_name, field_name, field_type,
            signer, anchor_name, required, read_only, confidence, approval_status, preview_image
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            jobId,
            suggestion.field_page,
            suggestion.original_field_name, // Immutable: original PDF field name
            suggestion.field_name,
            suggestion.field_type,
            suggestion.signer,
            null, // No anchor name in manual edit
            suggestion.required ? 1 : 0,
            suggestion.read_only ? 1 : 0,
            suggestion.confidence,
            suggestion.approval_status,
            suggestion.preview_image
          ]
        );
      } catch (dbErr) {
        console.error(`[${jobId}] Failed to store suggestion for ${suggestion.field_name}:`, dbErr.message);
      }
    }

    // Phase 5: Update job status to completed
    console.log(`[${jobId}] Phase 5: Updating job status to completed...`);
    await db.run(
      `UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?`,
      ['completed', new Date().toISOString(), jobId]
    );

    console.log(`[${jobId}] Manual edit analysis complete!`);

  } catch (err) {
    console.error(`[${jobId}] Manual edit job failed:`, err.message);
    throw err;
  }
}

module.exports = {
  runManualEditJob,
  detectFieldsFromPDF,
  detectDuplicates,
  getDisplayFieldName
};
