# ALIS Form Markup Assistant — Setup & Getting Started

**Project Status**: Foundation Setup Complete ✅  
**Date**: May 11, 2026  
**Deployment Model**: Hybrid (Node.js + React Web App)

---

## Project Layout Summary

Your standalone ALIS Form Markup Assistant is now organized as follows:

```
ALIS Form Markup Assistant/
├── form-markup-poc/              ← Core PoC modules (ready to use)
├── server/                       ← Node.js backend (ready to extend)
├── client/                       ← React frontend (ready to start)
├── docs/                         ← Documentation
├── package.json                  ← Root monorepo config
├── PROJECT_STRUCTURE.md          ← Detailed architecture
├── SETUP.md                      ← This file
└── README.md                     ← Project overview
```

---

## What's Been Built

### ✅ Backend Infrastructure

**Server** (`server/server.js`)
- Express.js app entry point
- CORS middleware configured
- Health check endpoint at `/api/health`

**Database** (`server/db/database.js`)
- SQLite with 3 tables: `jobs`, `job_versions`, `suggestions`
- Indexes for fast lookups
- Promise-based API for async operations

**Job Management API** (`server/api/jobs.js`)
- `POST /api/jobs` — Submit PDF for analysis
- `GET /api/jobs` — List jobs with filtering
- `GET /api/jobs/:jobId` — Get job details
- `GET /api/jobs/:jobId/suggestions` — Fetch suggestions
- `POST /api/jobs/:jobId/apply` — Apply changes to PDF
- `GET /api/jobs/:jobId/stream` — SSE for real-time updates

**Download API** (`server/api/downloads.js`)
- `GET /api/downloads/jobs/:jobId/output` — Download modified PDF
- `GET /api/downloads/jobs/:jobId/input` — Download original PDF

**Core Services**
- **form-markup.js** — Orchestrates the analysis pipeline
  - Detects fields → Extracts labels → Matches codes → Stores suggestions
  - Coordinates with PoC modules
  
- **property-applier.js** — Modifies PDFs with approved suggestions
  - Updates field names to ALIS encoding format
  - Sets required/read-only flags
  - Adds tooltips with signer metadata

### ✅ Frontend Infrastructure

**React App** (`client/src/App.jsx`)
- Navigation header with links
- Route definitions for all pages
- Footer with version info

**Pages**
1. **Upload.jsx** — PDF submission form
   - Drag-drop file upload
   - Company name & document title input
   - OCR radius configuration
   - Real-time validation

2. **JobHistory.jsx** — Job listing & search
   - Searchable job table
   - Status badges
   - Links to job details

3. **FormMarkup.jsx** — Analysis review & edit
   - Page-by-page navigation
   - Editable suggestion table
   - Signer dropdown selector
   - Anchor name editing
   - Required/Read-only checkboxes
   - Confidence visualization
   - "Apply & Download" button

4. **JobDetail.jsx** — Job archive & retrieval
   - Job summary with statistics
   - File version history
   - Download buttons for original & applied PDFs
   - Configuration recap

**Styling**
- Tailwind CSS configured (`tailwind.config.js`)
- PostCSS with autoprefixer (`postcss.config.js`)
- Base styles in `index.css`
- ALIS brand colors available

### ✅ PoC Integration

All core PoC modules remain intact in `form-markup-poc/`:
- `field-detector.js` — AcroForm field extraction
- `label-extractor.js` — OCR-based label finding
- `code-matcher.js` — 4-level fuzzy matching
- `property-suggester.js` — Suggestion generation
- `master-list-map.js` — ALIS code definitions

---

## Installation & Setup

### Prerequisites

Ensure you have installed:
- **Node.js 16+** — Download from [nodejs.org](https://nodejs.org)
- **npm** — Comes with Node.js

### Step 1: Install Dependencies

Navigate to the project root and install all dependencies:

```bash
cd "C:\Users\AaronWhitmer\ALIS Form Markup Assistant"
npm install
```

This installs:
- Backend: Express, SQLite3, pdf-lib, tesseract.js, fuse.js
- Client: React, React Router, Axios, Lucide icons, Tailwind CSS

**Installation time**: ~2-3 minutes (first time only, tesseract.js downloads large language data)

### Step 2: Set Up Environment

Copy the example environment file:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` if needed (defaults are usually fine):
```
PORT=3000
NODE_ENV=development
```

### Step 3: Start the Server

```bash
npm start
```

You should see:
```
╔════════════════════════════════════════════╗
║   ALIS Form Markup Assistant               ║
║   Server running on http://localhost:3000    ║
╚════════════════════════════════════════════╝
```

The server is now running and listening for requests.

### Step 4: Start the Frontend (in a new terminal)

In a separate terminal, navigate to the client directory:

```bash
cd client
npm start
```

React dev server will start on `http://localhost:3000` (proxied through the backend).

The browser should open automatically. If not, visit: **http://localhost:3000**

---

## Development Workflow

### For Full Stack Development

Run both backend and frontend together:

```bash
npm run dev
```

This uses `concurrently` to run:
- Backend: `nodemon server/server.js` (auto-restarts on file changes)
- Frontend: `npm start` (dev server with hot reload)

### For Backend Only

```bash
npm start
```

Or with auto-reload:

```bash
npm run server:dev
```

### For Frontend Only

```bash
cd client
npm start
```

---

## Testing the System

### 1. Test the Health Check

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-05-11T..."
}
```

### 2. Upload a Test PDF

1. Open http://localhost:3000 in your browser
2. Click "New Analysis"
3. Drag-drop a PDF form (must be an AcroForm document)
4. Enter company name (e.g., "Test Company")
5. Enter document title (e.g., "Test Form")
6. Leave OCR radius at default (100px)
7. Click "Analyze PDF"

The system will:
- Detect AcroForm fields
- Extract labels via OCR
- Match to ALIS codes
- Generate suggestions
- Display them in a table for review

### 3. Review & Edit Suggestions

- Click through pages using the page navigation tabs
- Edit suggested codes, signers, and anchors directly in the table
- Check/uncheck required and read-only flags
- Observe confidence scores

### 4. Apply & Download

- Click "Apply & Download"
- The system will:
  - Encode all suggestions into the PDF field names
  - Create archived copies locally
  - Generate the modified PDF
  - Trigger download

### 5. Check Job History

- Click "Job History" in the header
- View all past jobs with status badges
- Search by company or document title
- Click "View" to see job details and download versions

---

## Project Structure Quick Reference

| Path | Purpose |
|------|---------|
| `form-markup-poc/` | Core analysis logic (stable, reusable) |
| `server/api/` | API route handlers |
| `server/db/` | SQLite database setup |
| `server/services/` | Job orchestration & PDF modification |
| `server/jobs/` | Temporary job storage (auto-created) |
| `server/archived/` | Local file archive by company/date |
| `client/src/pages/` | React page components |
| `client/src/components/` | Reusable React components (future) |
| `docs/` | Architecture & API documentation |

---

## Database

SQLite database is auto-created at `server/db/alis-form-markup.db` on first run.

### View the Database

```bash
# If you have sqlite3 CLI installed:
sqlite3 server/db/alis-form-markup.db

