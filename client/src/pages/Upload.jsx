import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload as UploadIcon, Plus, X } from 'lucide-react';
import axios from 'axios';

function Upload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [ocrRadius, setOcrRadius] = useState(100);
  const [signers, setSigners] = useState([
    { id: 1, name: 'Resident' },
    { id: 2, name: 'Staff' }
  ]);
  const [newSignerName, setNewSignerName] = useState('');
  const [alisAggressiveness, setAlisAggressiveness] = useState('low');
  const [workflowType, setWorkflowType] = useState('auto_edit');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Please select a valid PDF file');
      setFile(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
      setError(null);
    } else {
      setError('Please drop a valid PDF file');
    }
  };

  const addSigner = () => {
    if (newSignerName.trim()) {
      const newId = Math.max(...signers.map(s => s.id), 0) + 1;
      setSigners([...signers, { id: newId, name: newSignerName }]);
      setNewSignerName('');
    }
  };

  const removeSigner = (id) => {
    setSigners(signers.filter(s => s.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file || !companyName || !documentTitle) {
      setError('All fields are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create FormData with actual file (not base64)
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('company_name', companyName);
      formData.append('document_title', documentTitle);
      formData.append('ocr_radius', ocrRadius.toString());
      formData.append('alis_aggressiveness', alisAggressiveness);
      signers.forEach(s => formData.append('signers', s.name));
      formData.append('workflow_type', workflowType);

      const response = await axios.post('/api/jobs', formData);
      const { jobId } = response.data;
      navigate(`/jobs/${jobId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit PDF');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-2">Upload PDF Form</h1>
        <p className="text-gray-600 mb-8">
          Submit a PDF form to detect fields, extract labels, and configure ALIS properties.
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* File Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="mb-6 border-2 border-dashed rounded-lg p-8 text-center transition"
            style={{
              borderColor: '#FF9800'
            }}
            onDragEnter={(e) => e.currentTarget.style.borderColor = '#FF5722'}
            onDragLeave={(e) => e.currentTarget.style.borderColor = '#FF9800'}
          >
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              id="pdf-input"
              className="hidden"
              disabled={loading}
            />
            <label htmlFor="pdf-input" className="cursor-pointer">
              <UploadIcon className="w-12 h-12 mx-auto text-gray-400 mb-2" />
              <p className="text-gray-700 font-medium">
                {file ? file.name : 'Drag and drop PDF here or click to select'}
              </p>
              <p className="text-gray-500 text-sm mt-1">
                PDF must be an AcroForm document
              </p>
            </label>
          </div>

          {/* Form Fields */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., Steadman Hill"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                style={{
                  '--tw-ring-color': '#FF9800'
                }}
                onFocus={(e) => e.target.style.borderColor = '#FF9800'}
                onBlur={(e) => e.target.style.borderColor = '#D0D0D0'}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Title *
              </label>
              <input
                type="text"
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                placeholder="e.g., Move-In Assessment Form"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                style={{
                  '--tw-ring-color': '#FF9800'
                }}
                onFocus={(e) => e.target.style.borderColor = '#FF9800'}
                onBlur={(e) => e.target.style.borderColor = '#D0D0D0'}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Workflow Type
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'auto_edit', label: 'Auto Edit (OCR suggestions)', desc: 'Analyze with OCR to predict field names and signers' },
                  { value: 'manual_edit', label: 'Manual Edit (current values)', desc: 'Edit current field values without OCR predictions' }
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setWorkflowType(option.value)}
                    disabled={loading}
                    className="flex-1 px-4 py-3 rounded-lg font-medium transition disabled:cursor-not-allowed text-sm"
                    style={{
                      backgroundColor: workflowType === option.value ? '#FF9800' : '#E8E8E8',
                      color: workflowType === option.value ? 'white' : '#666',
                      opacity: loading ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => !loading && workflowType !== option.value && (e.target.style.backgroundColor = '#F0F0F0')}
                    onMouseLeave={(e) => !loading && (e.target.style.backgroundColor = workflowType === option.value ? '#FF9800' : '#E8E8E8')}
                  >
                    <div className="text-left">
                      <p className="font-semibold">{option.label}</p>
                      <p className="text-xs opacity-80">{option.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* OCR Search Radius - Only for Auto Edit */}
            {workflowType === 'auto_edit' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  OCR Search Radius (pixels)
                </label>
                <input
                  type="number"
                  value={ocrRadius}
                  onChange={(e) => setOcrRadius(parseInt(e.target.value))}
                  min="50"
                  max="200"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                  style={{
                    '--tw-ring-color': '#FF9800'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#FF9800'}
                  onBlur={(e) => e.target.style.borderColor = '#D0D0D0'}
                  disabled={loading}
                />
                <p className="text-gray-500 text-xs mt-1">
                  How far to search for text near each field (default: 100px)
                </p>
              </div>
            )}

            {/* ALIS Field Suggestions - Only for Auto Edit */}
            {workflowType === 'auto_edit' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  ALIS Field Suggestions
                </label>
                <div className="flex gap-2">
                  {['off', 'low', 'high'].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setAlisAggressiveness(level)}
                      disabled={loading}
                      className="flex-1 px-4 py-2 rounded-lg font-medium transition disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: alisAggressiveness === level ? '#FF9800' : '#E8E8E8',
                        color: alisAggressiveness === level ? 'white' : '#666',
                        opacity: loading ? 0.6 : 1
                      }}
                      onMouseEnter={(e) => !loading && alisAggressiveness !== level && (e.target.style.backgroundColor = '#F0F0F0')}
                      onMouseLeave={(e) => !loading && (e.target.style.backgroundColor = alisAggressiveness === level ? '#FF9800' : '#E8E8E8')}
                    >
                      {level === 'off' && 'Off'}
                      {level === 'low' && 'Static Fields'}
                      {level === 'high' && 'Aggressive Match'}
                    </button>
                  ))}
                </div>
                <p className="text-gray-500 text-xs mt-2">
                  {alisAggressiveness === 'off' && 'Standard field suggestions only.'}
                  {alisAggressiveness === 'low' && 'Suggest common ALIS fields (name, DOB, etc.).'}
                  {alisAggressiveness === 'high' && 'Aggressively match OCR text with ALIS field descriptors.'}
                </p>
              </div>
            )}
          </div>

          {/* Signers Configuration - Only for Auto Edit */}
          {workflowType === 'auto_edit' && (
            <div className="mb-6 p-4 rounded-lg" style={{
              backgroundColor: '#FFF3E0',
              border: '1px solid #FFE0B2'
            }}>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Configure Signers/Anchors
              </h3>
              <p className="text-xs text-gray-600 mb-4">
                Define who will sign this document. The system will predict which fields belong to each signer during analysis.
              </p>

              {/* Signer List */}
              <div className="space-y-2 mb-4">
                {signers.map((signer) => (
                  <div
                    key={signer.id}
                    className="flex items-center justify-between bg-white p-3 rounded border border-gray-200"
                  >
                    <span className="text-sm font-medium text-gray-700">{signer.name}</span>
                    <button
                      type="button"
                      onClick={() => removeSigner(signer.id)}
                      disabled={signers.length === 1}
                      className="transition disabled:cursor-not-allowed"
                      style={{
                        color: signers.length === 1 ? '#CCC' : '#FF5722'
                      }}
                      onMouseEnter={(e) => signers.length > 1 && (e.target.style.opacity = '0.7')}
                      onMouseLeave={(e) => e.target.style.opacity = '1'}
                      title="Remove signer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Signer */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSignerName}
                  onChange={(e) => setNewSignerName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addSigner()}
                  placeholder="e.g., Manager, Witness, Administrator"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={addSigner}
                  disabled={!newSignerName.trim() || loading}
                  className="px-3 py-2 text-white rounded disabled:cursor-not-allowed transition flex items-center gap-1 text-sm"
                  style={{
                    backgroundColor: !newSignerName.trim() || loading ? '#CCC' : '#FF9800'
                  }}
                  onMouseEnter={(e) => !newSignerName.trim() || loading || (e.target.style.backgroundColor = '#E68900')}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#FF9800'}
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !file}
            className="w-full text-white font-medium py-3 rounded-lg disabled:cursor-not-allowed transition"
            style={{
              backgroundColor: loading || !file ? '#CCC' : '#FF5722'
            }}
            onMouseEnter={(e) => !(loading || !file) && (e.target.style.backgroundColor = '#E64A19')}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#FF5722'}
          >
            {loading ? 'Analyzing PDF...' : 'Analyze PDF'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Upload;
