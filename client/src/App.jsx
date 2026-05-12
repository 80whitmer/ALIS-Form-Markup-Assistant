import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Upload from './pages/Upload';
import JobHistory from './pages/JobHistory';
import FormMarkup from './pages/FormMarkup';
import JobDetail from './pages/JobDetail';
import { APP_VERSION, APP_NAME, APP_TAGLINE } from './config';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-xl font-bold text-blue-600">
                📋 ALIS Form Markup
              </Link>
            </div>
            <div className="flex items-center gap-6">
              <Link to="/" className="text-gray-600 hover:text-gray-900">
                New Analysis
              </Link>
              <Link to="/history" className="text-gray-600 hover:text-gray-900">
                Job History
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<Upload />} />
          <Route path="/history" element={<JobHistory />} />
          <Route path="/jobs/:jobId" element={<FormMarkup />} />
          <Route path="/jobs/:jobId/detail" element={<JobDetail />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-gray-500 text-sm text-center">
            {APP_NAME} {APP_VERSION} — {APP_TAGLINE}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
