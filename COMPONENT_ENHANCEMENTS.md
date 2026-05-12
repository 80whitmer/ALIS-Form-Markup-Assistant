# FormMarkup Component Enhancements

## Overview
The FormMarkup.jsx React component has been enhanced with four major features to improve the form field approval workflow.

---

## Feature 1: Enhanced Properties Column with Border Detection

### What's New
- The **Properties** column now displays **border/outline status** of fields
- Added a border badge (🔲) that shows the detected border style:
  - **None** (gray) - No border applied
  - **Custom** (orange) - Custom border color detected
  - **Filled** (orange) - Background color applied
  - **Unknown** - Border status could not be determined

### Implementation Details
- New `extractBorderInfo()` function parses `field_properties` JSON
- Checks for `border_style`, `outline_color`, and `background_color` properties
- Falls back gracefully if properties are missing or malformed
- Displays alongside existing property indicators (🔐 password, 📄 multiline, ✏️ rich_text, etc.)

### Usage
- Hover over the border badge for a tooltip
- Instantly see which fields have border styling applied
- No additional configuration needed - automatically detects from PDF

---

## Feature 2: Confidence Metric Implementation

### What's New
- **Confidence** column now properly displays OCR-based certainty of signer detection
- Shows as a visual percentage bar + numerical percentage
- Confidence value represents how accurately the OCR text extraction near the field matched a configured signer

### How It Works
1. During PDF analysis, text is extracted near each field using OCR (configurable radius, default 100px)
2. Extracted labels are fuzzy-matched against configured signers
3. Confidence score reflects the match quality:
   - **95%+** = High confidence match
   - **80-95%** = Good confidence match
   - **70-80%** = Moderate confidence, review recommended
   - **<70%** = Low confidence, manual review needed

### Implementation Details
- Confidence is calculated during form markup analysis
- Stored in the `confidence` REAL column in the suggestions table
- Display uses green progress bar for visual feedback
- Tooltip explains "OCR match confidence for signer detection"

### Usage
- Trust fields with 95%+ confidence - these are highly reliable signer detections
- Review fields with 70-95% confidence to verify the signer assignment
- Manually check fields with <70% confidence
- Signer selection quality depends on clarity of labels near fields in the PDF

---

## Feature 3: Toggle View - Current vs Suggested

