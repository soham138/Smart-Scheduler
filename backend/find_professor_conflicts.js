#!/usr/bin/env node
/**
 * Find all PROFESSOR_CLASH conflicts in the system
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432, user: 'postgres', 
  password: 'soham2255', database: 'smarttt'
});

(async () => {
  try {
    console.log('🔍 FINDING PROFESSOR CONFLICTS\n');

    // Find professors with multiple classes at overlapping times
    const conflicts = await pool.query(`
      SELECT 
        t1.professor_id,
        p.name as professor_name,
        COUNT(DISTINCT t1.timetable_id) as overlap_count,
        t1.day_of_week,
        t1.time_slot_start::text,
        t1.time_slot_end::text,
        STRING_AGG(DISTINCT s1.code || ' (' || t1.slot_type || ')', ', ') as subjects
      FROM timetable t1
      JOIN timetable t2 ON t2.professor_id = t1.professor_id
      JOIN subjects s1 ON t1.subject_id = s1.subject_id
      LEFT JOIN professors p ON t1.professor_id = p.professor_id
      WHERE t1.timetable_id != t2.timetable_id
        AND t1.day_of_week = t2.day_of_week
        AND t1.time_slot_start < t2.time_slot_end
        AND t1.time_slot_end > t2.time_slot_start
      GROUP BY t1.professor_id, p.name, t1.day_of_week, t1.time_slot_start, t1.time_slot_end
      ORDER BY professor_name, t1.day_of_week, t1.time_slot_start
    `);

    if (conflicts.rows.length === 0) {
      console.log('✅ No professor conflicts found\n');
    } else {
      console.log(`⚠️  Found ${conflicts.rows.length} professor conflict time slots\n`);

      // Group by professor
      const byProfessor = {};
      conflicts.rows.forEach(row => {
        if (!byProfessor[row.professor_name]) {
          byProfessor[row.professor_name] = [];
        }
        byProfessor[row.professor_name].push(row);
      });

      Object.entries(byProfessor).forEach(([profName, slots]) => {
        console.log(`\n${profName}:`);
        console.log(`  Total conflict slots: ${slots.length}`);
        
        slots.forEach((slot, i) => {
          console.log(`  ${i+1}. ${slot.day_of_week} ${slot.time_slot_start}-${slot.time_slot_end}`);
          console.log(`     Overlapping subjects: ${slot.subjects}`);
          console.log(`     Affected IDs: ${slot.overlap_count} classes`);
        });
      });

      console.log('\n' + '═'.repeat(60));
      
      // Get total affected timetable entries
      const totalAffected = await pool.query(`
        SELECT COUNT(DISTINCT t1.timetable_id) as count
        FROM timetable t1
        JOIN timetable t2 ON t2.professor_id = t1.professor_id
        WHERE t1.timetable_id != t2.timetable_id
          AND t1.day_of_week = t2.day_of_week
          AND t1.time_slot_start < t2.time_slot_end
          AND t1.time_slot_end > t2.time_slot_start
      `);

      console.log(`\n📊 TOTAL TIMETABLE ENTRIES INVOLVED: ${totalAffected.rows[0].count}`);
    }

    await pool.end();
  } catch(e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
})();
