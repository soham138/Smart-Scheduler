#!/usr/bin/env node
/**
 * Find real THEORY-LAB conflicts by checking actual overlaps
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432, user: 'postgres', 
  password: 'soham2255', database: 'smarttt'
});

(async () => {
  try {
    console.log('🔍 FINDING ACTUAL THEORY-LAB OVERLAPS\n');

    // Find overlapping THEORY and LAB for SAME SUBJECT
    const conflicts = await pool.query(`
      SELECT 
        t1.subject_id,
        s.code,
        s.name,
        t1.day_of_week,
        t1.time_slot_start::text as theory_start,
        t1.time_slot_end::text as theory_end,
        t2.time_slot_start::text as lab_start,
        t2.time_slot_end::text as lab_end,
        COUNT(*) as overlap_count
      FROM timetable t1
      JOIN timetable t2 ON t2.subject_id = t1.subject_id
      JOIN subjects s ON t1.subject_id = s.subject_id
      WHERE t1.slot_type = 'THEORY' 
        AND t1.batch_id IS NULL
        AND t2.slot_type = 'LAB' 
        AND t2.batch_id IS NOT NULL
        AND t1.day_of_week = t2.day_of_week
        AND t1.time_slot_start < t2.time_slot_end
        AND t1.time_slot_end > t2.time_slot_start
      GROUP BY t1.subject_id, s.code, s.name, t1.day_of_week, 
               t1.time_slot_start, t1.time_slot_end,
               t2.time_slot_start, t2.time_slot_end
      ORDER BY s.code, t1.day_of_week, t1.time_slot_start
    `);

    if (conflicts.rows.length === 0) {
      console.log('✅ No conflicts found');
    } else {
      console.log(`⚠️  Found ${conflicts.rows.length} overlapping THEORY-LAB pairs:\n`);
      
      conflicts.rows.slice(0, 10).forEach((row, i) => {
        console.log(`${i+1}. ${row.code} (${row.name})`);
        console.log(`   🗓️  ${row.day_of_week}`);
        console.log(`   📚 THEORY: ${row.theory_start} - ${row.theory_end}`);
        console.log(`   🧪 LAB:    ${row.lab_start} - ${row.lab_end}`);
        console.log();
      });

      if (conflicts.rows.length > 10) {
        console.log(`... and ${conflicts.rows.length - 10} more`);
      }

      console.log(`\n📊 TOTAL CONFLICTS: ${conflicts.rows.length}`);
    }

    // Also check per-branch conflicts (the admin panel groups by branch)
    console.log('\n' + '═'.repeat(50));
    console.log('Breakdown by Branch:\n');

    const branchConflicts = await pool.query(`
      SELECT 
        b.name as branch,
        COUNT(DISTINCT t1.semester) as semesters_affected,
        COUNT(*) as conflict_count
      FROM timetable t1
      JOIN timetable t2 ON t2.subject_id = t1.subject_id
      JOIN branches b ON t1.branch_id = b.branch_id
      WHERE t1.slot_type = 'THEORY' 
        AND t1.batch_id IS NULL
        AND t2.slot_type = 'LAB' 
        AND t2.batch_id IS NOT NULL
        AND t1.day_of_week = t2.day_of_week
        AND t1.time_slot_start < t2.time_slot_end
        AND t1.time_slot_end > t2.time_slot_start
      GROUP BY b.name
      ORDER BY b.name
    `);

    if (branchConflicts.rows.length > 0) {
      console.log('Branch Analysis:');
      branchConflicts.rows.forEach(row => {
        console.log(`${row.branch}: ${row.conflict_count} conflicts in ${row.semesters_affected} semesters`);
      });
    } else {
      console.log('No conflicts by branch');
    }

    await pool.end();
  } catch(e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
})();