### What's New
- Added **View Mode Toggle** button in the header (blue button with Eye icon)
- Switch between two viewing modes:
  - **Suggested** → Shows recommended changes (what your system suggests)
  - **Current** → Shows existing PDF field properties (what's already in the PDF)

### Suggested View (Default)
- Shows all fields with editable inputs
- Displays:
  - **Type**: Field type (text, signature, checkbox, etc.)
  - **Suggested Code**: The ALIS code recommendation (editable)
  - **Signer**: Dropdown to assign signer (editable)
  - **Properties**: Property badges including border detection
  - **Required**: Checkbox to mark field as required (editable)
  - **Read-Only**: Checkbox to mark field as read-only (editable)
  - **Confidence**: OCR match confidence percentage

### Current View
- Shows read-only display of existing PDF properties
- Displays:
  - **Type**: Field type (read-only)
  - **Current Name**: The original PDF field name (read-only, gray background)
  - **Signer**: Shows "(N/A)" - not applicable for current view
  - **Properties**: Shows "(Current properties)" note
  - **Required**: Shows ✓ or ○ checkmark indicator
  - **Read-Only**: Shows ✓ or ○ checkmark indicator
  - **Confidence**: Shows OCR confidence for reference

### Implementation Details
- New `viewMode` state tracks current view ('suggested' or 'current')
- Toggle button updates view with smooth transition
- Current values stored in each suggestion:
  - `current_field_name`: Original PDF name
  - `current_required`: Original required status
  - `current_read_only`: Original read-only status
- Input fields are conditionally rendered based on view mode

### Usage
1. Click the **View Current →** button to switch to current view
2. Compare what's currently in the PDF vs what's recommended
3. Click **View Suggested →** to return to editing mode
4. This helps validate your changes are reasonable vs current state

---

## Feature 4: Bulk Property Assignment

### What's New
- **Checkbox selection** on each field for bulk operations
- **"Select All on Page"** checkbox in the header to quickly select/deselect all fields on current page
- **Bulk Assign Panel** appears when fields are selected
- Apply properties to multiple fields at once instead of one-by-one

### How It Works

1. **Select Fields**:
   - Click checkbox next to individual fields
   - Or click the checkbox in the header to select all on current page
   - Selection counter shows "X fields selected"

2. **Open Bulk Panel**:
   - Once fields are selected, a green **"Bulk Assign"** button appears
   - Click it to open the bulk properties panel

3. **Configure Properties**:
   - Three-state buttons for each property:
     - **Yes** (green) - Apply the setting
     - **No** (gray) - Uncheck the setting
     - **Skip** (light gray) - Don't modify this property
   - Properties available:
     - **Required**: Mark selected fields as required/optional
     - **Read-Only**: Mark selected fields as read-only/editable

4. **Apply**:
   - Click **"Apply to X Fields"** button
   - Properties instantly applied to all selected fields
   - Confirmation alert shows success

### Implementation Details
- New `selectedFields` Set tracks checkbox states by index
- New `bulkProperties` state tracks pending bulk changes:
  - `required`: null (skip) | true (yes) | false (no)
  - `read_only`: null (skip) | true (yes) | false (no)
- `handleToggleFieldSelection()`: Toggle individual field selection
- `handleSelectAllOnPage()`: Toggle all fields on current page
- `handleApplyBulkProperties()`: Apply bulk changes in one operation
- Three-state approach (null/true/false) allows skipping properties you don't want to change

### Usage Example
**Scenario**: You have 8 signature fields on a page and want all of them to be required and read-only.

1. Click the header checkbox to select all fields on the page
2. Click "Bulk Assign" button
3. For **Required**: Click "Yes" button
4. For **Read-Only**: Click "Yes" button
5. Click "Apply to 8 Fields"
6. ✅ All 8 signature fields are now marked as required and read-only

---

## Integration Points

### Database
- `confidence` column: Already in suggestions table, now properly displayed
- `field_properties` column: Already stored, now enhanced for border detection
- `current_required` & `current_read_only`: Stored from initial data load

### API
- `/api/jobs/:jobId` endpoint: Returns suggestions with all properties
- Confidence values come from form-markup analysis phase
- Field properties come from PDF field detection

### Visual Design
- Uses existing ALIS brand colors (red-orange, gold-yellow, etc.)
- Responsive design works on various screen sizes
- Color-coded fields for quick visual scanning
- Green/blue color scheme for new interactive elements (toggle, bulk panel)

---

## User Workflow

### Recommended Approval Process

1. **Initial Load**: System analyzes PDF and suggests ALIS codes and signers
2. **Review in Suggested View**:
   - Check type, suggested code, and signer assignments
   - Note confidence percentages (higher is better)
   - Edit as needed
3. **Toggle to Current View**:
   - See what's currently in the PDF
   - Verify your suggestions are reasonable changes
   - Toggle back to suggested view if needed
4. **Use Bulk Assign**:
   - Select similar fields (e.g., all text fields, all signature fields)
   - Apply common properties (Required, Read-Only) efficiently
5. **Final Review**:
   - Check Properties column for any special field characteristics
   - Ensure border detection is accurate for visual fields
6. **Apply & Download**:
   - Click "Apply & Download" to generate modified PDF
   - All changes persisted to PDF field definitions

---

## Technical Notes

- All features work with existing backend (no new API endpoints needed)
- Component is backward-compatible with existing suggestion data structure
- Graceful handling of missing properties (null, undefined, empty strings)
- No additional dependencies added
- Performance optimized for 100+ fields per page
- Selection state cleared on data refresh to prevent stale selections

---

## Future Enhancement Ideas

- **Batch export**: Download multiple modified PDFs at once
- **Field grouping**: Group fields by type or page for easier bulk operations
- **Property presets**: Save/load property configurations
- **OCR confidence tuning**: Adjust confidence thresholds per form template
- **Field comparison**: Side-by-side visual diff of current vs suggested
- **Undo/Redo**: Track changes with ability to revert

