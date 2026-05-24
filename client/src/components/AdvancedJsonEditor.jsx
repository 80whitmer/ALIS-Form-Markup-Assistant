import React, { useState, useRef } from 'react';
import { Copy, Check, AlertCircle, ChevronDown, ChevronRight, Search, Building2, Loader } from 'lucide-react';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------
const TEMPLATES = {
  create_communities: {
    label: 'Create Communities',
    description: 'Create new ALIS communities with location and capacity data',
    schema: {
      communities: [
        {
          name: 'Community Name',
          street: '123 Main Street',
          city: 'City Name',
          state: 'ST',
          zip: '12345',
          companyUrl: 'https://example.com',
          capacity: '100'
        }
      ]
    },
    fields: [
      { name: 'name',       type: 'string', required: true,  description: 'Community display name' },
      { name: 'street',     type: 'string', required: true,  description: 'Street address' },
      { name: 'city',       type: 'string', required: true,  description: 'City name' },
      { name: 'state',      type: 'string', required: true,  description: '2-letter state code' },
      { name: 'zip',        type: 'string', required: true,  description: 'ZIP / postal code' },
      { name: 'companyUrl', type: 'string', required: true,  description: 'Company website URL' },
      { name: 'capacity',   type: 'string', required: false, description: 'Total Capacity (pulled from HubSpot total_capacity)' }
    ]
  }
};

