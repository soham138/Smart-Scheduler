#!/usr/bin/env node
/**
 * Regenerate timetables with FIXED algorithm
 * - Max 1 theory lecture per subject per day
 * - No theory + lab same day for same subject
 * - Clears old data and regenerates from scratch
 */

require('dotenv').config({ path: './.env' });
const pool = require('./src/config/db');
const TimetableAlgorithm = require('./src/algorithms/TimetableAlgorithm');

const BRANCHES = [
  { id: '72b6f7c5-f8ff-41d4-988f-aeab1d16c1c0', name: 'Artificial Intelligence' },
  { id: '8e1571fa-2298-49c7-871c-ccdfdd9a6b18', name: 'Computer Engineering' },
  { id: '243337b3-deeb-4023-ac29-5c55db8356d1', name: 'Internet of Things' }
];

const SEMESTERS = [2, 4, 6, 8];

async function regenerateFixed() {
  let connection;
  try {
    console.log('\n' + '='.repeat(70));
    console.log('TIMETABLE REGENERATION WITH FIXED ALGORITHM');
    console.log('Constraints: Max 1 theory/day + No same-day theory-lab conflicts');
    console.log('='.repeat(70) + '\n');

    connection = await pool.connect();

    // Step 1: Clear all timetables
    console.log('📋 Step 1: Clearing all old timetables...');
    const clearResult = await connection.query('DELETE FROM timetable');
    console.log(`✓ Deleted ${clearResult.rowCount} old entries\n`);

    // Step 2: Regenerate for each branch-semester
    let totalGenerated = 0;
    
    for (const branch of BRANCHES) {
      for (const semester of SEMESTERS) {
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`🎯 ${branch.name} - Semester ${semester}`);
        console.log('─'.repeat(70));

        try {
          const algo = new TimetableAlgorithm(branch.id, semester);
          const result = await algo.generate();

          if (result.success) {
            const countResult = await connection.query(
              'SELECT COUNT(*) as count FROM timetable WHERE branch_id = $1 AND semester = $2',
              [branch.id, semester]
            );
            const count = countResult.rows[0].count;
            console.log(`✓ Generated successfully - ${count} slots created`);
            totalGenerated += count;

            // Show theory count
            const theoryResult = await connection.query(
              'SELECT COUNT(*) as count FROM timetable WHERE branch_id = $1 AND semester = $2 AND slot_type = $3',
              [branch.id, semester, 'THEORY']
            );
            console.log(`  - Theory lectures: ${theoryResult.rows[0].count}`);

            // Show lab count
            const labResult = await connection.query(
              'SELECT COUNT(*) as count FROM timetable WHERE branch_id = $1 AND semester = $2 AND slot_type = $3',
              [branch.id, semester, 'LAB']
            );
            console.log(`  - Lab sessions: ${labResult.rows[0].count}`);

          } else {
            console.log(`✗ Generation failed: ${result.error}`);
            if (result.details) {
              console.log(`  Details: ${result.details}`);
            }
          }
        } catch (err) {
          console.error(`✗ Error: ${err.message}`);
        }
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ REGENERATION COMPLETE`);
    console.log(`Total slots created: ${totalGenerated}`);
    console.log('='.repeat(70) + '\n');

    // Verify key constraints
    console.log('🔍 VERIFICATION: Checking for constraint violations...\n');

    // Check for same-day theory repeats
    const sameDay = await connection.query(`
      SELECT t1.branch_id, t1.semester, t1.day_of_week, t1.subject_id, t1.slot_type, 
             COUNT(*) as count, STRING_AGG(t1.time_slot_start::text, ', ') as times
      FROM timetable t1
      WHERE t1.slot_type = 'THEORY'
      GROUP BY t1.branch_id, t1.semester, t1.day_of_week, t1.subject_id
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    if (sameDay.rows.length > 0) {
      console.log('⚠️  WARNING: Found same-subject-same-day theory repeats:');
      sameDay.rows.forEach(row => {
        console.log(`   - Subject ${row.subject_id} on ${row.day_of_week}: ${row.count} times (${row.times})`);
      });
    } else {
      console.log('✅ No same-day theory repeats found');
    }

    // Check for theory-lab same day conflicts
    const sameSubjectDay = await connection.query(`
      WITH subject_days AS (
        SELECT branch_id, semester, subject_id, day_of_week, slot_type
        FROM timetable
        GROUP BY branch_id, semester, subject_id, day_of_week, slot_type
      )
      SELECT DISTINCT
        t.branch_id, t.semester, t.subject_id, t.day_of_week,
        COUNT(*) FILTER (WHERE slot_type = 'THEORY') as theory_count,
        COUNT(*) FILTER (WHERE slot_type = 'LAB') as lab_count
      FROM subject_days t
      WHERE EXISTS (
        SELECT 1 FROM subject_days t2 
        WHERE t2.branch_id = t.branch_id 
        AND t2.semester = t.semester 
        AND t2.subject_id = t.subject_id 
        AND t2.day_of_week = t.day_of_week
        AND t2.slot_type = 'THEORY'
      )
      AND EXISTS (
        SELECT 1 FROM subject_days t3
        WHERE t3.branch_id = t.branch_id 
        AND t3.semester = t.semester 
        AND t3.subject_id = t.subject_id 
        AND t3.day_of_week = t.day_of_week
        AND t3.slot_type = 'LAB'
      )
      GROUP BY t.branch_id, t.semester, t.subject_id, t.day_of_week
      LIMIT 10
    `);

    if (sameSubjectDay.rows.length > 0) {
      console.log('\n⚠️  WARNING: Found theory + lab on SAME DAY (should be prevented):');
      sameSubjectDay.rows.forEach(row => {
        console.log(`   - Subject ${row.subject_id} on ${row.day_of_week}: ${row.theory_count} theory, ${row.lab_count} lab`);
      });
    } else {
      console.log('✅ No theory-lab same-day conflicts found');
    }

    console.log('\n✅ REGENERATION SUCCESS!\n');

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    if (connection) connection.release();
    await pool.end();
    process.exit(0);
  }
}

regenerateFixed();
