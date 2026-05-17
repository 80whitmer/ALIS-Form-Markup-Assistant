import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Download, ChevronDown, ChevronRight, X } from 'lucide-react';

function ManualEditMarkup() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [selectedPage, setSelectedPage] = useState('ALL');

  // State for accordion and bulk operations
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [selectedFields, setSelectedFields] = useState(new Set());
  const [bulkProperties, setBulkProperties] = useState({
    required: null,
    read_only: null,
    border: null
  });
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  // Filter and pagination state
  const [typeFilter, setTypeFilter] = useState('');
  const [signerFilter, setSignerFilter] = useState('');
  const [bulkSignerValue, setBulkSignerValue] = useState('');
  const [showBulkSignerPanel, setShowBulkSignerPanel] = useState(false);
  const [savingBulkChanges, setSavingBulkChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving', 'saved', 'error'
  const [extractedSigners, setExtractedSigners] = useState([]); // Anchors extracted from field names
  const [customSigners, setCustomSigners] = useState([]); // User-created signers
  const [showNewSignerDialog, setShowNewSignerDialog] = useState(false);
  const [newSignerName, setNewSignerName] = useState('');
  const PAGINATION_COLUMNS = 10;

  // Progress bar and preview state
  const [progress, setProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState(''); // Show what phase we're in
  const [selectedPreviewId, setSelectedPreviewId] = useState(null);
  const [hasLocalEdits, setHasLocalEdits] = useState(false); // Track if there are unsaved local edits
  const [loadingStartTime, setLoadingStartTime] = useState(null); // Track when loading started
  const [shouldShowContent, setShouldShowContent] = useState(false); // Control min display time
  const [duplicateFieldNames, setDuplicateFieldNames] = useState(new Set()); // Track duplicate field names
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false); // Filter for duplicates only
  const [pdfStyleAnchors, setPdfStyleAnchors] = useState(new Set()); // Track PDF-style (invalid) anchors
  const [showPdfStyleOnly, setShowPdfStyleOnly] = useState(false); // Filter for PDF-style anchors only

  // Regex to validate ALIS-standard signers: lowercase letters, underscores, hyphens only
  const isValidAlisAnchor = (anchor) => {
    if (!anchor) return false;
    // Valid ALIS signers: lowercase letters, underscores, hyphens
    return /^[a-z_\-]+$/.test(anchor);
  };

  // Initialize loading start time
  useEffect(() => {
    if (loading && !loadingStartTime) {
      setLoadingStartTime(Date.now());
      setShouldShowContent(false);
    }
  }, [loading, loadingStartTime]);

  // Poll progress while loading
  useEffect(() => {
    if (!loading || !jobId) return;

    const pollProgress = async () => {
      try {
        const progressRes = await fetch(`/api/jobs/${jobId}/progress`);
        if (progressRes.ok) {
          const progressData = await progressRes.json();
          setProgress(progressData.percentage || 0);
          setProgressPhase(progressData.phase || 'Processing...');
        }
      } catch (err) {
        console.debug('[progress] Poll error:', err.message);
      }
    };

    const interval = setInterval(pollProgress, 200);
    pollProgress();

    return () => clearInterval(interval);
  }, [loading, jobId]);

  useEffect(() => {
    fetchJobDetails();
    const interval = setInterval(() => {
      // Only auto-fetch if no local edits and job is still processing
      if (!hasLocalEdits && (!job || (job.status !== 'reviewed' && job.status !== 'applied'))) {
        fetchJobDetails();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId, job?.status, hasLocalEdits]);

  const fetchJobDetails = async () => {
    try {
      const response = await axios.get(`/api/jobs/${jobId}`);
      setJob(response.data.job);
      const sugg = response.data.suggestions || [];

      // Auto-populate signer field based on field name anchor
      // Extract and validate signers from field names (separates valid from PDF-style)
      const jobSigners = response.data.job?.signers ? JSON.parse(response.data.job.signers) : [];
      const extractedValidSigners = extractSignersFromFieldNames(sugg); // This also sets pdfStyleAnchors
      const allAvailableSigners = new Set([...jobSigners, ...extractedValidSigners]);

      const suggestionsWithAutoSigner = sugg.map(s => {
        // If signer is already set, don't override it
        if (s.signer) {
          return s;
        }

        // Extract anchor from field name (first part before dot or bracket)
        const anchor = (s.field_name || '').match(/^([^.\[]+)/)?.[1];

        if (!anchor) {
          return s;
        }

        // Try to find a matching signer (case-insensitive)
        const matchingSigner = Array.from(allAvailableSigners).find(
          signer => signer.toLowerCase() === anchor.toLowerCase()
        );

        if (matchingSigner) {
          return { ...s, signer: matchingSigner.toLowerCase() };
        }

        // No match found, leave signer as is (empty/null)
        return s;
      });

      setSuggestions(suggestionsWithAutoSigner);

      // Extract signers/anchors from field names
      const extracted = extractSignersFromFieldNames(suggestionsWithAutoSigner);
      setExtractedSigners(extracted);

      // Detect duplicate field names
      const fieldNameCounts = {};
      suggestionsWithAutoSigner.forEach(s => {
        fieldNameCounts[s.field_name] = (fieldNameCounts[s.field_name] || 0) + 1;
      });
      const duplicates = new Set(
        Object.entries(fieldNameCounts)
          .filter(([_, count]) => count > 1)
          .map(([name, _]) => name)
      );
      setDuplicateFieldNames(duplicates);

      // Smoothly complete the progress bar (start at 92% and animate to 100%)
      setProgress(92);
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          const next = prev + Math.random() * 6; // Random increment up to 6%
          return next >= 99 ? 100 : next;
        });
      }, 150);

      // Only transition when data is actually ready
      // Enforce minimum display time while loading to show animation
      const elapsedTime = loadingStartTime ? Date.now() - loadingStartTime : 0;
      const minDisplayTime = 2000; // 2 second minimum to show loading animation
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

      const completeTransition = () => {
        clearInterval(progressInterval);
        setProgress(100);
        setLoading(false);
        setShouldShowContent(true);
      };

      if (remainingTime > 0) {
        setTimeout(completeTransition, remainingTime);
      } else {
        completeTransition();
      }
    } catch (err) {
      console.error('[fetchJobDetails] Error:', err.message);
      setError(err.message);
      setProgress(100);
      setLoading(false);
      setShouldShowContent(true); // Show content even on error
    }
  };

  // Extract anchors from field names, separating valid ALIS anchors from PDF-style ones
  const extractSignersFromFieldNames = (suggestions) => {
    const validSigners = new Set();
    const pdfStyleSigners = new Set();

    suggestions.forEach(s => {
      const fieldName = s.field_name || '';
      // Extract the anchor (part before first dot or bracket)
      const match = fieldName.match(/^([^.\[]+)/);
      if (match && match[1]) {
        const anchor = match[1];
        // Check if anchor conforms to ALIS standards
        if (isValidAlisAnchor(anchor)) {
          validSigners.add(anchor.toLowerCase());
        } else {
          pdfStyleSigners.add(anchor);
        }
      }
    });

    // Update state with PDF-style anchors for highlighting
    setPdfStyleAnchors(pdfStyleSigners);

    return Array.from(validSigners).sort();
  };

  // Create new signer
  const handleAddNewSigner = () => {
    if (newSignerName.trim() && !customSigners.includes(newSignerName)) {
      setCustomSigners([...customSigners, newSignerName]);
      setBulkSignerValue(newSignerName);
      setNewSignerName('');
      setShowNewSignerDialog(false);
    }
  };

  const toggleRowExpanded = (fieldName) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(fieldName)) {
      newExpanded.delete(fieldName);
    } else {
      newExpanded.add(fieldName);
    }
    setExpandedRows(newExpanded);
  };

  const expandAllPreviews = () => {
    // Expand all rows that have preview images
    const allPreviewRows = new Set(
      filteredSuggestions
        .filter(s => s.preview_image)
        .map(s => s.field_name)
    );
    setExpandedRows(allPreviewRows);
  };

  const collapseAllPreviews = () => {
    setExpandedRows(new Set());
  };

  const handleSelectField = (fieldName) => {
    const newSelected = new Set(selectedFields);
    if (newSelected.has(fieldName)) {
      newSelected.delete(fieldName);
    } else {
      newSelected.add(fieldName);
    }
    setSelectedFields(newSelected);
  };

  const handleSelectPage = () => {
    if (selectedFields.size === filteredSuggestions.length) {
      setSelectedFields(new Set());
    } else {
      setSelectedFields(new Set(filteredSuggestions.map(s => s.field_name)));
    }
  };

  const handleBulkPropertyChange = (field, value) => {
    setBulkProperties({
      ...bulkProperties,
      [field]: bulkProperties[field] === value ? null : value
    });
  };

  const applyBulkProperties = async () => {
    const updated = suggestions.map(s => {
      if (selectedFields.has(s.field_name)) {
        return {
          ...s,
          required: bulkProperties.required !== null ? bulkProperties.required : s.required,
          read_only: bulkProperties.read_only !== null ? bulkProperties.read_only : s.read_only,
          border: bulkProperties.border !== null ? bulkProperties.border : s.border
        };
      }
      return s;
    });

    // Update local state immediately for UI feedback
    setSuggestions(updated);
    setShowBulkPanel(false);
    setSavingBulkChanges(true);
    setSaveStatus('saving');

    try {
      if (!jobId) {
        throw new Error('Job ID is missing or invalid');
      }

      const url = `/api/jobs/${jobId}/suggestions`;
      console.log(`[applyBulkProperties] Sending PATCH to ${url}`, {
        jobId,
        updateCount: updated.length,
        firstItem: updated[0]
      });

      const response = await axios.patch(url, {
        suggestions: updated
      });

      console.log('[applyBulkProperties] Response:', response.data);

      // Refresh from backend to confirm save
      if (response.data.suggestions) {
        setSuggestions(response.data.suggestions);
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000); // Clear after 2 seconds
      setHasLocalEdits(false); // Clear local edits flag after successful save
    } catch (err) {
      console.error('[applyBulkProperties] Error:', err);
      console.error('[applyBulkProperties] Response data:', err.response?.data);
      console.error('[applyBulkProperties] Status code:', err.response?.status);
      setSaveStatus('error');
      alert('✗ Error saving changes: ' + (err.response?.data?.error || err.message));
      // Revert to previous state on error
      fetchJobDetails();
    } finally {
      setSavingBulkChanges(false);
      setBulkProperties({ required: null, read_only: null, border: null });
      setSelectedFields(new Set());
    }
  };

  const getNextInstanceNumber = (typeStr, newAnchor, allSuggestions) => {
    // Find all field names matching {newAnchor}.{typeStr}.*
    // Extract the highest instance number and return next number
    const escapedType = typeStr.replace(/\./g, '\\.');
    const pattern = new RegExp(`^${newAnchor}\\.${escapedType}\\.(\\d+)$`, 'i');

    const existingNumbers = allSuggestions
      .map(s => {
        const match = s.field_name?.match(pattern);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter(n => n !== null);

    return existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  };

  const deriveTypeFromPdfFieldName = (pdfFieldName) => {
    // Extract a simple type from PDF field names
    // CheckBox → check, TextField → text, RadioButton → radio, etc.
    const match = pdfFieldName.match(/^([a-zA-Z]+)(\d+)$/);
    if (!match) return null;

    const rawType = match[1].toLowerCase();

    // Map common PDF field type prefixes to ALIS types
    if (rawType.includes('check')) return 'check';
    if (rawType.includes('radio')) return 'radio';
    if (rawType.includes('text')) return 'text';
    if (rawType.includes('signature')) return 'signature';
    if (rawType.includes('button')) return 'button';
    if (rawType.includes('image')) return 'image';

    // Default: use first few characters as type
    return rawType.substring(0, 4);
  };

  const updateFieldNameWithNextInstance = (fieldName, newAnchor, allSuggestions) => {
    // For standard ALIS format: anchor.type1.type2...typeN.instance
    // Extract type and find next available instance number
    const parts = fieldName.split('.');

    // Check if it's in standard format with instance number at the end
    if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1])) {
      // Standard format: extract type (everything between anchor and instance)
      const typeStr = parts.slice(1, -1).join('.'); // e.g., "text" or "image.border"
      const nextNumber = getNextInstanceNumber(typeStr, newAnchor, allSuggestions);
      const result = `${newAnchor}.${typeStr}.${nextNumber}`;
      console.log(`[updateFieldNameWithNextInstance] ${fieldName} → ${result} (type=${typeStr}, nextNum=${nextNumber})`);
      return result;
    }

    // Try to derive type from pure PDF field names first (e.g., CheckBox14 → check)
    const derivedType = deriveTypeFromPdfFieldName(fieldName);
    if (derivedType) {
      const nextNumber = getNextInstanceNumber(derivedType, newAnchor, allSuggestions);
      const result = `${newAnchor}.${derivedType}.${nextNumber}`;
      console.log(`[updateFieldNameWithNextInstance] ${fieldName} → ${result} (PDF derived type=${derivedType}, nextNum=${nextNumber})`);
      return result;
    }

    // If field_name is just an anchor (like "resident" or "staff"), it needs a type
    // This shouldn't happen - it indicates a previous transformation issue
    if (parts.length === 1) {
      console.log(`[updateFieldNameWithNextInstance] Field name has no type: ${fieldName} - needs manual type specification`);
      // Return as-is to avoid creating resident.resident.X patterns
      return fieldName;
    }

    // Fallback: just use the field name as the type
    const nextNumber = getNextInstanceNumber(fieldName.toLowerCase(), newAnchor, allSuggestions);
    const result = `${newAnchor}.${fieldName.toLowerCase()}.${nextNumber}`;
    console.log(`[updateFieldNameWithNextInstance] ${fieldName} → ${result} (fallback, using fieldname as type, nextNum=${nextNumber})`);
    return result;
  };

  const applyBulkSigner = async () => {
    if (!bulkSignerValue) {
      setShowBulkSignerPanel(false);
      return;
    }

    // Build updated array with signer and field name updates
    // Use reduce initialized with all original suggestions, so getNextInstanceNumber can find existing numbers
    // This ensures each field in a bulk update gets a unique instance number
    const updated = suggestions.reduce((accumulator, s, index) => {
      if (selectedFields.has(s.field_name)) {
        // Check if new signer is an extracted anchor (case-insensitive comparison)
        const isExtractedAnchor = extractedSigners.some(signer =>
          signer.toLowerCase() === bulkSignerValue.toLowerCase()
        );

        let newFieldName = s.field_name;
        if (isExtractedAnchor) {
          // Update field name with new anchor, type, and next available instance number
          // Pass the accumulator (original suggestions + updated fields so far)
          // so getNextInstanceNumber finds the highest number across all updates
          newFieldName = updateFieldNameWithNextInstance(s.field_name, bulkSignerValue, accumulator);
          console.log(`[applyBulkSigner] Field ${s.field_name} → ${newFieldName} (isExtractedAnchor=${isExtractedAnchor})`);
        } else {
          console.log(`[applyBulkSigner] Field ${s.field_name} - NOT extracted anchor, skipping field_name update`);
        }

        // Update the field at this index in the accumulator
        accumulator[index] = {
          ...s,
          signer: bulkSignerValue,
          field_name: newFieldName
        };
      }
      return accumulator;
    }, [...suggestions]); // Initialize with copy of all original suggestions

    // Update local state immediately for UI feedback
    setSuggestions(updated);
    setShowBulkSignerPanel(false);
    setSavingBulkChanges(true);
    setSaveStatus('saving');

    try {
      if (!jobId) {
        throw new Error('Job ID is missing or invalid');
      }

      const url = `/api/jobs/${jobId}/suggestions`;
      console.log(`[applyBulkSigners] Sending PATCH to ${url}`, {
        jobId,
        updateCount: updated.length,
        signer: bulkSignerValue,
        firstItem: updated[0]
      });

      const response = await axios.patch(url, {
        suggestions: updated
      });

      console.log('[applyBulkSigners] Response:', response.data);

      // Refresh from backend to confirm save
      if (response.data.suggestions && Array.isArray(response.data.suggestions)) {
        console.log('[applyBulkSigners] Updating suggestions from response:', response.data.suggestions.length);
        setSuggestions(response.data.suggestions);
      } else {
        // If response doesn't have suggestions, refetch from backend to ensure fresh state
        console.log('[applyBulkSigners] Response format unexpected, refetching job details');
        await fetchJobDetails();
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000); // Clear after 2 seconds
      setHasLocalEdits(false); // Clear local edits flag after successful save
    } catch (err) {
      console.error('[applyBulkSigners] Error:', err);
      console.error('[applyBulkSigners] Response data:', err.response?.data);
      console.error('[applyBulkSigners] Status code:', err.response?.status);
      setSaveStatus('error');
      alert('✗ Error saving changes: ' + (err.response?.data?.error || err.message));
      // Revert to previous state on error
      fetchJobDetails();
    } finally {
      setSavingBulkChanges(false);
      setBulkSignerValue('');
      setSelectedFields(new Set());
      // Reset filters to show all fields after bulk operation
      setSignerFilter('');
      setShowDuplicatesOnly(false);
      setShowPdfStyleOnly(false);
    }
  };

  const updateSuggestion = (suggestion, field, value) => {
    const updated = suggestions.map(s => {
      if (s === suggestion) {
        const updated = { ...s, [field]: value };

        // If signer is being changed, also update field name to reflect new anchor
        if (field === 'signer' && value) {
          const isExtractedAnchor = extractedSigners.some(signer =>
            signer.toLowerCase() === value.toLowerCase()
          );

          if (isExtractedAnchor) {
            // Update field name with new anchor, type, and next available instance number
            updated.field_name = updateFieldNameWithNextInstance(s.field_name, value, suggestions);
          }
        }

        return updated;
      }
      return s;
    });
    setSuggestions(updated);
    setHasLocalEdits(true); // Mark that there are unsaved edits
  };

  // Helper to get field anchor for checks
  const getFieldAnchor = (fieldName) => (fieldName || '').match(/^([^.\[]+)/)?.[1] || '';

  // Filter and pagination
  const filteredSuggestions = suggestions.filter(s => {
    if (selectedPage !== 'ALL' && s.field_page !== parseInt(selectedPage)) return false;
    if (typeFilter && s.field_type !== typeFilter) return false;

    // For signer filter: extract anchor from field name and compare (case-insensitive)
    if (signerFilter) {
      const fieldNameAnchor = getFieldAnchor(s.field_name);
      if (fieldNameAnchor.toLowerCase() !== signerFilter.toLowerCase()) return false;
    }

    // Filter for duplicate field names only
    if (showDuplicatesOnly && !duplicateFieldNames.has(s.field_name)) {
      return false;
    }

    // Filter for PDF-style anchors only
    if (showPdfStyleOnly) {
      const anchor = getFieldAnchor(s.field_name);
      if (!pdfStyleAnchors.has(anchor)) {
        return false;
      }
    }

    return true;
  });

  const uniquePages = [...new Set(suggestions.map(s => s.field_page || 1))].sort((a, b) => a - b);
  const uniqueTypes = [...new Set(suggestions.map(s => s.field_type))];
  const uniqueSigners = [...new Set(suggestions.map(s => s.signer).filter(Boolean))];

  const getAvailableSigners = () => {
    // Combine: valid extracted anchors + custom signers + base signers from job
    // Explicitly EXCLUDE PDF-style anchors from this list
    const signers = new Set();

    // Add only VALID extracted signers (PDF-style ones are intentionally excluded)
    extractedSigners.forEach(s => signers.add(s));

    // Add custom signers
    customSigners.forEach(s => signers.add(s));

    // Add base signers from job config
    if (job?.signers) {
      JSON.parse(job.signers).forEach(s => signers.add(s));
    } else {
      ['Resident', 'Staff', 'Family', 'Physician'].forEach(s => signers.add(s));
    }

    return Array.from(signers).sort();
  };

  const handleApplyChanges = async () => {
    if (applying) return;
    setApplying(true);

    try {
      const response = await axios.post(`/api/jobs/${jobId}/apply`, {
        suggestions: suggestions.map(s => ({
          ...s,
          approval_status: 'approved'
        }))
      });

      if (response.data.pdf) {
        const link = document.createElement('a');
        link.href = response.data.pdf;
        link.download = `${job.document_title || 'form'}-applied.pdf`;
        link.click();
      }

      navigate('/history');
    } catch (err) {
      alert('Error applying changes: ' + err.message);
    } finally {
      setApplying(false);
    }
  };

  if (loading || !shouldShowContent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Processing PDF Form</h2>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2 text-right">{progress}% complete</p>
            </div>

            {/* Phase Indicator */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-gray-600 mb-2">Current phase:</p>
              <p className="text-base font-semibold text-blue-700 flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                {progressPhase || 'Initializing...'}
              </p>
            </div>

            {/* Phase Steps */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold ${progress >= 15 ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                  {progress >= 15 ? '✓' : '1'}
                </span>
                <span className={progress >= 15 ? 'text-gray-700 line-through' : 'text-gray-600'}>Detecting fields</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold ${progress >= 35 ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                  {progress >= 35 ? '✓' : '2'}
                </span>
                <span className={progress >= 35 ? 'text-gray-700 line-through' : 'text-gray-600'}>Generating suggestions</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold ${progress >= 65 ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                  {progress >= 65 ? '✓' : '3'}
                </span>
                <span className={progress >= 65 ? 'text-gray-700 line-through' : 'text-gray-600'}>Generating previews</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold ${progress >= 85 ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                  {progress >= 85 ? '✓' : '4'}
                </span>
                <span className={progress >= 85 ? 'text-gray-700 line-through' : 'text-gray-600'}>Storing data</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      {/* Persistent Progress Bar - Shows while job is processing */}
      {job && job.status === 'analyzing' && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b-2 border-blue-500 shadow-md">
          <div className="max-w-7xl mx-auto px-8 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                <span className="text-sm font-medium text-blue-700">{progressPhase || 'Processing...'}</span>
              </div>
              <span className="text-xs text-gray-600">{progress}% complete</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Add top padding when progress bar is visible */}
      <div className={job?.status === 'analyzing' ? 'pt-20' : ''}>
        <div className="max-w-full mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Manual Edit Mode</h1>
            <p className="text-gray-600">Edit current field values and properties for {job?.document_title}</p>
          </div>

        {/* Preview Panel */}
        {selectedPreviewId && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-l-4 border-blue-500">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                {suggestions.find(s => s.field_name === selectedPreviewId)?.field_name}
              </h3>
              <button
                onClick={() => setSelectedPreviewId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div>
                <p className="text-gray-600">Type</p>
                <p className="font-medium">{suggestions.find(s => s.field_name === selectedPreviewId)?.field_type}</p>
              </div>
              <div>
                <p className="text-gray-600">Signer</p>
                <p className="font-medium">{suggestions.find(s => s.field_name === selectedPreviewId)?.signer || 'Unassigned'}</p>
              </div>
              <div>
                <p className="text-gray-600">Page</p>
                <p className="font-medium">{suggestions.find(s => s.field_name === selectedPreviewId)?.field_page || 1}</p>
              </div>
              <div>
                <p className="text-gray-600">Required</p>
                <p className="font-medium">{suggestions.find(s => s.field_name === selectedPreviewId)?.required ? 'Yes' : 'No'}</p>
              </div>
            </div>
            {suggestions.find(s => s.field_name === selectedPreviewId)?.preview_image && (
              <img
                src={suggestions.find(s => s.field_name === selectedPreviewId)?.preview_image}
                alt="Field preview"
                className="max-h-96 w-auto rounded border border-gray-200"
              />
            )}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Page</label>
              <select
                value={selectedPage}
                onChange={(e) => setSelectedPage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Pages</option>
                {uniquePages.map(p => (
                  <option key={p} value={p}>Page {p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                {uniqueTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Signer</label>
              <select
                value={signerFilter}
                onChange={(e) => setSignerFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Signers</option>
                {getAvailableSigners().map(s => {
                  const isExtracted = extractedSigners.includes(s);
                  const isCustom = customSigners.includes(s);
                  const label = s + (isExtracted ? ' (from PDF)' : isCustom ? ' (custom)' : '');
                  return (
                    <option key={s} value={s.toLowerCase()}>{label}</option>
                  );
                })}
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-sm text-gray-600">{filteredSuggestions.length} fields shown</p>
            </div>
          </div>
        </div>

        {/* Bulk Operations Panel */}
        {selectedFields.size > 0 && (
          <div className="bg-blue-50 rounded-lg shadow-md p-6 mb-6 border-l-4 border-blue-500">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                Bulk Edit ({selectedFields.size} selected)
              </h3>
              {saveStatus && (
                <div className={`text-sm font-medium px-3 py-1 rounded ${
                  saveStatus === 'saving' ? 'bg-blue-100 text-blue-700' :
                  saveStatus === 'saved' ? 'bg-green-100 text-green-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {saveStatus === 'saving' && '💾 Saving...'}
                  {saveStatus === 'saved' && '✓ Saved'}
                  {saveStatus === 'error' && '✗ Error'}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <button
                onClick={() => setShowBulkSignerPanel(!showBulkSignerPanel)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium"
              >
                Set Signer
              </button>
              <button
                onClick={() => setShowBulkPanel(!showBulkPanel)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium"
              >
                Set Properties
              </button>
              <button
                onClick={() => {
                  setSelectedFields(new Set());
                  setBulkSignerValue('');
                  setBulkProperties({ required: null, read_only: null, border: null });
                }}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium"
              >
                Clear Selection
              </button>
            </div>

            {showBulkSignerPanel && (
              <div className="bg-white rounded border border-gray-300 p-4 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Assign to Signer/Anchor</label>
                <div className="flex gap-2 mb-3">
                  <select
                    value={bulkSignerValue}
                    onChange={(e) => setBulkSignerValue(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Select a signer...</option>
                    {getAvailableSigners().map(s => {
                      const isExtracted = extractedSigners.includes(s);
                      const isCustom = customSigners.includes(s);
                      const label = s + (isExtracted ? ' (from PDF)' : isCustom ? ' (custom)' : '');
                      return (
                        <option key={s} value={s.toLowerCase()}>{label}</option>
                      );
                    })}
                  </select>
                  <button
                    onClick={() => setShowNewSignerDialog(true)}
                    className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 font-medium"
                    title="Create a new signer/anchor"
                  >
                    + New
                  </button>
                </div>
                <button
                  onClick={applyBulkSigner}
                  disabled={!bulkSignerValue}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Apply
                </button>

                {/* New Signer Dialog */}
                {showNewSignerDialog && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-sm w-full">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Signer/Anchor</h3>
                      <input
                        type="text"
                        value={newSignerName}
                        onChange={(e) => setNewSignerName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddNewSigner()}
                        placeholder="e.g., supervisor, facility_admin"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setShowNewSignerDialog(false);
                            setNewSignerName('');
                          }}
                          className="px-4 py-2 bg-gray-300 text-gray-900 rounded hover:bg-gray-400 text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddNewSigner}
                          disabled={!newSignerName.trim()}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 text-sm"
                        >
                          Create
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {showBulkPanel && (
              <div className="bg-white rounded border border-gray-300 p-4 mb-4">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { key: 'required', label: 'Required' },
                    { key: 'read_only', label: 'Read Only' },
                    { key: 'border', label: 'Border' }
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => handleBulkPropertyChange(key, true)}
                      className={`px-3 py-2 rounded text-sm font-medium transition ${
                        bulkProperties[key] === true
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={applyBulkProperties}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Apply Properties
                </button>
              </div>
            )}
          </div>
        )}

        {/* Duplicate Field Names Warning */}
        {duplicateFieldNames.size > 0 && (
          <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 text-yellow-600 font-bold text-lg">⚠️</div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-yellow-800 mb-2">
                  {duplicateFieldNames.size} Duplicate Field Name{duplicateFieldNames.size > 1 ? 's' : ''} Detected
                </h3>
                <p className="text-xs text-yellow-700 mb-3">
                  The following field names appear multiple times. This may be intentional (repeated names, dates, etc.), but please verify this is what you intend:
                </p>
                <div className="text-xs text-yellow-700 mb-3">
                  <strong>Duplicates:</strong> {Array.from(duplicateFieldNames).sort().join(', ')}
                </div>
                <button
                  onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    showDuplicatesOnly
                      ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                      : 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                  }`}
                >
                  {showDuplicatesOnly ? '✓ Showing Duplicates Only' : 'Show Duplicates Only'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PDF-Style Anchors Warning */}
        {pdfStyleAnchors.size > 0 && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 rounded">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 text-red-600 font-bold text-lg">⚠️</div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800 mb-2">
                  {pdfStyleAnchors.size} Non-Standard Anchor{pdfStyleAnchors.size > 1 ? 's' : ''} Detected
                </h3>
                <p className="text-xs text-red-700 mb-3">
                  The following field name anchors do not conform to ALIS standards (should be simple nouns like: resident, staff, admin). These PDF-style field names are highlighted below and will NOT be added as signer options. To use them, manually create new signers:
                </p>
                <div className="text-xs text-red-700 mb-3">
                  <strong>Non-standard anchors:</strong> {Array.from(pdfStyleAnchors).sort().join(', ')}
                </div>
                <button
                  onClick={() => setShowPdfStyleOnly(!showPdfStyleOnly)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    showPdfStyleOnly
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-red-200 text-red-800 hover:bg-red-300'
                  }`}
                >
                  {showPdfStyleOnly ? '✓ Showing Non-Standard Only' : 'Show Non-Standard Only'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Preview Controls */}
        <div className="mb-4 flex justify-end gap-2">
          <button
            onClick={expandAllPreviews}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
            title="Expand all preview drawers"
          >
            Expand All Previews
          </button>
          <button
            onClick={collapseAllPreviews}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm font-medium"
            title="Collapse all preview drawers"
          >
            Collapse All
          </button>
        </div>

        {/* Fields Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse whitespace-nowrap">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 w-10">
                  <input
                    type="checkbox"
                    checked={selectedFields.size === filteredSuggestions.length && filteredSuggestions.length > 0}
                    onChange={handleSelectPage}
                    className="w-4 h-4"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Field Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Signer</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Req</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">RO</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Border</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Preview</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Page</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredSuggestions.map((s, idx) => {
                const anchor = getFieldAnchor(s.field_name);
                const isPdfStyle = pdfStyleAnchors.has(anchor);
                const isDuplicate = duplicateFieldNames.has(s.field_name);
                const rowBgClass = isPdfStyle ? 'bg-red-50' : isDuplicate ? 'bg-yellow-50' : '';

                return (
                <React.Fragment key={idx}>
                  <tr className={`border-b border-gray-200 hover:bg-gray-50 ${rowBgClass}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedFields.has(s.field_name)}
                        onChange={() => handleSelectField(s.field_name)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={s.field_name}
                          onChange={(e) => updateSuggestion(s, 'field_name', e.target.value)}
                          className={`px-2 py-1 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[380px] ${
                            isPdfStyle ? 'border-red-300 bg-red-50' :
                            isDuplicate ? 'border-yellow-300 bg-yellow-50' :
                            'border-gray-300'
                          }`}
                        />
                        {isPdfStyle && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-200 text-red-800 whitespace-nowrap">
                            ⚠️ Non-standard
                          </span>
                        )}
                        {isDuplicate && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-200 text-yellow-800 whitespace-nowrap">
                            ⚠️ Duplicate
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.field_type}</td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={s.signer || ''}
                        onChange={(e) => updateSuggestion(s, 'signer', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                      >
                        <option value="">—</option>
                        {getAvailableSigners().map(signer => (
                          <option key={signer} value={signer.toLowerCase()}>{signer}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={s.required || false}
                        onChange={(e) => updateSuggestion(s, 'required', e.target.checked)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={s.read_only || false}
                        onChange={(e) => updateSuggestion(s, 'read_only', e.target.checked)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={s.border || false}
                        onChange={(e) => updateSuggestion(s, 'border', e.target.checked)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.preview_image && (
                        <button
                          onClick={() => setSelectedPreviewId(s.field_name)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          👁️
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.field_page || 1}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleRowExpanded(s.field_name)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {expandedRows.has(s.field_name) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                    </td>
                  </tr>
                  {expandedRows.has(s.field_name) && (
                    <tr className="bg-blue-50 border-b border-gray-200">
                      <td colSpan="10" className="px-4 py-4">
                        <div className="space-y-4">
                          {/* Field Details */}
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600 font-semibold">Field Index</p>
                              <p className="font-medium text-gray-900">{s.field_index}</p>
                            </div>
                            <div>
                              <p className="text-gray-600 font-semibold">Confidence</p>
                              <p className="font-medium text-gray-900">{(s.confidence * 100).toFixed(0)}%</p>
                            </div>
                          </div>

                          {/* Preview Image */}
                          {s.preview_image && (
                            <div className="pt-4 border-t border-blue-300">
                              <span className="text-xs font-semibold text-gray-700 block mb-3">Field Preview:</span>
                              <div className="bg-white border border-gray-300 rounded p-4 flex justify-center max-w-md">
                                <img
                                  src={s.preview_image}
                                  alt="Field preview"
                                  className="max-h-64 rounded border border-gray-200"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-4 justify-end">
          <button
            onClick={() => navigate('/history')}
            className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleApplyChanges}
            disabled={applying}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            <Download size={18} />
            {applying ? 'Applying...' : 'Apply & Download'}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}

export default ManualEditMarkup;