// ---------------------------------------------------------------------------
// Schema field row
// ---------------------------------------------------------------------------
function SchemaField({ field }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-800 shrink-0">
        {field.name}
      </code>
      <span className="text-xs text-blue-600 shrink-0">{field.type}</span>
      {field.required && (
        <span className="text-xs text-red-500 shrink-0">required</span>
      )}
      <span className="text-xs text-gray-500">{field.description}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HubSpot search panel
// ---------------------------------------------------------------------------
function HubSpotSearch({ onSelect }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef(null);

  const runSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSearched(false);
    try {
      const res = await axios.get('/api/hubspot/search', { params: { q: query.trim() } });
      setResults(res.data.companies || []);
      setSearched(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
  };

  const handleSelect = (company) => {
    onSelect(company);
    setQuery('');
    setResults([]);
    setSearched(false);
  };

  return (
    <div className="mb-4 p-3 rounded-lg border border-blue-100 bg-blue-50">
      <div className="flex items-center gap-1.5 mb-2">
        <Building2 size={14} className="text-blue-600" />
        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
          Load from HubSpot
        </span>
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search company name…"
          className="flex-1 px-3 py-1.5 text-sm border border-blue-200 rounded-lg focus:outline-none bg-white"
          onFocus={(e) => (e.target.style.borderColor = '#3B82F6')}
          onBlur={(e)  => (e.target.style.borderColor = '#BFDBFE')}
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={!query.trim() || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
          style={{ backgroundColor: '#3B82F6' }}
          onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#2563EB')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#3B82F6')}
        >
          {loading
            ? <Loader size={13} className="animate-spin" />
            : <Search size={13} />
          }
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-red-600 text-xs">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {searched && results.length === 0 && !error && (
        <p className="mt-2 text-xs text-gray-500">No companies found for "{query}"</p>
      )}

      {results.length > 0 && (
        <ul className="mt-2 border border-blue-100 rounded-lg overflow-hidden bg-white divide-y divide-gray-100">
          {results.map((company) => (
            <li key={company.hubspotId}>
              <button
                type="button"
                onClick={() => handleSelect(company)}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 transition"
              >
                <p className="text-sm font-medium text-gray-800">{company.name}</p>
                {(company.street || company.city) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[company.street, company.city, company.state, company.zip]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
                {company.companyUrl && (
                  <p className="text-xs text-blue-500 mt-0.5 truncate">{company.companyUrl}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------
function AdvancedJsonEditor({ value, onChange }) {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [validationError, setValidationError]   = useState(null);
  const [validationSuccess, setValidationSuccess] = useState(false);
  const [copied, setCopied]           = useState(false);
  const [schemaVisible, setSchemaVisible] = useState(false);
  const [populatedFrom, setPopulatedFrom] = useState(null); // company name badge

  const handleTemplateSelect = (key) => {
    setSelectedTemplate(key);
    setValidationError(null);
    setValidationSuccess(false);
    setPopulatedFrom(null);
    if (key && TEMPLATES[key]) {
      onChange(JSON.stringify(TEMPLATES[key].schema, null, 2));
    }
  };

  const handleJsonChange = (text) => {
    onChange(text);
    setValidationError(null);
    setValidationSuccess(false);
    setPopulatedFrom(null);
  };

  const validateJson = () => {
    if (!value.trim()) {
      setValidationError('JSON is empty');
      setValidationSuccess(false);
      return;
    }
    try {
      JSON.parse(value);
      setValidationError(null);
      setValidationSuccess(true);
      setTimeout(() => setValidationSuccess(false), 2000);
    } catch (e) {
      setValidationError(e.message);
      setValidationSuccess(false);
    }
  };

  const copyJson = () => {
    if (!value.trim()) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearJson = () => {
    onChange('');
    setValidationError(null);
    setValidationSuccess(false);
    setSelectedTemplate('');
    setPopulatedFrom(null);
  };

  // Called when the user picks a company from HubSpot results
  const handleHubSpotSelect = (company) => {
    // Determine which template wrapper to use (default to create_communities)
    const templateKey = selectedTemplate || 'create_communities';
    if (!selectedTemplate) setSelectedTemplate(templateKey);

    const payload = {
      communities: [
        {
          name:       company.name       || '',
          street:     company.street     || '',
          city:       company.city       || '',
          state:      company.state      || '',
          zip:        company.zip        || '',
          companyUrl: company.companyUrl || '',
          capacity:   company.capacity || ''
        }
      ]
    };
    onChange(JSON.stringify(payload, null, 2));
    setValidationError(null);
    setValidationSuccess(false);
    setPopulatedFrom(company.name);
  };

  const currentTemplate = selectedTemplate ? TEMPLATES[selectedTemplate] : null;

  return (
    <div>
      {/* HubSpot search */}
      <HubSpotSearch onSelect={handleHubSpotSelect} />

      {/* Template selector */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
          Template Structure
        </label>
        <select
          value={selectedTemplate}
          onChange={(e) => handleTemplateSelect(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none bg-white"
          onFocus={(e) => (e.target.style.borderColor = '#FF9800')}
          onBlur={(e)  => (e.target.style.borderColor = '#D0D0D0')}
        >
          <option value="">— Select a template to pre-populate —</option>
          {Object.entries(TEMPLATES).map(([key, tmpl]) => (
            <option key={key} value={key}>{tmpl.label}</option>
          ))}
        </select>
        {currentTemplate && (
          <p className="text-xs text-gray-500 mt-1">{currentTemplate.description}</p>
        )}
      </div>

      {/* Populated-from badge */}
      {populatedFrom && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1.5 rounded-lg">
          <Check size={12} />
          Populated from HubSpot: <strong>{populatedFrom}</strong>
        </div>
      )}

      {/* JSON textarea */}
      <textarea
        value={value}
        onChange={(e) => handleJsonChange(e.target.value)}
        placeholder={'{\n  "communities": [\n    {\n      "name": "...",\n      ...\n    }\n  ]\n}'}
        className="w-full font-mono text-sm px-4 py-3 border rounded-lg focus:outline-none resize-y"
        rows={10}
        style={{
          borderColor: validationError ? '#EF4444' : '#D0D0D0',
          minHeight: '180px'
        }}
        onFocus={(e) => !validationError && (e.target.style.borderColor = '#FF9800')}
        onBlur={(e)  => !validationError && (e.target.style.borderColor = '#D0D0D0')}
        spellCheck={false}
      />

      {/* Validation feedback */}
      {validationError && (
        <div className="mt-1.5 flex items-start gap-1.5 text-red-600 text-xs">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{validationError}</span>
        </div>
      )}
      {validationSuccess && (
        <div className="mt-1.5 flex items-center gap-1.5 text-green-600 text-xs">
          <Check size={13} />
          <span>Valid JSON</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-2 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={validateJson}
          className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-700 transition"
        >
          Validate JSON
        </button>
        <button
          type="button"
          onClick={copyJson}
          disabled={!value.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied!' : 'Copy JSON'}
        </button>
        <button
          type="button"
          onClick={clearJson}
          disabled={!value.trim()}
          className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>

      {/* Schema reference (collapsible) */}
      {currentTemplate && (
        <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setSchemaVisible(!schemaVisible)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-xs font-medium text-gray-600 hover:bg-gray-100 transition"
          >
            <span>Schema Reference — {currentTemplate.label}</span>
            {schemaVisible ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {schemaVisible && (
            <div className="px-3 py-2 bg-white">
              <p className="text-xs text-gray-500 mb-2">
                Fields inside each{' '}
                <code className="bg-gray-100 px-1 rounded">communities[*]</code> object:
              </p>
              {currentTemplate.fields.map((field) => (
                <SchemaField key={field.name} field={field} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdvancedJsonEditor;
