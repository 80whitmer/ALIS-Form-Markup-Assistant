const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'db/alis-form-markup.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database');

  // Check if signers column exists
  db.all("PRAGMA table_info(jobs)", (err, rows) => {
    if (err) {
      console.error('Error reading schema:', err.message);
      process.exit(1);
    }

    const hasSigners = rows.some(row => row.name === 'signers');

    if (!hasSigners) {
      console.log('Adding signers column to jobs table...');
      db.run('ALTER TABLE jobs ADD COLUMN signers TEXT', (err) => {
        if (err) {
          console.error('Error adding column:', err.message);
          process.exit(1);
        }
        console.log('✓ Signers column added successfully');
        db.close();
      });
    } else {
      console.log('✓ Signers column already exists');
      db.close();
    }
  });
});
