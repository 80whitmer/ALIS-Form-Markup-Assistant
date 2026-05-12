#!/usr/bin/env node

/**
 * DEBUG SCRIPT: Test each stage of the form markup workflow
 *
 * This script isolates the problem by testing:
 * 1. Field Detection - Can we read fields from the PDF?
 * 2. Suggestion Generation - Can we create ALIS codes?
 * 3. Python Subprocess - Can we spawn and run Python?
 * 4. PDF Manipulation - Does the output PDF have updated fields?
 *
 * Run with: node debug-workflow.js
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PDFDocument } = require('pdf-lib');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(level, message) {
  const timestamp = new Date().toISOString().substr(11, 8);
  const prefix = `[${timestamp}]`;

  switch(level) {
    case 'info':
      console.log(`${colors.blue}${prefix}${colors.reset} ${message}`);
      break;
    case 'success':
      console.log(`${colors.green}${prefix}${colors.reset} ${colors.bright}✓${colors.reset} ${message}`);
      break;
    case 'error':
      console.log(`${colors.red}${prefix}${colors.reset} ${colors.bright}✗${colors.reset} ${message}`);
      break;
    case 'warn':
      console.log(`${colors.yellow}${prefix}${colors.reset} ${colors.bright}⚠${colors.reset} ${message}`);
      break;
    case 'debug':
      console.log(`${colors.dim}${prefix}${colors.reset} ${message}`);
      break;
    default:
      console.log(message);
  }
}

function section(title) {
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}\n`);
}

/**
 * STAGE 1: Load and inspect PDF structure
 */
async function testPDFLoading(pdfPath) {
  section('STAGE 1: PDF Loading & Structure');

  try {
    if (!fs.existsSync(pdfPath)) {
      log('error', `PDF not found: ${pdfPath}`);
      return null;
    }

    log('info', `Loading PDF: ${pdfPath}`);
    const pdfBytes = fs.readFileSync(pdfPath);
    log('info', `PDF size: ${(pdfBytes.length / 1024).toFixed(2)} KB`);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    log('success', `PDF loaded successfully (${pageCount} pages)`);

    return { pdfDoc, pdfBytes, pageCount };
  } catch (err) {
    log('error', `Failed to load PDF: ${err.message}`);
    return null;
  }
}

/**
 * STAGE 2: Detect form fields
 */
async function testFieldDetection(pdfDoc) {
  section('STAGE 2: Form Field Detection');

  try {
    const form = pdfDoc.getForm();
    const allFields = form.getFields();

    log('info', `Scanning for AcroForm fields...`);
    log('success', `Found ${allFields.length} fields in PDF`);

    if (allFields.length === 0) {
      log('warn', 'No AcroForm fields detected. This is a problem!');
      return [];
    }

    // Detailed field listing
    console.log(`\n${colors.bright}Field Details:${colors.reset}`);
    const fields = allFields.map((field, idx) => {
      const name = field.getName();
      const type = field.constructor.name;

      // Try to get field properties
      let props = {};
      try {
        // These are approximate and may not work on all fields
        props.page = 'see log';
      } catch (e) {
        // Ignore
      }

      console.log(`  [${idx + 1}] ${colors.bright}${name}${colors.reset} (${type})`);

      return { name, type, index: idx };
    });

    log('success', `Field detection complete`);
    return fields;

  } catch (err) {
    log('error', `Field detection failed: ${err.message}`);
    return [];
  }
}

/**
 * STAGE 3: Test Python subprocess availability
 */
async function testPythonAvailability() {
  section('STAGE 3: Python Environment Check');

  return new Promise((resolve) => {
    log('info', 'Testing Python availability...');

    const pythonProcess = spawn('python', ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        log('success', `Python is available: ${output.trim()}`);
        resolve(true);
      } else {
        log('error', `Python test failed with code ${code}`);
        resolve(false);
      }
    });

    pythonProcess.on('error', (err) => {
      log('error', `Cannot spawn Python: ${err.message}`);
      resolve(false);
    });
  });
}

