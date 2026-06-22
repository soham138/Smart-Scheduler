#!/usr/bin/env node
require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'soham2255',
  database: 'smarttt',
});

console.log('🔌 Connecting to database...\n');

(async () => {
  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✓ Connected successfully\n');

    // Show existing count
    const before = await pool.query('SELECT COUNT(*) as count FROM timetable');
    console.log('📊 BEFORE: ' + before.rows[0].count + ' timetable entries');
    
    // Delete all entries
    const deleteResult = await pool.query('DELETE FROM timetable');
    console.log('🗑️  Deleted ' + deleteResult.rowCount + ' entries');
    
    // Verify deletion
    const after = await pool.query('SELECT COUNT(*) as count FROM timetable');
    console.log('✓ AFTER: ' + after.rows[0].count + ' timetable entries\n');
    
    console.log('✅ Database cleared - ready for regeneration!');
    
    await pool.end();
    process.exit(0);
  } catch(err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
