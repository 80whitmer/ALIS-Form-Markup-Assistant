const path = require('path');
const fs = require('fs');

// Load ALIS field aggressiveness config
const alisConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'alis-field-aggressiveness.json'), 'utf-8')
);

/**
 * Match OCR detected text against ALIS field keywords
 * Returns suggested ALIS field code and confidence score
 */
function matchAlisField(ocrText, aggressivenessLevel = 'off') {
  if (aggressivenessLevel === 'off' || !ocrText) {
    return null;
  }

  const config = alisConfig.levels[aggressivenessLevel];
  if (!config || !config.keywords) {
    return null;
  }

  const normalizedText = ocrText.toLowerCase().trim();
  let bestMatch = null;
  let highestScore = 0;

  // Search through each keyword category
  for (const [fieldName, keywords] of Object.entries(config.keywords)) {
    for (const keyword of keywords) {
      // Simple substring matching with word boundary consideration
      const keywordLower = keyword.toLowerCase();

      // Check if keyword is in text (simple approach)
      if (normalizedText.includes(keywordLower)) {
        // Score based on how specific the match is
        let score = keyword.length / normalizedText.length; // Longer keywords = higher specificity
        score = Math.min(score, 1.0); // Cap at 1.0

        if (score > highestScore) {
          highestScore = score;
          bestMatch = fieldName;
        }
      }
    }
  }

  // Only return match if confidence threshold is met (for aggressive mode)
  const threshold = config.confidenceThreshold || 0.5;
  if (highestScore >= threshold) {
    return {
      field_name: bestMatch,
      confidence: Math.round(highestScore * 100),
      aggressiveness: aggressivenessLevel
    };
  }

  return null;
}

/**
 * Generate ALIS-anchored suggestion based on aggressiveness level
 * Converts standard field suggestion to ALIS-anchored format
 */
function generateAlisSuggestion(suggestion, aggressivenessLevel = 'off') {
  if (aggressivenessLevel === 'off') {
    return null;
  }

  const config = alisConfig.levels[aggressivenessLevel];
  if (!config.fields) {
    return null;
  }

  // Try to match OCR text to ALIS field
  const ocrLabel = suggestion.match_text || suggestion.field_name || '';
  const match = matchAlisField(ocrLabel, aggressivenessLevel);

  if (match) {
    // Return ALIS-anchored suggestion
    return {
      anchor_name: `resident.alis.${match.field_name}`,
      confidence: match.confidence,
      is_alis: true,
      matched_field: match.field_name
    };
  }

  return null;
}

/**
 * Merge ALIS suggestions with standard suggestions
 * Creates dual suggestions when ALIS match found
 */
function mergeAlisSuggestions(standardSuggestions, aggressivenessLevel = 'off') {
  if (aggressivenessLevel === 'off') {
    return standardSuggestions;
  }

  return standardSuggestions.map(suggestion => {
    const alisSuggestion = generateAlisSuggestion(suggestion, aggressivenessLevel);

    return {
      ...suggestion,
      alis_suggestion: alisSuggestion,
      has_alis_option: !!alisSuggestion
    };
  });
}

module.exports = {
  alisConfig,
  matchAlisField,
  generateAlisSuggestion,
  mergeAlisSuggestions,
  getAvailableLevels: () => Object.keys(alisConfig.levels),
  getLevelConfig: (level) => alisConfig.levels[level]
};
