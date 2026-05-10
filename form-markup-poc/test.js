#!/usr/bin/env node

/**
 * test.js
 *
 * Test runner for form markup proof-of-concept
 * Runs the pipeline against test PDFs and validates output
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Find test PDFs in common locations
 */
function findTestPDFs() {
  const searchPaths = [
    path.join(__dirname, 'test-pdfs'),
    path.join(__dirname, '../test-data'),
    'C:\\Users\\AaronWhitmer\\alis-hub\\samples',
    'C:\\Users\\AaronWhitmer\\Downloads'
  ];

  const pdfFiles = [];

  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) continue;

    try {
      const files = fs.readdirSync(searchPath);
      for (const file of files) {
        if (file.toLowerCase().endsWith('.pdf')) {
          const fullPath = path.join(searchPath, file);
          pdfFiles.push({
            name: file,
            path: fullPath,
            directory: searchPath
          });
        }
      }
    } catch (err) {
      // Directory access failed, continue
    }
  }

  return pdfFiles;
}

/**
 * Run test on a single PDF
 */
async function runTest(pdfPath, testName = null) {
  const name = testName || path.basename(pdfPath);
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`Testing: ${name}`);
  console.log(`Path: ${pdfPath}`);
  console.log('═'.repeat(80));

  try {
    // Determine if this might be a move-in assessment form
    const isMoveInAssessment =
      name.toLowerCase().includes('move') ||
      name.toLowerCase().includes('assessment') ||
      name.toLowerCase().includes('admission');

    const templateArg = isMoveInAssessment ? '--template move-in-assessment-v1' : '';
    const outputFile = path.join(
      __dirname,
      `results-${Date.now()}-${path.basename(pdfPath, '.pdf')}.json`
    );

    // Run the main pipeline
    const cmd = `node index.js --pdf "${pdfPath}" ${templateArg} --output "${outputFile}" --verbose`;
    console.log(`\nRunning: ${cmd}\n`);

    execSync(cmd, { stdio: 'inherit', cwd: __dirname });

    // Read and display results summary
    if (fs.existsSync(outputFile)) {
      const results = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      console.log('\n' + '─'.repeat(80));
      console.log('RESULTS SUMMARY:');
      console.log('─'.repeat(80));
      console.log(`  Timestamp: ${results.timestamp}`);
      console.log(`  Fields Detected: ${results.detectedFields}`);
      console.log(`  Labels Extracted: ${results.extractedLabels}`);
      console.log(`  Suggestions Generated: ${results.suggestions.length}`);
      console.log(
        `  Matched: ${results.summary.matched_fields} / ${results.summary.total_fields} (${((results.summary.matched_fields / results.summary.total_fields) * 100).toFixed(0)}%)`
      );
      console.log(`  Auto-Approve Ready: ${results.summary.auto_approve} fields`);
      console.log(`  Likely OK: ${results.summary.approve_likely} fields`);
      console.log(`  Needs Review: ${results.summary.review_needed} fields`);
      console.log(`  Manual Review: ${results.summary.manual_review} fields`);
      console.log(`  Average Confidence: ${(results.summary.average_confidence * 100).toFixed(0)}%`);
      console.log(`\n  Full results: ${outputFile}`);
      console.log('─'.repeat(80));

      return {
        success: true,
        testName: name,
        resultsFile: outputFile,
        summary: results.summary
      };
    }

  } catch (err) {
    console.error(`\n❌ Test failed: ${err.message}`);
    return {
      success: false,
      testName: name,
      error: err.message
    };
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║           ALIS Form Markup - Test Suite (PoC)                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  const args = process.argv.slice(2);

  // If PDF path provided as argument, test only that
  if (args.length > 0 && fs.existsSync(args[0])) {
    await runTest(args[0]);
    return;
  }

  // Otherwise, find and test available PDFs
  console.log('\nSearching for test PDFs...');
  const testPDFs = findTestPDFs();

  if (testPDFs.length === 0) {
    console.log('\n⚠️ No PDFs found in standard test locations.');
    console.log('\nUsage:');
    console.log('  node test.js                    # Search for test PDFs');
    console.log('  node test.js <path-to-pdf>     # Test specific PDF');
    console.log('\nExample:');
    console.log('  node test.js "C:\\path\\to\\form.pdf"');
    console.log('\nTo add test PDFs, place them in:');
    console.log(`  ${path.join(__dirname, 'test-pdfs')}`);
    return;
  }

  console.log(`\nFound ${testPDFs.length} PDF(s):`);
  for (let i = 0; i < testPDFs.length; i++) {
    console.log(`  ${i + 1}. ${testPDFs[i].name}`);
    console.log(`     → ${testPDFs[i].path}`);
  }

  // Run tests
  const results = [];
  for (const pdf of testPDFs) {
    const result = await runTest(pdf.path, pdf.name);
    results.push(result);
  }

  // Print final summary
  console.log('\n' + '═'.repeat(80));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(80));

  let passCount = 0;
  let failCount = 0;

  for (const result of results) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${result.testName}`);
    if (result.success) {
      passCount++;
      console.log(`      Matched: ${result.summary.matched_fields}/${result.summary.total_fields}`);
    } else {
      failCount++;
      console.log(`      Error: ${result.error}`);
    }
  }

  console.log('═'.repeat(80));
  console.log(`Results: ${passCount} passed, ${failCount} failed`);
  console.log('═'.repeat(80) + '\n');
}

// Run if called directly
if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Test runner failed:', err);
    process.exit(1);
  });
}

module.exports = { runTest, findTestPDFs };
