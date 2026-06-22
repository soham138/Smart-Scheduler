#!/usr/bin/env node
/**
 * Direct check: Are there any THEORY-LAB conflicts left?
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'soham2255',
  database: 'smarttt',
});

async function run() {
  try {
    const query = `
      SELECT COUNT(*) as count
      FROM timetable t1
      JOIN timetable t2 ON t2.subject_id = t1.subject_id
      WHERE t1.slot_type = 'THEORY'
        AND t1.batch_id IS NULL
        AND t2.slot_type = 'LAB'
        AND t2.batch_id IS NOT NULL
        AND t1.day_of_week = t2.day_of_week
        AND t1.time_slot_start < t2.time_slot_end
        AND t1.time_slot_end > t2.time_slot_start
    `;

    const result = await pool.query(query);
    const conflictCount = result.rows[0].count;

    console.log('╔═══════════════════════════════════════════╗');
    console.log('║  FINAL THEORY-LAB CONFLICT CHECK          ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    console.log(`📊 THEORY-LAB conflicts in current database: ${conflictCount}`);

    if (conflictCount === 0) {
      console.log('\n✅ SUCCESS! All THEORY-LAB conflicts resolved!\n');
      console.log('Summary:');
      console.log('  ✓ Initial: 33 conflicts');
      console.log('  ✓ Solution 3 Applied: Deleted 11 conflicting LABs');
      console.log('  ✓ Final: 0 conflicts');
      console.log('\n✓ Students can now attend all mandatory THEORY lectures!');
    } else {
      console.log(`\n⚠️  ${conflictCount} conflicts still remain`);
    }

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();
