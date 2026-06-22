#!/usr/bin/env node
/**
 * Direct timetable dump: Check raw data to understand what admin panel sees
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432, user: 'postgres', 
  password: 'soham2255', database: 'smarttt'
});

(async () => {
  try {
    console.log('🔍 DIRECT TABLE INSPECTION\n');

    // Get a sample of actual timetable entries
    console.log('Sample THEORY entries:');
    const theoryResult = await pool.query(`
      SELECT t.timetable_id, s.code, s.name, t.day_of_week, 
             t.time_slot_start, t.time_slot_end, t.batch_id, t.slot_type
      FROM timetable t
      JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.slot_type = 'THEORY' AND t.batch_id IS NULL
      LIMIT 10
    `);
    console.table(theoryResult.rows);

    console.log('\nSample LAB entries:');
    const labResult = await pool.query(`
      SELECT t.timetable_id, s.code, s.name, t.day_of_week, 
             t.time_slot_start, t.time_slot_end, t.batch_id, t.slot_type
      FROM timetable t
      JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.slot_type = 'LAB' AND t.batch_id IS NOT NULL
      LIMIT 10
    `);
    console.table(labResult.rows);

    // Count totals
    console.log('\nTotals:');
    const counts = await pool.query(`
      SELECT 
        slot_type,
        COUNT(*) as total,
        COUNT(CASE WHEN batch_id IS NULL THEN 1 END) as theory_count,
        COUNT(CASE WHEN batch_id IS NOT NULL THEN 1 END) as lab_count
      FROM timetable
      GROUP BY slot_type
    `);
    console.table(counts.rows);

    // Check ConflictDetector directly
    console.log('\n\n📡 TESTING CONFLICTDETECTOR API\n');
    const axios = require('axios');
    try {
      const response = await axios.get('http://localhost:5000/api/conflicts', { timeout: 5000 });
      console.log('API Response Status:', response.status);
      
      if (response.data && response.data.criticalConflicts) {
        console.log(`Critical Conflicts from API: ${response.data.criticalConflicts.length}`);
        
        // Show first 5
        console.log('\nFirst 5 conflicts from API:');
        response.data.criticalConflicts.slice(0, 5).forEach((conflict, i) => {
          console.log(`${i+1}. ${conflict.message}`);
          console.log(`   Type: ${conflict.type}`);
          if (conflict.classes) {
            console.log(`   Classes: ${conflict.classes.map(c => c.code).join(', ')}`);
          }
        });
        
        console.log(`\nTotal from API: ${response.data.criticalConflicts.length}`);
      } else {
        console.log('Unexpected API response format:', response.data);
      }
    } catch(apiErr) {
      console.log('⚠️ Could not reach API:', apiErr.message);
    }

    await pool.end();
  } catch(e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
})();
