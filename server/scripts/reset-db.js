#!/usr/bin/env node

/**
 * Database reset script
 * Usage: npm run reset-db
 *
 * Drops all tables and recreates the schema
 * Use this to start fresh during development/testing
 */

const db = require('../db/database');

console.log('\n🗑️  Resetting database...\n');

db.reset()
  .then((result) => {
    console.log('✅', result.message);
    console.log('\n📝 Database is now clean and ready for testing!\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error resetting database:', err.message);
    console.error('\n⚠️  Database reset failed. Please check the error above.\n');
    process.exit(1);
  });
