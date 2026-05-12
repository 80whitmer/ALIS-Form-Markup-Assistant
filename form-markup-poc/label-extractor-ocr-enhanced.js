/**
 * label-extractor-ocr-enhanced.js
 *
 * Enhanced OCR-based signer label detection for PDF form fields.
 * Uses directional text search with confidence scoring based on proximity.
 *
 * Features:
 * - Page-by-page text extraction with coordinates
 * - Directional zones (ABOVE, BELOW, LEFT, RIGHT, INSIDE)
 * - Distance-based confidence scoring: confidence = max(0, 1.0 - (distance / radius))
 * - 20% confidence boost for ABOVE zone labels
 * - Signer keyword matching (resident, staff, admin, family)
 *
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {Array} fields - Detected form fields with coordinates
 * @param {Array} availableSigners - List of signer keywords to search for
 * @param {number} ocrRadius - Search radius in pixels (default 100)
 * @returns {Promise<Array>} Array of {field_name, signer, confidence, match_text, match_zone, match_reason}
 */

const pdfjs = require('pdfjs-dist/legacy/build/pdf');

// Set up pdfjs worker
try {
  pdfjs.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/legacy/build/pdf.worker.entry');
} catch (e) {
  console.warn('[ocr-enhanced] pdfjs worker warning:', e.message);
}

/**
 * Extract text with coordinates from PDF pages
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} Map of page number to extracted text items with coordinates
 */
async function extractTextWithCoordinates(pdfBuffer) {
  try {
    // Convert Buffer to Uint8Array for pdfjs-dist
    const uint8Array = new Uint8Array(pdfBuffer);

    const pdf = await pdfjs.getDocument({ data: uint8Array }).promise;
    const textByPage = {};

    console.log(`[ocr-enhanced] Extracting text from ${pdf.numPages} pages...`);

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        const pageTexts = [];

        if (textContent && textContent.items) {
          textContent.items.forEach(item => {
            if (item.str && item.str.trim()) {
              // Convert PDF coordinates to pixel-like values
              pageTexts.push({
                text: item.str.trim(),
                x: item.x,
                y: item.y,
                width: item.width || 0,
                height: item.height || 0,
                // Normalize to roughly match field coordinates
                normalized: {
                  x: Math.round(item.x),
                  y: Math.round(item.y)
                }
              });
            }
          });
        }

        textByPage[pageNum] = pageTexts;

        if (pageTexts.length > 0) {
          console.log(`[ocr-enhanced] Page ${pageNum}: Extracted ${pageTexts.length} text items`);
        }
      } catch (pageErr) {
        console.warn(`[ocr-enhanced] Error extracting text from page ${pageNum}:`, pageErr.message);
        textByPage[pageNum] = [];
      }
    }

    return textByPage;
  } catch (err) {
    console.error('[ocr-enhanced] Error extracting text:', err.message);
    throw err;
  }
}

/**
 * Normalize text for keyword matching (lowercase, remove punctuation)
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, '');
}

/**
 * Determine zone and distance from field to text
 * Zones: ABOVE (top), BELOW (bottom), LEFT (left), RIGHT (right), INSIDE (overlapping)
 *
 * @param {Object} field - Field object with x, y, width, height
 * @param {Object} textItem - Text item with x, y, width, height
 * @returns {Object} {distance, zone, zoneBoost}
 */
function calculateZoneAndDistance(field, textItem) {
  const fieldLeft = field.x || 0;
  const fieldTop = field.y || 0;
  const fieldRight = fieldLeft + (field.width || 0);
  const fieldBottom = fieldTop + (field.height || 0);

  const textLeft = textItem.x || 0;
  const textTop = textItem.y || 0;
  const textRight = textLeft + (textItem.width || 0);
  const textBottom = textTop + (textItem.height || 0);

  // Check if overlapping (INSIDE)
  const overlaps = !(textRight < fieldLeft || textLeft > fieldRight ||
                     textBottom < fieldTop || textTop > fieldBottom);

  if (overlaps) {
    return {
      distance: 0,
      zone: 'INSIDE',
      zoneBoost: 1.0
    };
  }

  // Calculate minimum distance to field edges
  let minDistance = Infinity;
  let zone = null;
  let zoneBoost = 1.0;

  // Distance to top edge (ABOVE)
  if (textBottom < fieldTop) {
    const distance = fieldTop - textBottom;
    if (distance < minDistance) {
      minDistance = distance;
      zone = 'ABOVE';
      zoneBoost = 1.2; // 20% boost for ABOVE zone
    }
  }

  // Distance to bottom edge (BELOW)
  if (textTop > fieldBottom) {
    const distance = textTop - fieldBottom;
    if (distance < minDistance) {
      minDistance = distance;
      zone = 'BELOW';
      zoneBoost = 1.0;
    }
  }

  // Distance to left edge (LEFT)
  if (textRight < fieldLeft) {
    const distance = fieldLeft - textRight;
    if (distance < minDistance) {
      minDistance = distance;
      zone = 'LEFT';
      zoneBoost = 1.0;
    }
  }

  // Distance to right edge (RIGHT)
  if (textLeft > fieldRight) {
    const distance = textLeft - fieldRight;
    if (distance < minDistance) {
      minDistance = distance;
      zone = 'RIGHT';
      zoneBoost = 1.0;
    }
  }

  // If we couldn't determine zone (shouldn't happen), use NEARBY
  if (zone === null) {
    const centerX = fieldLeft + (field.width || 0) / 2;
    const centerY = fieldTop + (field.height || 0) / 2;
    const textCenterX = textLeft + (textItem.width || 0) / 2;
    const textCenterY = textTop + (textItem.height || 0) / 2;
    minDistance = Math.sqrt(
      Math.pow(centerX - textCenterX, 2) + Math.pow(centerY - textCenterY, 2)
    );
    zone = 'NEARBY';
    zoneBoost = 1.0;
  }

  return {
    distance: Math.max(0, minDistance),
    zone,
    zoneBoost
  };
}

