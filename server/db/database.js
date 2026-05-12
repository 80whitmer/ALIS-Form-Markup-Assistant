const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'alis-form-markup.db');

let db = null;

function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database at', DB_PATH);
      }
    });
    db.configure('busyTimeout', 5000);
  }
  return db;
}

function createSchema(database) {
  database.serialize(() => {
    database.run(`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'analyzing', company_name TEXT, document_title TEXT, ocr_radius INTEGER DEFAULT 100, form_template TEXT, signers TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME, error_message TEXT)`);
    database.run(`CREATE TABLE IF NOT EXISTS job_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, version_type TEXT NOT NULL, file_path TEXT, suggestion_count INTEGER, approved_count INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE)`);
    database.run(`CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, field_page INTEGER, field_name TEXT, field_type TEXT, suggested_code TEXT, signer TEXT, anchor_name TEXT, required BOOLEAN DEFAULT 0, read_only BOOLEAN DEFAULT 0, field_properties TEXT, confidence REAL, approval_status TEXT DEFAULT 'review_needed', match_text TEXT, match_zone TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_name)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_suggestions_job ON suggestions(job_id)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_suggestions_signer ON suggestions(signer)`);
    console.log('Database schema initialized');
  });
}

function initialize() {
  const database = getDatabase();
  createSchema(database);
}

function reset() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close(() => { db = null; performReset(resolve, reject); });
    } else {
      performReset(resolve, reject);
    }
  });
}

function performReset(resolve, reject) {
  const database = getDatabase();
  database.serialize(() => {
    database.run('DROP TABLE IF EXISTS suggestions');
    database.run('DROP TABLE IF EXISTS job_versions');
    database.run('DROP TABLE IF EXISTS jobs', () => {
      createSchema(database);
      console.log('[OK] Database reset');
      resolve({ success: true });
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

module.exports = { getDatabase, initialize, reset, run, get, all };
