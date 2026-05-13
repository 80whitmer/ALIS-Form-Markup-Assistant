# ALIS Field Suggestions Feature

## Overview

The ALIS Field Suggestions feature allows users to automatically generate ALIS-compliant field suggestions based on OCR text analysis. This feature uses a three-level toggle to control suggestion aggressiveness, from static/conservative to aggressive keyword matching.

## Three-Level Toggle

### Level 1: Off
- **Description**: No ALIS field suggestions
- **Use Case**: Standard field markup only, no ALIS anchoring

### Level 2: Low (Static Fields)
- **Description**: Only very static, commonly found fields
- **Suggested Fields**:
  - `alis.resident.first_name`
  - `alis.resident.middle_name`
  - `alis.resident.last_name`
  - `alis.resident.full_name`
  - `alis.resident.dob`
  - `alis.resident.gender`
  - `alis.resident.ssn`
- **Matching**: Simple keyword matching for common identifiers
- **Use Case**: Conservative approach for basic compliance documents

### Level 3: High (Aggressive Matching)
- **Description**: Comprehensive ALIS field matching with aggressive keyword analysis
- **Features**:
  - Keyword matching against 30+ ALIS field categories
  - OCR text analysis to find field descriptors
  - Confidence scoring based on keyword specificity
  - Covers personal info, contact, medical, legal, and administrative fields
- **Examples**:
  - "Date of Birth" → `alis.resident.dob`
  - "Physician Name" → `alis.resident.physician`
  - "Emergency Contact" → `alis.resident.emergency_contact`
  - "Insurance Policy" → `alis.resident.insurance_policy`
- **Use Case**: Comprehensive form analysis for complex compliance documents

## Architecture

### Files

1. **Client-Side** (`Upload.jsx`)
   - Three-button toggle UI for aggressiveness level
   - Integrated into the PDF upload form
   - Passes selection to backend via `alis_aggressiveness` parameter

2. **Server Configuration** (`config/alis-field-aggressiveness.json`)
   - Defines all ALIS field mappings by level
   - Contains keyword dictionaries for matching
   - Configurable thresholds and confidence scoring

3. **ALIS Matcher** (`services/alis-suggestion-matcher.js`)
   - Core matching engine
   - Functions:
     - `matchAlisField()` - Match OCR text to ALIS field
     - `generateAlisSuggestion()` - Create ALIS suggestion
     - `mergeAlisSuggestions()` - Blend ALIS with standard suggestions

4. **Form Markup Pipeline** (`services/form-markup.js`)
   - Integrated in Phase 2c of processing
   - Augments standard suggestions with ALIS options
   - Preserves all original suggestion data

## How It Works

### Process Flow

1. **User uploads PDF** with aggressiveness level selected
2. **Phase 1**: Standard field detection
3. **Phase 1b**: OCR text extraction and signer detection
4. **Phase 2**: Standard suggestion generation
5. **Phase 2c**: ALIS suggestion generation and merging
6. **Phase 3**: Preview image generation using augmented suggestions
7. **Approval UI**: User can select standard OR ALIS suggestion per field

### Matching Algorithm

```
For each suggestion:
  Extract OCR text (match_text)
  For each keyword category in aggressiveness level:
    For each keyword in category:
      If keyword found in OCR text:
        Score = keyword_length / text_length
        If score > threshold:
          Record as potential ALIS field match
  Return highest-scoring match
```

### Suggestion Output Format

Standard suggestion:
```json
{
  "field_name": "resident.text.1",
  "suggested_code": "resident.text.1",
  "signer": "resident",
  "match_text": "Date of Birth"
}
```

With ALIS option (when enabled):
```json
{
  "field_name": "resident.text.1",
  "suggested_code": "resident.text.1",
  "signer": "resident",
  "match_text": "Date of Birth",
  "has_alis_option": true,
  "alis_suggestion": {
    "anchor_name": "resident.alis.resident.dob",
    "confidence": 95,
    "is_alis": true,
    "matched_field": "resident.dob"
  }
}
```

## User Experience

### Upload Form
1. User uploads PDF
2. Selects company and document title
3. **NEW**: Chooses ALIS aggressiveness level
4. Configures signers
5. Submits for analysis

### Approval UI
- Each field shows dual suggestion options when ALIS match found:
  - **Standard**: `resident.text.1`
  - **ALIS**: `resident.alis.resident.dob` ← Links to compliance profile
- User can toggle between options or manually edit either
- All ALIS-anchored fields automatically update resident profile

## Benefits

1. **Compliance Speed**: Automatically link form fields to compliance sections
2. **Flexibility**: Three levels accommodate different accuracy/coverage tradeoffs
3. **Control**: Users always have choice between standard and ALIS suggestions
4. **Non-Destructive**: ALIS option doesn't replace standard suggestions, just offers alternative
5. **Data Integration**: ALIS fields automatically sync with resident profiles

## Implementation Notes

### Keyword Coverage (High Aggressiveness)
- **Personal**: first_name, middle_name, last_name, full_name, dob, age, gender, race, marital_status, nickname
- **Contact**: phone, email, address, city, state, zip
- **Medical**: physician, hospital, diagnosis, medication, allergy
- **Legal**: power_of_attorney, guardian, emergency_contact
- **Administrative**: insurance, religious_affiliation

### Confidence Scoring
- Based on keyword specificity (longer keywords = higher confidence)
- Threshold: 30% for "high" aggressiveness level
- Can be adjusted in configuration file

### Performance
- ALIS matching is O(n*m) where n=suggestions, m=keywords
- Runs in Phase 2c before preview generation
- Minimal performance impact on processing

## Future Enhancements

1. **Machine Learning**: Replace keyword matching with trained classifier
2. **Field Context**: Consider adjacent fields and field types
3. **User Learning**: Track which ALIS matches users accept/reject
4. **Custom Mappings**: Allow organizations to define their own keywords
5. **Batch Operations**: Apply ALIS suggestions to multiple forms
