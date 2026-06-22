#!/usr/bin/env node
/**
 * Find ALL professor conflicts regardless of slot type
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432, user: 'postgres', 
  password: 'soham2255', database: 'smarttt'
});

(async () => {
  try {
    console.log('🔍 ANALYZING ALL PROFESSOR CONFLICTS\n');

    // All professor conflicts
    const allConflicts = await pool.query(`
      SELECT 
        t1.timetable_id,
        t2.timetable_id as conflicting_id,
        p.name as professor_name,
        s1.code as subject1,
        s2.code as subject2,
        t1.slot_type,
        t2.slot_type as conflicting_type,
        t1.day_of_week,
        t1.time_slot_start,
        t1.time_slot_end
      FROM timetable t1
      JOIN timetable t2 ON t2.professor_id = t1.professor_id
      JOIN subjects s1 ON t1.subject_id = s1.subject_id
      JOIN subjects s2 ON t2.subject_id = s2.subject_id
      LEFT JOIN professors p ON t1.professor_id = p.professor_id
      WHERE t1.timetable_id < t2.timetable_id -- Avoid duplicates
        AND t1.day_of_week = t2.day_of_week
        AND t1.time_slot_start < t2.time_slot_end
        AND t1.time_slot_end > t2.time_slot_start
      ORDER BY professor_name, t1.day_of_week, t1.time_slot_start
    `);

    console.log(`Total conflicting pairs: ${allConflicts.rows.length}\n`);

    if (allConflicts.rows.length === 0) {
      console.log('✅ No professor conflicts found!\n');
    } else {
      console.log('Sample conflicts (first 10):');
      allConflicts.rows.slice(0, 10).forEach((row, i) => {
        console.log(`\n${i+1}. ${row.professor_name}`);
        console.log(`   Conflict 1: ${row.subject1} (${row.slot_type})`);
        console.log(`   Conflict 2: ${row.subject2} (${row.conflicting_type})`);
        console.log(`   Time: ${row.day_of_week} ${row.time_slot_start}-${row.time_slot_end}`);
      });

      // Count by type combination
      const typeGroups = new Map();
      allConflicts.rows.forEach(row => {
        const key = `${row.slot_type}-vs-${row.conflicting_type}`;
        typeGroups.set(key, (typeGroups.get(key) || 0) + 1);
      });

      console.log('\n\nConflict type breakdown:');
      Array.from(typeGroups.entries()).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    }

    await pool.end();
  } catch(e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
})();
