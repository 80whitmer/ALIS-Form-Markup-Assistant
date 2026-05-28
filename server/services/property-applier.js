const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Apply field updates using pikepdf (Python post-processor)
 * Handles ALL field manipulation: rename, required flag, read-only flag, tooltips
 *
 * @param {string} pdfPath - Path to PDF to process
 * @param {array} suggestions - Array of approved suggestion objects
 * @returns {Promise<object>} {success: boolean, updated: count, message: string}
 */
async function applyFieldUpdates(pdfPath, suggestions) {
  return new Promise((resolve) => {
    let tempSuggestionsFile = null;

    try {
      // Check if pdf-field-updater.py exists
      const scriptsDir = path.dirname(__filename);
      const fieldUpdaterPath = path.join(scriptsDir, 'pdf-field-updater.py');

      if (!fs.existsSync(fieldUpdaterPath)) {
        console.warn('[applier] pdf-field-updater.py not found at', fieldUpdaterPath);
        console.warn('[applier] Skipping field updates (pdf-field-updater.py not available)');
        resolve({success: false, updated: 0, message: 'Field updater script not found'});
        return;
      }

      // Filter for approved suggestions only
      const approved = suggestions.filter(s => s.approval_status === 'approved');

      if (approved.length === 0) {
        console.log('[applier] No approved suggestions to apply');
        resolve({success: true, updated: 0, message: 'No approved suggestions'});
        return;
      }

      // Write suggestions to temp file instead of command-line arg (avoids ENAMETOOLONG)
      const tmpDir = path.join(path.dirname(__filename), '..', 'tmp');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      tempSuggestionsFile = path.join(tmpDir, `suggestions-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
      fs.writeFileSync(tempSuggestionsFile, JSON.stringify(approved, null, 2));

      const args = [fieldUpdaterPath, pdfPath, pdfPath, '--suggestions-file', tempSuggestionsFile];

      console.log(`[applier] Spawning field updater: python ${fieldUpdaterPath} ... --suggestions-file ${tempSuggestionsFile}`);

      const pythonProcess = spawn('python', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[applier] ${data.toString().trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`[applier] ${data.toString().trim()}`);
      });

      pythonProcess.on('close', (code) => {
        // Clean up temp file
        if (tempSuggestionsFile && fs.existsSync(tempSuggestionsFile)) {
          try {
            fs.unlinkSync(tempSuggestionsFile);
          } catch (e) {
            console.warn('[applier] Could not delete temp suggestions file:', e.message);
          }
        }

        if (code === 0) {
          console.log('[applier] ✓ Field updates completed successfully');
          // Extract count from stdout if possible
          const match = stdout.match(/Successfully updated (\d+) field/);
          const updated = match ? parseInt(match[1], 10) : 0;
          resolve({success: true, updated, message: 'Field updates applied'});
        } else {
          console.warn(`[applier] ❌ Field updates exited with code ${code}`);
          resolve({success: false, updated: 0, message: `Field updates failed with exit code ${code}`});
        }
      });

      pythonProcess.on('error', (err) => {
        // Clean up temp file
        if (tempSuggestionsFile && fs.existsSync(tempSuggestionsFile)) {
          try {
            fs.unlinkSync(tempSuggestionsFile);
          } catch (e) {
            console.warn('[applier] Could not delete temp suggestions file:', e.message);
          }
        }

        console.warn('[applier] ❌ Could not spawn Python process:', err.message);
        resolve({success: false, updated: 0, message: `Could not spawn Python process: ${err.message}`});
      });

    } catch (err) {
      // Clean up temp file
      if (tempSuggestionsFile && fs.existsSync(tempSuggestionsFile)) {
        try {
          fs.unlinkSync(tempSuggestionsFile);
        } catch (e) {
          console.warn('[applier] Could not delete temp suggestions file:', e.message);
        }
      }

      console.warn('[applier] ❌ Field updates error:', err.message);
      resolve({success: false, updated: 0, message: `Field updates error: ${err.message}`});
    }
  });
}

/**
 * Post-process PDF to set border/outline colors using pikepdf
 * Removes outline color from text and signature fields via direct PDF dictionary manipulation
 *
 * @param {string} pdfPath - Path to PDF to process
 * @param {array} fieldTypes - Field types to modify (default: ['text', 'signature'])
 * @returns {Promise<object>} {success: boolean, modified: count, message: string}
 */
async function applyBorderStyling(pdfPath, fieldTypes = ['text', 'signature']) {
  return new Promise((resolve) => {
    try {
      // Check if pdf-border-styler.py exists
      const scriptsDir = path.dirname(__filename);
      const borderStylerPath = path.join(scriptsDir, 'pdf-border-styler.py');

      if (!fs.existsSync(borderStylerPath)) {
        console.warn('[applier] pdf-border-styler.py not found at', borderStylerPath);
        console.warn('[applier] Skipping border styling (pdf-border-styler.py not available)');
        resolve({success: false, modified: 0, message: 'Border styler script not found'});
        return;
      }

      const fieldTypesArg = fieldTypes.join(',');
      const args = [borderStylerPath, pdfPath, pdfPath, '--field-types', fieldTypesArg];

      console.log(`[applier] Spawning border styler: python ${args.join(' ')}`);

      const pythonProcess = spawn('python', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[applier] ${data.toString().trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`[applier] ${data.toString().trim()}`);
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log('[applier] ✓ Border styling completed successfully');
          // Extract count from stdout if possible
          const match = stdout.match(/Modified (\d+) fields/);
          const modified = match ? parseInt(match[1], 10) : 0;
          resolve({success: true, modified, message: 'Border styling applied'});
        } else {
          console.warn(`[applier] ❌ Border styling exited with code ${code}`);
          resolve({success: false, modified: 0, message: `Border styling failed with exit code ${code}`});
        }
      });

      pythonProcess.on('error', (err) => {
        console.warn('[applier] ❌ Could not spawn Python process:', err.message);
        resolve({success: false, modified: 0, message: `Could not spawn Python process: ${err.message}`});
      });

    } catch (err) {
      console.warn('[applier] ❌ Border styling error:', err.message);
      resolve({success: false, modified: 0, message: `Border styling error: ${err.message}`});
    }
  });
}

/**
 * Apply reviewed and approved suggestions to a PDF document
 *
 * This function:
 * 1. Copies input PDF directly to output path (no pdf-lib round-trip)
 * 2. Post-processes with Python/pikepdf for all field updates:
 *    - Updates field names to ALIS format (code|anchor) [skipped for manual edit]
 *    - Sets required flag
 *    - Sets read-only flag
 *    - Adds tooltips
 * 4. Post-processes with Python/pikepdf for border styling
 *
 * @param {string} inputPath - Full path to original PDF
 * @param {array} suggestions - Array of suggestion objects (with approval_status = 'approved')
 * @param {string} outputPath - Full path to save modified PDF
 * @param {boolean} isManualEdit - Whether this is a manual edit job (default: false)
 * @returns {object} Summary of changes made
 */
async function applyChangesToPDF(inputPath, suggestions, outputPath, isManualEdit = false) {
  try {
    console.log(`[applier] Loading PDF from ${inputPath}`);

    // Validate the PDF exists and is readable
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input PDF not found: ${inputPath}`);
    }

    // Count fields for logging (use pikepdf via Python rather than pdf-lib to avoid
    // pdf-lib's save() potentially re-encoding the AcroForm hierarchy in ways that
    // break pikepdf's field-name matching in the post-processing step).
    console.log(`[applier] Validated PDF exists: ${inputPath}`);

    // Filter for approved suggestions only
    const approvedSuggestions = suggestions.filter(s => s.approval_status === 'approved');

    console.log(`[applier] Processing ${approvedSuggestions.length} approved suggestions`);

    let auditLog = [];

    for (const suggestion of approvedSuggestions) {
      // Strip any legacy pipe suffix from suggested_code before building the audit entry.
      // Python now writes the tooltip as "[signer] code|code" so the audit log should match.
      const cleanCode = (suggestion.suggested_code || suggestion.field_name || '').split('|')[0].trim();
      auditLog.push({
        status: 'pending',
        // original_field_name is the immutable PDF field name; fall back to field_name
        originalName: suggestion.original_field_name || suggestion.field_name,
        // newName reflects what Python writes: field code + self-referential pipe anchor
        newName: `${cleanCode}|${cleanCode}`,
        signer: suggestion.signer,
        required: suggestion.required,
        readOnly: suggestion.read_only
      });
    }

    // Copy input PDF directly to output — do NOT use pdf-lib to save it.
    // pdf-lib's pdfDoc.save() re-encodes the AcroForm structure (flattens hierarchies,
    // re-assigns object IDs) which causes pikepdf's field-name matching to fail,
    // meaning edits made in the table don't appear in the applied PDF.
    console.log(`[applier] Copying PDF to ${outputPath}`);
    fs.copyFileSync(inputPath, outputPath);

    console.log(`[applier] ✓ PDF copied. Ready for post-processing...`);

    // Post-process: Apply ALL field updates (rename, required, read-only, tooltips) via Python/pikepdf
    console.log(`[applier] Running post-processing: field updates...`);
    const fieldUpdatesResult = await applyFieldUpdates(outputPath, approvedSuggestions);

    // Post-process: Apply border styling via Python/pikepdf
    console.log(`[applier] Running post-processing: border styling...`);
    const borderStylingResult = await applyBorderStyling(outputPath, ['text', 'signature']);

    // Determine overall success: both operations must succeed
    const overallSuccess = fieldUpdatesResult.success && borderStylingResult.success;

    // Update audit log with final status
    auditLog = auditLog.map(log => ({
      ...log,
      status: overallSuccess ? 'applied' : 'failed',
      updateMessage: fieldUpdatesResult.message,
      styleMessage: borderStylingResult.message
    }));

    console.log(`[applier] Final status: ${overallSuccess ? '✓ SUCCESS' : '❌ FAILED'}`);

    return {
      success: overallSuccess,
      changesApplied: overallSuccess ? approvedSuggestions.length : 0,
      totalSuggestions: approvedSuggestions.length,
      outputPath,
      fieldUpdatesApplied: fieldUpdatesResult.success,
      fieldUpdatesCount: fieldUpdatesResult.updated,
      borderStylingApplied: borderStylingResult.success,
      borderStylingCount: borderStylingResult.modified,
      auditLog
    };

  } catch (err) {
    console.error('[applier] Fatal error:', err.message);
    throw new Error(`Failed to apply changes to PDF: ${err.message}`);
  }
}

module.exports = {
  applyChangesToPDF,
  applyFieldUpdates,
  applyBorderStyling
};
