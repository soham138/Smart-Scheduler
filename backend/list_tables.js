#!/usr/bin/env node
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'soham2255',
  database: 'smarttt',
});

(async () => {
  try {
    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📊 All tables in database:\n');
    for (const table of tablesResult.rows) {
      console.log(`  - ${table.table_name}`);
    }

    // Check branch_subjects or similar linking table
    const bsResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%branch%' OR table_name LIKE '%subject%')
      ORDER BY table_name
    `);

    console.log('\n🔗 Branch/Subject related tables:');
    for (const table of bsResult.rows) {
      console.log(`  - ${table.table_name}`);
    }

    // Check if branch_subjects exists
    try {
      const bsCheck = await pool.query('SELECT COUNT(*) as count FROM branch_subjects LIMIT 1');
      console.log(`\n✓ branch_subjects table exists with ${bsCheck.rows[0].count} entries`);
      
      const bsSample = await pool.query('SELECT * FROM branch_subjects LIMIT 2');
      console.log('\nSample branch_subjects:');
      console.log(JSON.stringify(bsSample.rows, null, 2));
    } catch (e) {
      console.log('\n✗ branch_subjects table not found');
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
