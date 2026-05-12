# ALIS Form Markup Assistant — Project Structure

**Deployment Model**: Hybrid (Node.js + React Web App → Tauri Desktop App)  
**Status**: Foundation Setup  
**Last Updated**: May 11, 2026

---

## Directory Tree

```
ALIS Form Markup Assistant/
├── form-markup-poc/                    # PoC modules (reused as-is)
│   ├── field-detector.js
│   ├── label-extractor.js
│   ├── code-matcher.js
│   ├── property-suggester.js
│   ├── master-list-map.js
│   ├── ui-app-v2.html                  # Standalone test UI
│   └── package.json
│
├── server/                             # Node.js backend
│   ├── api/
│   │   ├── routes.js                   # Express route definitions
│   │   ├── jobs.js                     # Job API endpoints
│   │   └── downloads.js                # PDF download endpoints
│   │
│   ├── db/
│   │   ├── schema.js                   # SQLite schema + initialization
│   │   ├── database.js                 # Database connection wrapper
│   │   └── migrations/
│   │
│   ├── services/
│   │   ├── form-markup.js              # Job orchestrator (adapted from alis-hub)
│   │   └── property-applier.js         # PDF modification (adapted from alis-hub)
│   │
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   └── cors.js
│   │
│   ├── jobs/                           # Job storage (temporary)
│   │   └── [jobId]/
│   │       ├── input.pdf
│   │       ├── suggestions.json
│   │       └── output.pdf
│   │
│   ├── archived/                       # Local versioning (by company/date)
│   │   └── [company-name]/
│   │       └── 2026-05-11/
│   │           ├── original-[docname].pdf
│   │           └── applied-[docname].pdf
│   │
│   └── server.js                       # Express app entry point
│
├── client/                             # React frontend
│   ├── public/
│   │   └── index.html
│   │
│   ├── src/
│   │   ├── components/
│   │   │   ├── SuggestionTable.jsx     # Main review/edit UI
│   │   │   ├── SignerManager.jsx       # Signer color-coding widget
│   │   │   ├── FieldTypeDisplay.jsx    # Field type badges
│   │   │   └── ConfidenceBar.jsx       # Confidence visualization
│   │   │
│   │   ├── pages/
│   │   │   ├── Upload.jsx              # PDF upload + form config
│   │   │   ├── FormMarkup.jsx          # Analysis + review workflow
│   │   │   ├── JobHistory.jsx          # Job list with search/filter
│   │   │   └── JobDetail.jsx           # Re-apply past jobs
│   │   │
│   │   ├── hooks/
│   │   │   └── useSSE.js               # Real-time event streaming
│   │   │
│   │   ├── utils/
│   │   │   └── api.js                  # API client wrapper
│   │   │
│   │   ├── App.jsx
│   │   └── index.jsx
│   │
│   └── package.json
│
├── scripts/                            # Build/utility scripts
│   ├── build-desktop.sh                # Tauri packaging (future)
│   └── seed-db.js                      # Test data generator
│
├── docs/                               # Documentation
│   ├── ARCHITECTURE.md                 # System design + data flow
│   ├── API_SPEC.md                     # Endpoint specifications
│   ├── DATABASE_SCHEMA.md              # SQLite tables + queries
│   └── ALIS_CODES.md                   # Reference of ALIS field codes
│
├── .gitignore
├── README.md
├── package.json                        # Root monorepo config
└── docker-compose.yml                  # Optional: containerization
```

---

## Core Dependencies

### Backend (Node.js)
- **express** — HTTP server + routing
- **sqlite3** — Lightweight database for job history + search
- **pdf-lib** — PDF field manipulation
- **tesseract.js** — OCR for label extraction
- **fuse.js** — Fuzzy matching for ALIS code suggestions
- **cors** — Cross-origin handling
- **dotenv** — Environment configuration
- **uuid** — Job ID generation

### Frontend (React 18)
- **react** — UI framework
- **react-router-dom** — Client-side routing
- **axios** — HTTP client for API calls
- **lucide-react** — Icon library (aligns with ALIS branding)
- **tailwindcss** — Styling (ALIS logo color palette)