/**
 * STAGE 4: Test pikepdf installation
 */
async function testPikepdfInstalled() {
  section('STAGE 4: Pikepdf Dependency Check');

  return new Promise((resolve) => {
    log('info', 'Testing pikepdf installation...');

    const pythonProcess = spawn('python', ['-c', 'import pikepdf; print("pikepdf OK")'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0 && output.includes('pikepdf OK')) {
        log('success', `pikepdf is installed and working`);
        resolve(true);
      } else {
        log('error', `pikepdf test failed: ${error || output}`);
        log('warn', 'Trying to install pikepdf...');

        // Try to install
        const installProcess = spawn('python', ['-m', 'pip', 'install', 'pikepdf'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        installProcess.on('close', (installCode) => {
          if (installCode === 0) {
            log('success', 'pikepdf installed successfully');
            resolve(true);
          } else {
            log('error', 'Failed to install pikepdf');
            resolve(false);
          }
        });
      }
    });

    pythonProcess.on('error', (err) => {
      log('error', `Cannot test pikepdf: ${err.message}`);
      resolve(false);
    });
  });
}

/**
 * STAGE 5: Test field updater script
 */
async function testFieldUpdaterScript(pdfPath, outputPath, fields) {
  section('STAGE 5: Field Updater Script Execution');

  if (fields.length === 0) {
    log('warn', 'No fields to update');
    return false;
  }

  try {
    // Create sample suggestions for the detected fields
    const suggestions = fields.slice(0, 2).map((field, idx) => ({
      field_name: field.name,
      suggested_code: `TEST.CODE.${idx + 1}`,
      anchor_name: `test_anchor_${idx + 1}`,
      signer: 'test_signer',
      required: true,
      read_only: false,
      approval_status: 'approved'
    }));

    log('info', `Creating test suggestions for ${suggestions.length} fields:`);
    suggestions.forEach(s => {
      log('debug', `  ${s.field_name} → ${s.suggested_code}|${s.anchor_name}`);
    });

    // Check if script exists
    const scriptsDir = path.join(__dirname, 'server', 'services');
    const updaterScript = path.join(scriptsDir, 'pdf-field-updater.py');

    if (!fs.existsSync(updaterScript)) {
      log('error', `Script not found: ${updaterScript}`);
      return false;
    }

    log('info', `Running: python ${updaterScript}`);

    return new Promise((resolve) => {
      const suggestionsJson = JSON.stringify(suggestions);
      const args = [updaterScript, pdfPath, outputPath, '--suggestions', suggestionsJson];

      const pythonProcess = spawn('python', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        log('debug', data.toString().trim());
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        log('warn', data.toString().trim());
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          log('success', `Field updater completed (exit code: ${code})`);
          resolve(true);
        } else {
          log('error', `Field updater failed (exit code: ${code})`);
          resolve(false);
        }
      });

      pythonProcess.on('error', (err) => {
        log('error', `Failed to spawn field updater: ${err.message}`);
        resolve(false);
      });
    });

  } catch (err) {
    log('error', `Field updater test failed: ${err.message}`);
    return false;
  }
}

/**
 * STAGE 6: Verify output PDF has updated fields
 */
