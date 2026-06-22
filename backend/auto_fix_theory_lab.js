#!/usr/bin/env node

const pool = require('./src/config/db');

async function autoFixTheoryLabConflicts() {
  try {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  AUTO-FIX: THEORY-LAB CONFLICTS                          ║');
    console.log('║  Strategy: Move THEORY lectures to non-conflicting slots ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // Available time slots that typically have low conflicts
    const availableSlots = [
      { start: '11:15', end: '12:15' },  // Between morning and lunch
      { start: '12:15', end: '13:15' },  // Lunch time slot
      { start: '16:00', end: '17:00' }   // After main sessions
    ];

    // Get all THEORY-LAB conflicts
    const conflictQuery = `
      SELECT 
        t1.timetable_id as theory_id,
        t1.subject_id as theory_subject_id,
        t1.professor_id as theory_prof_id,
        t1.day_of_week,
        t1.time_slot_start as theory_start,
        t1.time_slot_end as theory_end,
        t2.timetable_id as lab_id,
        t2.batch_id,
        s.code as subject_code
      FROM timetable t1
      INNER JOIN timetable t2 ON 
        t1.branch_id = t2.branch_id AND 
        t1.semester = t2.semester AND 
        t1.day_of_week = t2.day_of_week AND 
        t1.subject_id = t2.subject_id
      LEFT JOIN subjects s ON t1.subject_id = s.subject_id
      WHERE 
        t1.slot_type = 'THEORY' AND 
        t2.slot_type = 'LAB' AND 
        t1.batch_id IS NULL AND 
        t2.batch_id IS NOT NULL AND
        NOT (t1.time_slot_end <= t2.time_slot_start OR t2.time_slot_end <= t1.time_slot_start)
      LIMIT 50
    `;

    const conflicts = await pool.query(conflictQuery);
    console.log(`Found ${conflicts.rows.length} THEORY-LAB conflicts\n`);

    let fixed = 0;
    const updateQueries = [];

    for (const conflict of conflicts.rows) {
      // Try to find an available slot
      for (const slot of availableSlots) {
        // Check if this slot is free
        const checkQuery = await pool.query(`
          SELECT COUNT(*) as count FROM timetable
          WHERE 
            branch_id = (SELECT branch_id FROM timetable WHERE timetable_id = $1) AND
            semester = (SELECT semester FROM timetable WHERE timetable_id = $1) AND
            day_of_week = $2 AND
            time_slot_start = $3 AND
            time_slot_end = $4
        `, [conflict.theory_id, conflict.day_of_week, slot.start, slot.end]);

        if (checkQuery.rows[0].count === 0) {
          // Slot is available - update this THEORY class
          console.log(`✓ Moving ${conflict.subject_code} THEORY from ${conflict.theory_start}-${conflict.theory_end} to ${slot.start}-${slot.end}`);
          
          updateQueries.push({
            id: conflict.theory_id,
            start: slot.start,
            end: slot.end
          });

          fixed++;
          break;
        }
      }
    }

    // Apply updates
    if (updateQueries.length > 0) {
      console.log(`\nApplying ${updateQueries.length} fixes...\n`);
      
      for (const update of updateQueries) {
        await pool.query(
          `UPDATE timetable SET time_slot_start = $1, time_slot_end = $2 WHERE timetable_id = $3`,
          [update.start, update.end, update.id]
        );
      }

      console.log(`✅ Fixed ${fixed} THEORY-LAB conflicts\n`);
      console.log('Remaining conflicts after fix: ' + (conflicts.rows.length - fixed));
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

autoFixTheoryLabConflicts();