/**
 * Calculate confidence based on distance and zone
 * confidence = max(0, 1.0 - (distance / radius)) * zoneBoost
 * capped at 1.0
 *
 * @param {number} distance - Distance in pixels
 * @param {number} radius - Search radius in pixels
 * @param {number} zoneBoost - Multiplier for zone (1.0 or 1.2 for ABOVE)
 * @returns {number} Confidence score 0.0-1.0
 */
function calculateConfidence(distance, radius, zoneBoost = 1.0) {
  const baseConfidence = Math.max(0, 1.0 - (distance / radius));
  const boostedConfidence = baseConfidence * zoneBoost;
  return Math.min(1.0, boostedConfidence);
}

/**
 * Find signer keywords in text near a field
 * @param {Array} pageTexts - Text items from page
 * @param {Object} field - Field object
 * @param {Array} signerKeywords - Keywords to search for
 * @param {number} searchRadius - Search radius in pixels
 * @returns {Array} Matching signer results sorted by confidence
 */
function findSignersNearField(pageTexts, field, signerKeywords, searchRadius) {
  const matches = [];

  pageTexts.forEach(textItem => {
    const normalizedText = normalizeText(textItem.text);

    // Check if text contains any signer keyword
    for (const keyword of signerKeywords) {
      const normalizedKeyword = normalizeText(keyword);

      if (normalizedText.includes(normalizedKeyword)) {
        const { distance, zone, zoneBoost } = calculateZoneAndDistance(field, textItem);

        // Only include if within search radius
        if (distance <= searchRadius) {
          const confidence = calculateConfidence(distance, searchRadius, zoneBoost);

          matches.push({
            signer: keyword.toLowerCase(),
            confidence,
            distance,
            zone,
            match_text: textItem.text,
            match_zone: zone,
            match_reason: `Found "${keyword}" ${distance > 0 ? `${Math.round(distance)}px` : ''} in ${zone} zone`,
            raw: {
              x: textItem.x,
              y: textItem.y,
              width: textItem.width,
              height: textItem.height
            }
          });
        }
      }
    }
  });

  // Sort by confidence (highest first), then by distance (closest first)
  return matches.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return a.distance - b.distance;
  });
}

/**
 * Main function: Extract signer labels from PDF with OCR
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {Array} fields - Detected form fields
 * @param {Array} availableSigners - Signer keywords to search for
 * @param {number} ocrRadius - Search radius in pixels
 * @returns {Promise<Array>} Array of signer detection results
 */
async function extractSignerLabels(pdfBuffer, fields, availableSigners = [], ocrRadius = 100) {
  try {
    console.log(`[ocr-enhanced] Starting signer label extraction (radius: ${ocrRadius}px)`);

    if (!Array.isArray(fields) || fields.length === 0) {
      console.warn('[ocr-enhanced] No fields provided');
      return [];
    }

    if (!Array.isArray(availableSigners) || availableSigners.length === 0) {
      availableSigners = ['resident', 'staff', 'admin', 'family'];
      console.log('[ocr-enhanced] Using default signers:', availableSigners.join(', '));
    }

    // Extract text with coordinates from all pages
    const textByPage = await extractTextWithCoordinates(pdfBuffer);

    // Process each field
    const results = [];
    let fieldsWithMatches = 0;

    for (const field of fields) {
      const pageNum = field.field_page || 1;
      const pageTexts = textByPage[pageNum] || [];

      if (pageTexts.length === 0) {
        continue;
      }

      // Find matching signers near this field
      const matches = findSignersNearField(pageTexts, field, availableSigners, ocrRadius);

      if (matches.length > 0) {
        fieldsWithMatches++;

        // Use the highest confidence match
        const bestMatch = matches[0];

        results.push({
          field_name: field.field_name,
          signer: bestMatch.signer,
          confidence: bestMatch.confidence,
          match_text: bestMatch.match_text,
          match_zone: bestMatch.match_zone,
          match_reason: bestMatch.match_reason,
          distance: bestMatch.distance
        });

        console.log(`[ocr-enhanced] Field "${field.field_name}": Found "${bestMatch.signer}" (${Math.round(bestMatch.confidence * 100)}% confidence)`);
      }
    }

    console.log(`[ocr-enhanced] Signer extraction complete: Matched ${fieldsWithMatches} of ${fields.length} fields`);
    return results;

  } catch (err) {
    console.error('[ocr-enhanced] Error extracting signers:', err.message);
    throw err;
  }
}

module.exports = {
  extractSignerLabels,
  extractTextWithCoordinates,
  findSignersNearField,
  calculateZoneAndDistance,
  calculateConfidence,
  normalizeText
};
