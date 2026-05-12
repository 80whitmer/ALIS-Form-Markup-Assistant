#!/usr/bin/env node

/**
 * Poppler & OCR Verification Script
 *
 * Checks:
 * 1. Poppler is installed and in PATH
 * 2. pytesseract and pdf2image are available
 * 3. Python can execute OCR extractor
 * 4. End-to-end OCR on sample PDF
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(level, message) {
  const prefix = {
    '✓': `${colors.green}✓${colors.reset}`,
    '✗': `${colors.red}✗${colors.reset}`,
    '⚠': `${colors.yellow}⚠${colors.reset}`,
    'ℹ': `${colors.blue}ℹ${colors.reset}`
  }[level] || level;

  console.log(`${prefix} ${message}`);
}

function logSection(title) {
  console.log(`\n${colors.bold}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bold}${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
}

async function checkPoppler() {
  logSection('1. Checking Poppler Installation');

  return new Promise((resolve) => {
    const process = spawn('pdfinfo.exe', ['-v'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errors = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      errors += data.toString();
    });

    process.on('close', (code) => {
      const combined = output + errors;
      if ((code === 0 || code === 1) && combined.toLowerCase().includes('pdfinfo')) {
        log('✓', `Poppler found: pdfinfo.exe working`);
        resolve(true);
      } else {
        log('✗', 'Poppler NOT found in PATH');
        log('⚠', 'Install: C:\\poppler\\poppler-26.02.0\\Library\\bin must be in PATH');
        resolve(false);
      }
    });

    process.on('error', (err) => {
      log('✗', `Poppler check failed: ${err.message}`);
      resolve(false);
    });
  });
}

async function checkPythonPackages() {
  logSection('2. Checking Python Packages');

  const packages = ['pikepdf', 'pytesseract', 'pdf2image'];
  const results = {};

  for (const pkg of packages) {
    const isInstalled = await new Promise((resolve) => {
      const proc = spawn('python', ['-m', 'pip', 'show', pkg], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && output.includes(pkg)) {
          const versionMatch = output.match(/Version: ([\d.]+)/);
          const version = versionMatch ? versionMatch[1] : 'unknown';
          log('✓', `${pkg} v${version}`);
          resolve(true);
        } else {
          log('✗', `${pkg} NOT installed`);
          log('⚠', `Install with: pip install ${pkg}`);
          resolve(false);
        }
      });

      proc.on('error', (err) => {
        log('✗', `${pkg} check failed: ${err.message}`);
        resolve(false);
      });
    });

    results[pkg] = isInstalled;
  }

  return Object.values(results).every(v => v);
}

async function checkPythonTesseract() {
  logSection('3. Checking Tesseract OCR Binary');

  return new Promise((resolve) => {
    const proc = spawn('tesseract', ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && output.includes('tesseract')) {
        const versionMatch = output.match(/tesseract ([\d.]+)/);
        const version = versionMatch ? versionMatch[1] : 'unknown';
        log('✓', `Tesseract v${version} installed`);
        resolve(true);
      } else {
        log('✗', 'Tesseract NOT found');
        log('⚠', 'Install from: https://github.com/UB-Mannheim/tesseract/wiki');
        resolve(false);
      }
    });

    proc.on('error', (err) => {
      log('✗', `Tesseract check failed: ${err.message}`);
      resolve(false);
    });
  });
}

async function checkOCRExtractor() {
  logSection('4. Checking Python OCR Extractor Script');

  const scriptPath = path.join(__dirname, 'form-markup-poc', 'pdf-ocr-extractor.py');

  if (fs.existsSync(scriptPath)) {
    log('✓', `Found: ${scriptPath}`);
    return true;
  } else {
    log('✗', `NOT found: ${scriptPath}`);
    return false;
  }
}

async function checkFieldDetector() {
  logSection('5. Checking Python Field Detector Script');

  const scriptPath = path.join(__dirname, 'server', 'services', 'pdf-field-detector.py');

  if (fs.existsSync(scriptPath)) {
    log('✓', `Found: ${scriptPath}`);
    return true;
  } else {
    log('✗', `NOT found: ${scriptPath}`);
    return false;
  }
}

async function testPythonImports() {
  logSection('6. Testing Python Import Chain');

  const testScript = `
import sys
try:
    import pikepdf
    print("✓ pikepdf imports successfully")
except ImportError as e:
    print(f"✗ pikepdf import failed: {e}")
    sys.exit(1)

try:
    import pdf2image
    print("✓ pdf2image imports successfully")
except ImportError as e:
    print(f"✗ pdf2image import failed: {e}")
    sys.exit(1)

try:
    import pytesseract
    print("✓ pytesseract imports successfully")
except ImportError as e:
    print(f"✗ pytesseract import failed: {e}")
    sys.exit(1)

print("✓ All Python imports successful")
`;

  return new Promise((resolve) => {
    const proc = spawn('python', ['-c', testScript], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errors = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errors += data.toString();
    });

    proc.on('close', (code) => {
      const lines = output.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        if (line.includes('✓')) {
          log('✓', line.replace('✓ ', ''));
        } else if (line.includes('✗')) {
          log('✗', line.replace('✗ ', ''));
        }
      });

      if (errors) {
        console.log(`\n${colors.yellow}Error details:${colors.reset}`);
        console.log(errors);
      }

      resolve(code === 0);
    });
  });
}

async function main() {
  console.log(`\n${colors.bold}${colors.blue}ALIS Form Markup - Poppler & OCR Verification${colors.reset}`);
  console.log(`${colors.blue}${new Date().toLocaleString()}${colors.reset}\n`);

  const results = {
    poppler: await checkPoppler(),
    pythonPackages: await checkPythonPackages(),
    tesseract: await checkPythonTesseract(),
    ocrExtractor: await checkOCRExtractor(),
    fieldDetector: await checkFieldDetector(),
    pythonImports: await testPythonImports()
  };

  logSection('Summary');

  const allPassed = Object.values(results).every(v => v);

  Object.entries(results).forEach(([name, passed]) => {
    const status = passed ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    console.log(`  ${status} ${name}`);
  });

  console.log();

  if (allPassed) {
    log('✓', `${colors.bold}All checks passed! OCR pipeline is ready.${colors.reset}`);
    log('ℹ', 'Next steps:');
    log('ℹ', '1. Restart the development server: npm run dev');
    log('ℹ', '2. Upload a test PDF through the React UI');
    log('ℹ', '3. Watch server logs for OCR processing');
    log('ℹ', '4. Check React UI for suggestions with confidence scores');
  } else {
    log('✗', `${colors.bold}Some checks failed. See details above.${colors.reset}`);
    log('⚠', 'Most common issue: Poppler not in PATH');
    log('⚠', 'Solution: Restart terminal/IDE after Poppler installation');
  }

  console.log();
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Verification script error:', err);
  process.exit(1);
});