### Future (Tauri Desktop App)
- **@tauri-apps/api** — Desktop integration
- **@tauri-apps/cli** — Build tooling

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User uploads PDF + selects form template (optional)         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Server receives upload → POST /api/jobs                     │
│ Generates jobId + creates job record in SQLite              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ form-markup.js orchestrates PoC pipeline:                   │
│  1. detectFieldsFromPDF() — extract AcroForm fields         │
│  2. extractTextNearFields() — OCR labels                    │
│  3. generatePropertySuggestions() — match to ALIS codes     │
│  4. Emits SSE events for real-time progress                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend receives suggestions via SSE                       │
│ Displays SuggestionTable with:                              │
│  • Current field name (from PDF)                            │
│  • Suggested ALIS code                                      │
│  • Editable signer (Resident/Physician/Staff/etc.)          │
│  • Editable anchor name (resident.text.1, etc.)             │
│  • Required + Read-Only checkboxes                          │
│  • Confidence score                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ User reviews & edits suggestions (in table)                 │
│ Bulk approve/reject actions                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ User clicks "Apply & Download"                              │
│ POST /api/jobs/[jobId]/apply with edited suggestions       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ property-applier.js modifies PDF:                           │
│  1. Load original PDF via pdf-lib                           │
│  2. For each suggestion:                                    │
│     • Update field name → "alis.code|anchor"               │
│     • Set required flag                                     │
│     • Set read-only flag                                    │
│     • Add tooltip with signer metadata                      │
│  3. Save modified PDF buffer                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Archive both PDFs locally:                                  │
│  • /archived/[company]/2026-05-11/original-[docname].pdf    │
│  • /archived/[company]/2026-05-11/applied-[docname].pdf     │
│ Update job_versions table with both paths                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Return modified PDF for download                            │
│ Display success + archive location                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Local File Organization

PDFs are archived by company and date for easy retrieval and compliance auditing:

```
archived/
├── Steadman Hill/
│   ├── 2026-05-11/
│   │   ├── original-move-in-assessment.pdf
│   │   └── applied-move-in-assessment.pdf
│   │
│   └── 2026-05-10/
│       ├── original-health-status.pdf
│       └── applied-health-status.pdf
│
└── Sunrise Senior Living/
    └── 2026-05-11/
        ├── original-resident-agreement.pdf
        └── applied-resident-agreement.pdf
```

Database tracks all versions via `job_versions` table (see DATABASE_SCHEMA.md).

---

## SQLite Database Schema

### Tables

**jobs**
```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  status TEXT,              -- 'analyzing' | 'reviewed' | 'applied' | 'downloaded' | 'failed'
  company_name TEXT,
  document_title TEXT,
  ocr_radius INTEGER,
  form_template TEXT,       -- Optional template ID
  created_at DATETIME,
  completed_at DATETIME,
  error_message TEXT
);
```

**job_versions**
```sql
CREATE TABLE job_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  version_type TEXT,        -- 'original' | 'applied'
  file_path TEXT,
  suggestion_count INTEGER,
  approved_count INTEGER,
  created_at DATETIME,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
```

**suggestions**
```sql
CREATE TABLE suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  field_page INTEGER,
  field_name TEXT,          -- Original field name from PDF
  field_type TEXT,          -- 'text' | 'signature' | 'checkbox' | 'radio'
  suggested_code TEXT,      -- ALIS code (e.g., 'resident.demographics')
  signer TEXT,              -- 'resident' | 'physician' | 'staff' | etc.
  anchor_name TEXT,         -- e.g., 'resident.text.1'
  required BOOLEAN,
  read_only BOOLEAN,
  confidence REAL,          -- 0.0-1.0
  approval_status TEXT,     -- 'auto_approve' | 'review_needed' | 'rejected' | 'approved'
  created_at DATETIME,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
```

Full-text search index on `suggestions.suggested_code`, `suggestions.signer`, `suggestions.anchor_name` for rapid filtering.

---

## API Endpoints

### Analysis
- **POST /api/jobs** — Submit PDF for analysis
  - Request: `{ pdf, company_name, document_title, ocr_radius?, form_template? }`
  - Response: `{ jobId, status: 'analyzing' }`

