#!/usr/bin/env node

/**
 * index.js
 *
 * Main CLI entry point for form markup proof-of-concept
 * Orchestrates the complete pipeline: detect fields → extract labels → match codes → generate suggestions
 */

const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const { detectFieldsFromPDF, printFields } = require('./field-detector');
const { extractTextNearFields, printLabels } = require('./label-extractor');
const { matchLabelToCode } = require('./code-matcher');
const {
  generatePropertySuggestions,
  generateSummary,
  printSuggestions,
  printSummary
} = require('./property-suggester');

/**
 * Main pipeline
 */
async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('pdf', {
      alias: 'p',
      describe: 'Path to input PDF file',
      type: 'string',
      demandOption: true
    })
    .option('template', {
      alias: 't',
      describe: 'Form template ID (e.g., move-in-assessment-v1)',
      type: 'string',
      default: null
    })
    .option('output', {
      alias: 'o',
      describe: 'Output JSON file for suggestions',
      type: 'string',
      default: null
    })
    .option('radius', {
      alias: 'r',
      describe: 'Search radius for text extraction in pixels',
      type: 'number',
      default: 100
    })
    .option('verbose', {
      alias: 'v',
      describe: 'Enable verbose output',
      type: 'boolean',
      default: false
    })
    .help()
    .parseSync();

  const pdfPath = argv.pdf;
  const formTemplate = argv.template;
  const searchRadius = argv.radius;
  const verbose = argv.verbose;

  // Validate PDF exists
  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ PDF file not found: ${pdfPath}`);
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║         ALIS Form Markup - Smart Detection Pipeline (PoC)          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  try {
    // Phase 1: Detect fields
    console.log('\n📍 PHASE 1: Field Detection');
    console.log('─'.repeat(70));
    const detectedFields = await detectFieldsFromPDF(pdfPath);
    printFields(detectedFields);

    if (detectedFields.length === 0) {
      console.warn('\n⚠️ No form fields detected. Exiting.');
      process.exit(1);
    }

    // Phase 2: Extract labels via OCR
    console.log('\n🔤 PHASE 2: Label Extraction (OCR)');
    console.log('─'.repeat(70));
    const fieldLabels = await extractTextNearFields(pdfPath, detectedFields, searchRadius);
    printLabels(fieldLabels);

    // Phase 3: Match codes
    console.log('\n🎯 PHASE 3: Code Matching');
    console.log('─'.repeat(70));
    const matchedLabels = fieldLabels.map((label) => {
      const match = matchLabelToCode(label.detected_label, formTemplate);
      return {
        ...label,
        ...match
      };
    });

    // Phase 4: Generate suggestions
    console.log('\n💡 PHASE 4: Property Suggestion Generation');
    console.log('─'.repeat(70));
    const suggestions = generatePropertySuggestions(fieldLabels, formTemplate);
    printSuggestions(suggestions);

    // Phase 5: Summary
    console.log('\n📊 PHASE 5: Summary Report');
    console.log('─'.repeat(70));
    const summary = generateSummary(suggestions);
    printSummary(summary);

    // Output results to JSON if requested
    if (argv.output) {
      const outputPath = argv.output;
      const results = {
        timestamp: new Date().toISOString(),
        input: {
          pdf: path.basename(pdfPath),
          formTemplate: formTemplate || null,
          searchRadius
        },
        detectedFields: detectedFields.length,
        extractedLabels: fieldLabels.length,
        suggestions: suggestions.length,
        summary,
        data: {
          detectedFields,
          fieldLabels,
          suggestions
        }
      };

      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\n✅ Results saved to: ${outputPath}`);
    }

    // Exit successfully
    console.log('\n✅ Pipeline completed successfully!');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Pipeline failed:', err.message);
    if (verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