# Then try:
.tables                    # Show all tables
SELECT COUNT(*) FROM jobs; # Count jobs
.mode column               # Pretty print
SELECT * FROM jobs LIMIT 5; # View recent jobs
```

---

## Troubleshooting

### "Cannot find module 'express'"

Run `npm install` from the project root.

### "Port 3000 already in use"

Either:
1. Kill the existing process: `pkill -f "node server.js"`
2. Or change PORT in `server/.env` to another value (e.g., 3001)

### "PDF detection failed / No fields found"

Ensure the PDF is a proper AcroForm document. PDFs created with:
- ✅ Adobe Acrobat Pro
- ✅ Tungsten (ALIS PDF editor)
- ✅ Other form creation tools

Non-form PDFs (scanned images, text-only) won't have detectable fields.

### "Tesseract.js timeout"

On first run, Tesseract downloads language data (~100MB). This can take a few minutes.
Subsequent runs will be much faster.

To speed up OCR, reduce the search radius in the upload form (e.g., 50px instead of 100px).

### "Database is locked"

Ensure only one Node.js instance is running:
```bash
pkill -f "node server.js"
npm start
```

---

## Next Steps

### Phase 1: Validate the Foundation ✓ (Just completed!)

All backend, database, and frontend scaffolding is in place.

### Phase 2: Integrate the PoC Modules

The form-markup.js service already imports the PoC modules. Test end-to-end:
1. Upload a PDF
2. Check that fields are detected
3. Check that suggestions are generated
4. Verify database entries

### Phase 3: Test Property Applier

Once property-applier.js is verified:
1. Apply suggestions to a PDF
2. Download the modified PDF
3. Open in Adobe/Tungsten to verify field names were updated correctly

### Phase 4: Enhanced UI (Future)

Add components for:
- Reusable "scripts" (saved configurations)
- Batch job submission
- Advanced filtering & search
- Audit trail/compliance reports
- Role-based access control

### Phase 5: Desktop App Packaging (Future)

Once the web app is stable, wrap with Tauri:
```bash
npm run build:desktop
```

This creates a standalone Windows/Mac/Linux executable with no Node.js dependency.

---

## Key Design Decisions

1. **Monorepo with separate directories**
   - Keeps frontend and backend cleanly separated
   - Easier to extract into separate services later
   - Shared package.json at root for convenience

2. **SQLite for local persistence**
   - No external dependencies (database file is local)
   - Full-text search capabilities
   - Sufficient for single-user/small-team use

3. **Local file archiving by company/date**
   - Easy compliance auditing ("what changed on 2026-05-11?")
   - No cloud storage required
   - Natural folder browsing for users

4. **ALIS encoding in field names**
   - Format: `{alisCode}|{anchorName}`
   - Example: `resident.demographics.name|resident.text.1`
   - Enables downstream ALIS systems to parse field metadata

5. **Hybrid deployment path**
   - Web app first (easier to develop, test, share)
   - Desktop app via Tauri (later, if needed)
   - No code rewrite required

---

## Documentation Files

- **README.md** — Project overview & quick start
- **PROJECT_STRUCTURE.md** — Detailed architecture & data flow
- **SETUP.md** — This file (installation & troubleshooting)
- **form-markup-poc/README.md** — PoC module documentation
- **docs/API_SPEC.md** — Detailed API specifications (coming)
- **docs/DATABASE_SCHEMA.md** — SQL schema reference (coming)

---

## Support & Questions

For questions or issues:
- Check the troubleshooting section above
- Review PROJECT_STRUCTURE.md for architecture details
- Examine the code comments in key files
- Contact Aaron Whitmer (aaron@go-alis.com)

---

**Status**: Ready for development & testing  
**Next Action**: Run `npm install` and `npm start`

🎉 Your ALIS Form Markup Assistant is ready to roll!