- **GET /api/jobs/:jobId/suggestions** — Fetch suggestions for a job
  - Response: `{ jobId, status, suggestions: [ {...} ], summary: {...} }`

### Job Management
- **GET /api/jobs** — List all jobs with search/filter
  - Query: `?company=X&status=Y&search=Z`
  - Response: `{ jobs: [ {...} ], total, offset }`

- **GET /api/jobs/:jobId** — Get job detail + history
  - Response: `{ job, versions: [ {...} ], suggestions: [ {...} ] }`

### Apply & Download
- **POST /api/jobs/:jobId/apply** — Apply suggestions to PDF
  - Request: `{ suggestions: [ {...edited...} ] }`
  - Response: `{ pdf: Buffer, archive_path }`

- **GET /api/jobs/:jobId/download** — Download modified PDF
  - Response: PDF file (Content-Disposition: attachment)

### Server-Sent Events
- **GET /api/jobs/:jobId/stream** — Real-time job progress
  - Events: `job_start | item_start | item_done | item_fail | job_done`

---

## Script Concept (Future Enhancement)

Once a form is analyzed, users can save the mapping as a reusable "script" and apply it to similar documents:

```json
{
  "id": "move-in-assessment-v1",
  "name": "Move-in Assessment Form v1",
  "description": "Maps common move-in assessment fields to ALIS codes",
  "form_type": "move-in-assessment",
  "template_hash": "abc123...",
  "field_mappings": [
    {
      "original_label": "Resident Name",
      "alis_code": "resident.demographics.name",
      "signer": "resident",
      "anchor": "resident.text.1",
      "required": true,
      "read_only": false
    },
    {
      "original_label": "Physician Signature",
      "alis_code": "physician.approval.signature",
      "signer": "physician",
      "anchor": "physician.signature.1",
      "required": true,
      "read_only": false
    }
  ],
  "created_at": "2026-05-11T12:00:00Z",
  "last_applied": "2026-05-11T15:30:00Z",
  "apply_count": 3
}
```

Scripts are stored in `server/scripts/` as JSON files and applied via: POST `/api/jobs/:jobId/apply-script?scriptId=move-in-assessment-v1`

---

## Tech Stack Alignment

| Component | Technology | Reasoning |
|-----------|-----------|-----------|
| Backend | Node.js + Express | Lightweight, rapid prototyping, reuses PoC |
| Database | SQLite | No setup required, embedded in app, FTS for search |
| Frontend | React 18 | Modern UI, component reuse, familiar to team |
| PDF | pdf-lib | Pure JS, no native dependencies |
| OCR | Tesseract.js | WASM-based, works in browser or Node |
| Matching | Fuse.js | Lightweight fuzzy matching |
| Desktop (Future) | Tauri | Rust-based, small footprint, web tech reuse |

---

## Deployment Phases

### Phase 1: Web App (Current)
- Express backend + SQLite local database
- React SPA frontend
- Run locally: `npm start`
- Accessible at `http://localhost:3000`

### Phase 2: Tauri Desktop App (Future)
- Wrap Express + SQLite in Tauri
- Single-file executable (Windows/Mac/Linux)
- No Node.js installation required for end users
- Native file dialogs, auto-updates

### Phase 3: Compliance & Audit (Later)
- Extend job history with digital signatures
- Export compliance reports (who applied what when)
- Role-based access control (Compliance Officer, Facility Manager, etc.)
- Webhook integration with ALIS for real-time sync

---

## Next Steps

1. **Initialize Node.js project** → `npm init`
2. **Set up Express server** → `server/server.js`
3. **Initialize SQLite database** → `server/db/schema.js`
4. **Copy PoC modules** → `form-markup-poc/` (already exist)
5. **Adapt form-markup.js** → Move from alis-hub, update paths
6. **Adapt property-applier.js** → Move from alis-hub, update paths
7. **Build React app** → `client/src/pages/FormMarkup.jsx`
8. **Wire API endpoints** → Connect frontend to backend
9. **Test end-to-end** → Upload → analyze → review → apply → download
10. **Build job history UI** → JobHistory.jsx + JobDetail.jsx

---

**Status**: Ready to initialize project scaffolding  
**Owner**: Aaron (aaron@go-alis.com)
