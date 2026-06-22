#!/usr/bin/env node
/**
 * Deep verification: Check for specific conflicts mentioned in admin panel
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432, user: 'postgres', 
  password: 'soham2255', database: 'smarttt'
});

(async () => {
  try {
    console.log('🔍 DEEP VERIFICATION: Checking admin panel conflicts\n');

    // Test specific conflicts from the report
    const testCases = [
      {
        name: 'CS-202 THEORY vs CHE-201 LAB (AI Sem 2)',
        theoryCode: 'CS-202',
        labCode: 'CHE-201',
        day: 'MON',
        theoryTime: '14:00:00-15:00:00'
      },
      {
        name: 'AI403 THEORY vs AI404 LAB (AI Sem 4)',
        theoryCode: 'AI403',
        labCode: 'AI404',
        day: 'MON',
        theoryTime: '15:00:00-16:00:00'
      }
    ];

    for (const test of testCases) {
      console.log(`Testing: ${test.name}`);
      
      const query = `
        SELECT 
          COUNT(*) as count,
          STRING_AGG(DISTINCT t1.slot_type || '@' || t1.time_slot_start || '-' || t1.time_slot_end, ', ') as theory_info,
          STRING_AGG(DISTINCT t2.slot_type || '@' || t2.time_slot_start || '-' || t2.time_slot_end, ', ') as lab_info
        FROM timetable t1
        JOIN timetable t2 ON t2.subject_id = t1.subject_id
        JOIN subjects s1 ON t1.subject_id = s1.subject_id
        JOIN subjects s2 ON t2.subject_id = s2.subject_id
        WHERE s1.code = $1
          AND s2.code = $2
          AND t1.slot_type = 'THEORY'
          AND t1.batch_id IS NULL
          AND t2.slot_type = 'LAB'
          AND t2.batch_id IS NOT NULL
          AND t1.day_of_week = t2.day_of_week
          AND t1.time_slot_start < t2.time_slot_end
          AND t1.time_slot_end > t2.time_slot_start
      `;

      const result = await pool.query(query, [test.theoryCode, test.labCode]);
      const count = result.rows[0].count;

      if (count > 0) {
        console.log(`  ⚠️  FOUND ${count} overlap(s)`);
        console.log(`      Theory: ${result.rows[0].theory_info}`);
        console.log(`      Lab: ${result.rows[0].lab_info}`);
      } else {
        console.log(`  ✓ No conflict found`);
      }
      console.log();
    }

    // Full count again
    console.log('═'.repeat(50));
    const totalQuery = `
      SELECT COUNT(*) as conflict_count
      FROM timetable t1
      JOIN timetable t2 ON t2.subject_id = t1.subject_id
      WHERE t1.slot_type = 'THEORY' AND t1.batch_id IS NULL
        AND t2.slot_type = 'LAB' AND t2.batch_id IS NOT NULL
        AND t1.day_of_week = t2.day_of_week
        AND t1.time_slot_start < t2.time_slot_end
        AND t1.time_slot_end > t2.time_slot_start
    `;

    const total = await pool.query(totalQuery);
    console.log(`\n📊 TOTAL THEORY-LAB CONFLICTS IN DATABASE: ${total.rows[0].conflict_count}`);

    if (total.rows[0].conflict_count === 0) {
      console.log('\n✅ Database is CLEAN');
      console.log('\n💡 Conclusion: Admin panel is showing STALE/CACHED data');
      console.log('   Solution: Refresh the admin panel or clear browser cache');
    } else {
      console.log('\n⚠️  Database HAS conflicts - not a cache issue');
      console.log('   Need to run Solution 3 again');
    }

    await pool.end();
  } catch(e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
})();
