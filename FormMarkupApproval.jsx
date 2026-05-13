import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

/**
 * Form Markup Approval Interface (Enhanced)
 *
 * Displays suggestions from form field analysis and allows users to:
 * - Filter by Type and Signer
 * - Review detected field names (Current Field Name column)
 * - Adjust ALIS code suggestions with auto-generation
 * - Bulk assign signers with cascading code updates
 * - Modify signer assignments (auto-updates suggested code)
 * - Set required/read-only flags
 * - Approve or reject suggestions
 * - Navigate pages with grid-based pagination (5 columns × N rows)
 * - Apply approved changes to PDF
 */
export default function FormMarkupApproval() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [originalSuggestions, setOriginalSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [progress, setProgress] = useState(0); // Loading bar progress (0-100)
  const [selectedPreviewId, setSelectedPreviewId] = useState(null); // Which field's preview to show

  // Filter and bulk action state
  const [typeFilter, setTypeFilter] = useState('');
  const [signerFilter, setSignerFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [bulkSignerValue, setBulkSignerValue] = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [selectAllCheckbox, setSelectAllCheckbox] = useState(null);

  const ITEMS_PER_PAGE = 25;
  const COLUMNS = 5;

  // Handle select-all checkbox indeterminate state
  useEffect(() => {
    if (selectAllCheckbox) {
      const filteredSuggestions = getFilteredSuggestions();
      const pageStart = (currentPage - 1) * ITEMS_PER_PAGE;
      const pageEnd = pageStart + ITEMS_PER_PAGE;
      const pageSuggestions = filteredSuggestions.slice(pageStart, pageEnd);
      const pageOnThisPage = pageSuggestions.filter(s => selectedRows.has(s.id)).length;

      if (pageOnThisPage > 0 && pageOnThisPage < pageSuggestions.length) {
        selectAllCheckbox.indeterminate = true;
      } else {
        selectAllCheckbox.indeterminate = false;
      }
    }
  }, [selectedRows, currentPage, suggestions, typeFilter, signerFilter, selectAllCheckbox]);

  // Poll job progress while loading
  useEffect(() => {
    if (!loading || !jobId) return;

    const pollProgress = async () => {
      try {
        const progressRes = await fetch(`/api/jobs/${jobId}/progress`);
        if (progressRes.ok) {
          const progressData = await progressRes.json();
          setProgress(progressData.percentage || 0);
        }
      } catch (err) {
        // Silently fail on progress polling
        console.debug('[progress] Poll error:', err.message);
      }
    };

    // Poll every 500ms
    const interval = setInterval(pollProgress, 500);
    pollProgress(); // Poll immediately

    return () => clearInterval(interval);
  }, [loading, jobId]);

  // Fetch job and suggestions
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        setProgress(0);

        // Get job details
        const jobRes = await fetch(`/api/jobs/${jobId}`);
        if (!jobRes.ok) throw new Error('Failed to load job');
        const jobData = await jobRes.json();
        setJob(jobData);
        setProgress(50); // Halfway through

        // Get suggestions
        const suggestionsRes = await fetch(`/api/jobs/${jobId}/suggestions`);
        if (!suggestionsRes.ok) throw new Error('Failed to load suggestions');
        const suggestionsData = await suggestionsRes.json();

        // Initialize suggestions with default values for required flag
        const initSuggestions = suggestionsData.suggestions.map(s => ({
          ...s,
          required: s.required !== false,
          read_only: s.read_only !== false
        }));

        setSuggestions(initSuggestions);
        setOriginalSuggestions(initSuggestions);
        setProgress(100); // Complete
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (jobId) fetchData();
  }, [jobId]);

  /**
   * Auto-generate suggested code when signer changes
   * Pattern: {signer}.{field_type}.{field_index}
   */
  const generateSuggestedCode = (signer, fieldType, fieldIndex) => {
    if (!signer) return '';
    return `${signer.toLowerCase()}.${fieldType || 'text'}.${fieldIndex || 1}`;
  };

  // Handle suggestion property changes
  const handleSuggestionChange = (id, field, value) => {
    setSuggestions(suggestions.map(s => {
      if (s.id === id) {
        const updated = { ...s, [field]: value };

        // Auto-generate suggested_code when signer changes
        if (field === 'signer' && value) {
          updated.suggested_code = generateSuggestedCode(
            value,
            s.field_type,
            s.field_index + 1
          );
        }

        return updated;
      }
      return s;
    }));
  };

  // Bulk assign signer to selected rows
  const handleBulkSignerAssign = () => {
    if (!bulkSignerValue || selectedRows.size === 0) return;

    setSuggestions(suggestions.map(s => {
      if (selectedRows.has(s.id)) {
        return {
          ...s,
          signer: bulkSignerValue,
          suggested_code: generateSuggestedCode(
            bulkSignerValue,
            s.field_type,
            s.field_index + 1
          )
        };
      }
      return s;
    }));

    setSelectedRows(new Set());
    setBulkSignerValue('');
  };

  // Toggle row selection
  const toggleRowSelection = (id) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  // Toggle row expansion to show details
  const toggleRowExpansion = (id) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // Toggle select all on current page
  const toggleSelectAll = () => {
    const filteredSuggestions = getFilteredSuggestions();
    const pageStart = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageEnd = pageStart + ITEMS_PER_PAGE;
    const pageSuggestions = filteredSuggestions.slice(pageStart, pageEnd);

    if (selectedRows.size === pageSuggestions.length) {
      // Deselect all on this page
      const newSelected = new Set(selectedRows);
      pageSuggestions.forEach(s => newSelected.delete(s.id));
      setSelectedRows(newSelected);
    } else {
      // Select all on this page
      const newSelected = new Set(selectedRows);
      pageSuggestions.forEach(s => newSelected.add(s.id));
      setSelectedRows(newSelected);
    }
  };

  // Get unique values for filter dropdowns
  const getUniqueSigner = () => {
    return [...new Set(suggestions.map(s => s.signer).filter(Boolean))].sort();
  };

  const getUniqueTypes = () => {
    return [...new Set(suggestions.map(s => s.field_type).filter(Boolean))].sort();
  };

  // Apply filters
  const getFilteredSuggestions = () => {
    return suggestions.filter(s => {
      if (typeFilter && s.field_type !== typeFilter) return false;
      if (signerFilter && s.signer !== signerFilter) return false;
      return true;
    });
  };

  // Handle approval status toggle
  const toggleApproval = (id) => {
    handleSuggestionChange(
      id,
      'approval_status',
      suggestions.find(s => s.id === id)?.approval_status === 'approved' ? 'review_needed' : 'approved'
    );
  };

  // Apply approved suggestions to PDF
  const handleApply = async () => {
    try {
      setApplying(true);
      setError('');
      setSuccess('');

      // Filter for approved suggestions
      const approveds = suggestions.filter(s => s.approval_status === 'approved');

      if (approveds.length === 0) {
        setError('No suggestions approved. Please approve at least one suggestion.');
        setApplying(false);
        return;
      }

      const res = await fetch(`/api/jobs/${jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestions: approveds })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to apply changes');
      }

      const result = await res.json();
      setSuccess(`✓ Applied ${approveds.length} suggestion(s) to PDF`);

      // Update job status
      setJob(prev => ({ ...prev, status: 'applied' }));

      // Optionally: Trigger download or redirect to results
      // Could add download button here for the result PDF

    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-full max-w-md text-center space-y-6">
          <div>
            <h2 className="text-lg font-bold text-primary-900 mb-2">Analyzing PDF...</h2>
            <p className="text-sm text-neutral-600">This may take a moment.</p>
          </div>

          {/* Loading Bar */}
          <div className="space-y-2">
            <div className="w-full bg-neutral-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-primary-500 to-primary-600 h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-sm font-semibold text-primary-900">{progress}%</div>
          </div>

          {/* Status Message */}
          <div className="text-sm text-neutral-600">
            {progress < 30 && 'Extracting form fields...'}
            {progress >= 30 && progress < 70 && 'Generating suggestions...'}
            {progress >= 70 && 'Finalizing analysis...'}
          </div>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="card p-6 bg-red-50 border border-red-200">
        <p className="text-red-700 font-semibold">Job not found</p>
        <p className="text-sm text-red-600 mt-1">{error || 'Unable to load job details'}</p>
      </div>
    );
  }

  // Handle case where no fields were detected
  if (job.status === 'error' || suggestions.length === 0) {
    return (
      <div className="space-y-6">
        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-primary-900">{job.document_title || 'Form Analysis'}</h1>
              <p className="text-sm text-neutral-600 mt-1">Form Markup Analysis</p>
            </div>
          </div>
        </div>

        <div className="card p-8 bg-yellow-50 border-2 border-yellow-200">
          <div className="flex items-start gap-4">
            <div className="text-3xl">⚠️</div>
            <div>
              <h2 className="text-lg font-bold text-yellow-900 mb-2">No Form Fields Detected</h2>
              <p className="text-yellow-800 mb-4">
                This PDF does not contain any fillable form fields to analyze. Form Markup requires a PDF with interactive form fields (text boxes, signatures, checkboxes, etc.).
              </p>
              <div className="bg-white rounded p-4 mb-4 border border-yellow-200">
                <p className="text-sm font-mono text-neutral-700">{job.message || 'No form fields detected in PDF'}</p>
              </div>
              <div className="space-y-2 text-sm text-yellow-900">
                <p><strong>✓ This works with:</strong> PDFs created with forms (Adobe, Microsoft, etc.)</p>
                <p><strong>✗ This won't work with:</strong> Scanned images, plain text PDFs, or PDFs without interactive fields</p>
              </div>
              <div className="mt-4 pt-4 border-t border-yellow-200">
                <a
                  href="/"
                  className="text-yellow-700 hover:text-yellow-900 font-semibold text-sm"
                >
                  ← Back to upload
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const approved = suggestions.filter(s => s.approval_status === 'approved').length;
  const total = suggestions.length;
  const filteredSuggestions = getFilteredSuggestions();
  const totalPages = Math.ceil(filteredSuggestions.length / ITEMS_PER_PAGE);
  const pageStart = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageEnd = pageStart + ITEMS_PER_PAGE;
  const paginatedSuggestions = filteredSuggestions.slice(pageStart, pageEnd);
  const pageOnThisPage = paginatedSuggestions.filter(s => selectedRows.has(s.id)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-primary-900">{job.document_title}</h1>
            <p className="text-sm text-neutral-600 mt-1">
              {job.company_name} • Form Markup Approval
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-primary-600">{approved}/{total}</div>
            <div className="text-xs text-neutral-600">Approved</div>
          </div>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-800 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-100 border border-green-300 rounded text-green-800 text-sm">
            {success}
          </div>
        )}

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="w-full bg-neutral-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary-600 h-full transition-all"
              style={{ width: `${total > 0 ? (approved / total) * 100 : 0}%` }}
            />
          </div>
          <div className="text-xs text-neutral-600">
            {approved} of {total} suggestions approved
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-primary-900 mb-2">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">All Types</option>
              {getUniqueTypes().map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-primary-900 mb-2">Signer</label>
            <select
              value={signerFilter}
              onChange={(e) => {
                setSignerFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">All Signers</option>
              {getUniqueSigner().map(signer => (
                <option key={signer} value={signer}>{signer}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-primary-900 mb-2">
              Results: {filteredSuggestions.length}
            </label>
            <div className="px-3 py-2 bg-neutral-100 rounded text-sm font-semibold text-primary-900">
              {filteredSuggestions.length} / {total} shown
            </div>
          </div>
        </div>
      </div>

      {/* Preview Panel */}
      {selectedPreviewId && (
        <div className="card bg-blue-50 border border-blue-300">
          <div className="flex items-center justify-between mb-4 px-6 pt-6">
            <h2 className="text-lg font-bold text-primary-900">Field Preview</h2>
            <button
              onClick={() => setSelectedPreviewId(null)}
              className="text-neutral-500 hover:text-neutral-700 text-2xl leading-none"
            >
              ✕
            </button>
          </div>

          <div className="px-6 pb-6">
            {(() => {
              const preview = suggestions.find(s => s.id === selectedPreviewId);
              if (!preview) return null;

              return (
                <div className="space-y-4">
                  {/* Context Info */}
                  <div className="grid grid-cols-4 gap-4 bg-white rounded-lg p-4 border border-blue-200 text-sm">
                    <div>
                      <label className="font-semibold text-neutral-700 block mb-1">Field Name</label>
                      <code className="text-xs bg-neutral-100 px-2 py-1 rounded block font-mono truncate" title={preview.field_name}>
                        {preview.field_name || '—'}
                      </code>
                    </div>
                    <div>
                      <label className="font-semibold text-neutral-700 block mb-1">Signer</label>
                      <span className="text-neutral-900">{preview.signer || '—'}</span>
                    </div>
                    <div>
                      <label className="font-semibold text-neutral-700 block mb-1">Type</label>
                      <span className="text-neutral-900">{preview.field_type || 'text'}</span>
                    </div>
                    <div>
                      <label className="font-semibold text-neutral-700 block mb-1">Confidence</label>
                      <span className="text-neutral-900 font-semibold text-primary-600">
                        {Math.round((preview.confidence || 0) * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* Large Preview Image */}
                  {preview.preview_image ? (
                    <div className="bg-white border border-neutral-300 rounded-lg p-4 flex justify-center">
                      <img
                        src={preview.preview_image}
                        alt="Field preview"
                        className="max-h-96 rounded border border-neutral-200"
                      />
                    </div>
                  ) : (
                    <div className="bg-white border border-neutral-300 rounded-lg p-12 text-center text-neutral-500">
                      <p className="text-sm">Preview image not available</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Bulk Actions */}
      {selectedRows.size > 0 && (
        <div className="card bg-blue-50 border border-blue-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-blue-900">
              {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected
            </p>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-blue-900 mb-2">Assign Signer</label>
              <select
                value={bulkSignerValue}
                onChange={(e) => setBulkSignerValue(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">Choose signer...</option>
                {getUniqueSigner().map(signer => (
                  <option key={signer} value={signer}>{signer}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleBulkSignerAssign}
              disabled={!bulkSignerValue}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                bulkSignerValue
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
              }`}
            >
              Apply to {selectedRows.size}
            </button>
          </div>
        </div>
      )}

      {/* Suggestions Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="text-center py-3 px-2 font-semibold text-primary-900 w-[40px]">•</th>
              <th className="text-left py-3 px-4 font-semibold text-primary-900 w-[40px]">
                <input
                  type="checkbox"
                  checked={paginatedSuggestions.length > 0 && pageOnThisPage === paginatedSuggestions.length}
                  ref={checkbox => setSelectAllCheckbox(checkbox)}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-neutral-300 text-primary-600 cursor-pointer"
                  title={paginatedSuggestions.length === 0 ? 'No items on this page' : pageOnThisPage === paginatedSuggestions.length ? 'All selected' : pageOnThisPage > 0 ? 'Some selected' : 'None selected'}
                />
              </th>
              <th className="text-left py-3 px-4 font-semibold text-primary-900">Current Field Name</th>
              <th className="text-left py-3 px-4 font-semibold text-primary-900 w-[100px]">Type</th>
              <th className="text-left py-3 px-4 font-semibold text-primary-900 w-[140px]">Suggested Code</th>
              <th className="text-left py-3 px-4 font-semibold text-primary-900 w-[110px]">Signer</th>
              <th className="text-center py-3 px-4 font-semibold text-primary-900 w-[70px]">Required</th>
              <th className="text-center py-3 px-4 font-semibold text-primary-900 w-[70px]">Read-Only</th>
              <th className="text-center py-3 px-4 font-semibold text-primary-900 w-[90px]">Confidence</th>
              <th className="text-center py-3 px-4 font-semibold text-primary-900 w-[70px]">Preview</th>
              <th className="text-center py-3 px-4 font-semibold text-primary-900 w-[80px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedSuggestions.map((suggestion) => {
              const isApproved = suggestion.approval_status === 'approved';
              const isSelected = selectedRows.has(suggestion.id);
              const isExpanded = expandedRows.has(suggestion.id);

              return (
                <>
                  <tr
                    key={suggestion.id}
                    className={`border-b border-neutral-100 hover:bg-neutral-50 transition-colors ${
                      isApproved ? 'bg-green-50' : ''
                    } ${isSelected ? 'bg-blue-100' : ''}`}
                  >
                    {/* Expand Button */}
                    <td className="py-3 px-2 text-center">
                      <button
                        onClick={() => toggleRowExpansion(suggestion.id)}
                        className="text-primary-600 hover:text-primary-900 font-bold text-lg leading-none"
                        title={isExpanded ? 'Hide details' : 'Show details & preview'}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRowSelection(suggestion.id)}
                        className="w-4 h-4 rounded border-neutral-300 text-primary-600 cursor-pointer"
                      />
                    </td>

                    {/* Current Field Name (from PDF) - Full Name */}
                    <td className="py-3 px-4 max-w-md">
                      <code className="text-xs bg-neutral-100 px-2 py-1 rounded font-mono break-all" title={suggestion.field_name}>
                        {suggestion.field_name || '—'}
                      </code>
                    </td>

                  {/* Field Type */}
                  <td className="py-3 px-4">
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium">
                      {suggestion.field_type || 'text'}
                    </span>
                  </td>

                  {/* Suggested ALIS Code (auto-generated) */}
                  <td className="py-3 px-4">
                    <input
                      type="text"
                      value={suggestion.suggested_code || ''}
                      onChange={(e) => handleSuggestionChange(suggestion.id, 'suggested_code', e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-neutral-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="Auto-generated from signer"
                    />
                  </td>

                  {/* Signer (updates trigger code regeneration) */}
                  <td className="py-3 px-4">
                    <select
                      value={suggestion.signer || ''}
                      onChange={(e) => handleSuggestionChange(suggestion.id, 'signer', e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="">Choose signer...</option>
                      {getUniqueSigner().map(signer => (
                        <option key={signer} value={signer}>{signer}</option>
                      ))}
                    </select>
                  </td>

                  {/* Required Flag */}
                  <td className="py-3 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={suggestion.required === true}
                      onChange={(e) => handleSuggestionChange(suggestion.id, 'required', e.target.checked)}
                      className="w-4 h-4 rounded border-neutral-300 text-primary-600 cursor-pointer focus:ring-primary-500"
                    />
                  </td>

                  {/* Read-Only Flag */}
                  <td className="py-3 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={suggestion.read_only === true}
                      onChange={(e) => handleSuggestionChange(suggestion.id, 'read_only', e.target.checked)}
                      className="w-4 h-4 rounded border-neutral-300 text-primary-600 cursor-pointer focus:ring-primary-500"
                    />
                  </td>

                  {/* Confidence Score */}
                  <td className="py-3 px-4 text-center">
                    <div className="text-sm font-semibold text-primary-900">
                      {Math.round((suggestion.confidence || 0) * 100)}%
                    </div>
                  </td>

                  {/* Preview Thumbnail */}
                  <td className="py-3 px-4 text-center">
                    {suggestion.preview_image ? (
                      <button
                        onClick={() => setSelectedPreviewId(suggestion.id)}
                        className="group relative"
                      >
                        <img
                          src={suggestion.preview_image}
                          alt="Preview"
                          className="w-14 h-14 object-cover rounded border-2 border-neutral-300 cursor-pointer hover:border-primary-500 transition-all hover:shadow-md"
                          title="Click to view full preview"
                        />
                        <div className="absolute inset-0 rounded flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all">
                          <span className="text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity">👁</span>
                        </div>
                      </button>
                    ) : (
                      <div className="w-14 h-14 bg-neutral-100 rounded border border-neutral-300 flex items-center justify-center text-xs text-neutral-400">
                        —
                      </div>
                    )}
                  </td>

                  {/* Approve/Reject Button */}
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => toggleApproval(suggestion.id)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        isApproved
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-neutral-200 hover:bg-neutral-300 text-neutral-700'
                      }`}
                    >
                      {isApproved ? '✓ OK' : 'Review'}
                    </button>
                  </td>
                </tr>

                {/* Detail Row (Expanded View) */}
                {isExpanded && (
                  <tr className="bg-blue-50 border-b border-neutral-100">
                    <td colSpan="9" className="py-6 px-4">
                      <div className="space-y-4">
                        {/* Field Metadata */}
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <h3 className="font-semibold text-primary-900 mb-3">Field Information</h3>
                            <div className="space-y-2 text-sm">
                              <div>
                                <label className="font-medium text-neutral-700">Full Field Name:</label>
                                <p className="text-neutral-900 font-mono bg-white px-3 py-2 rounded mt-1 break-all">
                                  {suggestion.field_name || '—'}
                                </p>
                              </div>
                              <div>
                                <label className="font-medium text-neutral-700">Page:</label>
                                <p className="text-neutral-900">{suggestion.field_page || 1}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="font-medium text-neutral-700">X:</label>
                                  <p className="text-neutral-900">{suggestion.field_x || '—'}</p>
                                </div>
                                <div>
                                  <label className="font-medium text-neutral-700">Y:</label>
                                  <p className="text-neutral-900">{suggestion.field_y || '—'}</p>
                                </div>
                                <div>
                                  <label className="font-medium text-neutral-700">Width:</label>
                                  <p className="text-neutral-900">{suggestion.field_width || '—'}</p>
                                </div>
                                <div>
                                  <label className="font-medium text-neutral-700">Height:</label>
                                  <p className="text-neutral-900">{suggestion.field_height || '—'}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* PDF Preview */}
                          <div>
                            <h3 className="font-semibold text-primary-900 mb-3">Field Preview</h3>
                            {suggestion.preview_image ? (
                              <div className="bg-white border border-neutral-300 rounded p-2">
                                <img
                                  src={suggestion.preview_image}
                                  alt="Field preview"
                                  className="w-full h-auto rounded border border-neutral-200"
                                />
                                <p className="text-xs text-neutral-600 mt-2">
                                  Cropped region showing field context
                                </p>
                              </div>
                            ) : (
                              <div className="bg-white border border-neutral-300 rounded p-4 text-center text-neutral-500 h-32 flex items-center justify-center">
                                <p className="text-xs">Preview image not available</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
              );
            })}
          </tbody>
        </table>

        {filteredSuggestions.length === 0 && (
          <div className="text-center py-8 text-neutral-600">
            <p>No suggestions found</p>
          </div>
        )}
      </div>

      {/* Grid-Based Pagination (5 columns, wraps after 25 items) */}
      {totalPages > 0 && (
        <div className="card">
          <p className="text-sm font-semibold text-primary-900 mb-4">
            Page {currentPage} of {totalPages}
          </p>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
                  page === currentPage
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="card flex gap-3">
        <button
          onClick={handleApply}
          disabled={applying || approved === 0 || job.status === 'applied'}
          className={`flex-1 px-6 py-3 rounded font-semibold transition-colors ${
            approved === 0 || job.status === 'applied'
              ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
              : 'bg-primary-600 hover:bg-primary-700 text-white'
          }`}
        >
          {applying ? '⏳ Applying...' : `✓ Apply ${approved} Suggestion${approved !== 1 ? 's' : ''}`}
        </button>

        {job.status === 'applied' && (
          <div className="flex-1 px-6 py-3 rounded bg-green-100 border border-green-300 text-green-800 flex items-center justify-center font-semibold">
            ✓ Applied Successfully
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="text-xs text-neutral-600 space-y-1">
        <p>💡 <strong>Filters</strong> by Type and Signer narrow down suggestions quickly</p>
        <p>💡 <strong>Signer Field</strong> is a dropdown for consistency; changing it auto-updates Suggested Code (e.g., resident.signature.1)</p>
        <p>💡 <strong>Bulk Assign</strong> lets you select multiple rows and assign a signer in one action—codes auto-regenerate</p>
        <p>💡 <strong>Pagination</strong> wraps after 25 items per row (page 26 appears under page 1, 27 under 2, etc.)</p>
        <p>💡 <strong>Checkbox Column</strong> enables row selection for bulk operations</p>
      </div>
    </div>
  );
}