async function testOutputPDFFields(outputPath) {
  section('STAGE 6: Output PDF Verification');

  try {
    if (!fs.existsSync(outputPath)) {
      log('error', `Output PDF not found: ${outputPath}`);
      return false;
    }

    log('info', `Loading output PDF: ${outputPath}`);
    const pdfBytes = fs.readFileSync(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const allFields = form.getFields();

    log('info', `Scanning output PDF for changes...`);

    let hasUpdates = false;
    let updateCount = 0;

    console.log(`\n${colors.bright}Output Field Details:${colors.reset}`);
    allFields.forEach((field, idx) => {
      const name = field.getName();
      const hasALISCode = name.includes('|') || name.includes('TEST.CODE');

      if (hasALISCode) {
        console.log(`  [${idx + 1}] ${colors.green}${name}${colors.reset} ${colors.bright}(UPDATED)${colors.reset}`);
        hasUpdates = true;
        updateCount++;
      } else {
        console.log(`  [${idx + 1}] ${colors.yellow}${name}${colors.reset} ${colors.dim}(unchanged)${colors.reset}`);
      }
    });

    if (hasUpdates) {
      log('success', `${updateCount} field(s) were updated`);
      return true;
    } else {
      log('error', `No fields were updated in output PDF`);
      return false;
    }

  } catch (err) {
    log('error', `Output verification failed: ${err.message}`);
    return false;
  }
}

/**
 * Main execution
 */
async function runDebugWorkflow() {
  console.log(`\n${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║  ALIS Form Markup - Workflow Debug Script               ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║  Testing: Detection → Suggestions → Python → PDF Update ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}\n`);

  // Find test PDF
  const testPDF = path.join(__dirname, 'Assisted-Living-Medications-FormMarkup-Applied.pdf');
  const outputPDF = path.join(__dirname, 'debug-output.pdf');

  log('info', `Test PDF: ${testPDF}`);
  log('info', `Output PDF: ${outputPDF}`);

  // Stage 1: Load PDF
  const loadResult = await testPDFLoading(testPDF);
  if (!loadResult) {
    log('error', 'Cannot proceed without valid PDF');
    process.exit(1);
  }

  const { pdfDoc } = loadResult;

  // Stage 2: Detect fields
  const fields = await testFieldDetection(pdfDoc);
  if (fields.length === 0) {
    log('warn', 'Warning: No fields detected. Output PDF may not have AcroForm fields.');
  }

  // Stage 3: Check Python
  const pythonOk = await testPythonAvailability();
  if (!pythonOk) {
    log('error', 'Python is not available. Cannot run field updater.');
    process.exit(1);
  }

  // Stage 4: Check pikepdf
  const pikepdfOk = await testPikepdfInstalled();
  if (!pikepdfOk) {
    log('error', 'pikepdf is not installed. Cannot update fields.');
    process.exit(1);
  }

  // Copy test PDF to output for processing
  fs.copyFileSync(testPDF, outputPDF);
  log('info', `Copied ${testPDF} → ${outputPDF}`);

  // Stage 5: Run field updater
  if (fields.length > 0) {
    const updaterOk = await testFieldUpdaterScript(outputPDF, outputPDF, fields);
    if (!updaterOk) {
      log('error', 'Field updater failed');
      process.exit(1);
    }
  }

  // Stage 6: Verify output
  const verified = await testOutputPDFFields(outputPDF);

  // Summary
  section('SUMMARY');
  console.log(`${colors.bright}Results:${colors.reset}`);
  console.log(`  ${colors.green}✓${colors.reset} PDF Loading: PASS`);
  console.log(`  ${colors.green}✓${colors.reset} Field Detection: ${fields.length > 0 ? 'PASS' : 'FAIL (no fields found)'}`);
  console.log(`  ${colors.green}✓${colors.reset} Python Environment: PASS`);
  console.log(`  ${colors.green}✓${colors.reset} Pikepdf Dependency: PASS`);
  console.log(`  ${verified ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Field Updates: ${verified ? 'PASS' : 'FAIL (fields not updated)'}`);

  console.log(`\n${colors.bright}Next Steps:${colors.reset}`);
  if (verified) {
    console.log(`  1. Check debug-output.pdf - fields should have ALIS codes`);
    console.log(`  2. Run the full workflow via API to test end-to-end`);
  } else {
    console.log(`  1. Check Python script output above for errors`);
    console.log(`  2. Verify pikepdf can modify PDFs directly`);
    console.log(`  3. Check that pdf-field-updater.py is using pikepdf correctly`);
  }

  console.log(`\n`);
}

// Run the debug workflow
runDebugWorkflow().catch(err => {
  log('error', `Fatal error: ${err.message}`);
  process.exit(1);
});
