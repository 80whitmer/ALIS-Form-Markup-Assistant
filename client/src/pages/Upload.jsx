import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload as UploadIcon } from 'lucide-react';
import axios from 'axios';

function Upload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [ocrRadius, setOcrRadius] = useState(100);
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file || !companyName || !documentTitle) {
      setError('All fields are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64PDF = reader.result;

        const response = await axios.post('/api/jobs', {
          pdf: base64PDF,
          company_name: companyName,
          document_title: documentTitle,
          ocr_radius: ocrRadius
        });

        const { jobId } = response.data;
        navigate(`/jobs/${jobId}`);
      };
      reader.readAsDataURL(file);
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
            className="mb-6 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
            </div>

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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <p className="text-gray-500 text-xs mt-1">
                How far to search for text near each field (default: 100px)
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !file}
            className="w-full bg-blue-600 text-white font-medium py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Analyzing PDF...' : 'Analyze PDF'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Upload;
