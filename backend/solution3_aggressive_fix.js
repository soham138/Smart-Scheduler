#!/usr/bin/env node
/**
 * SOLUTION 3: AGGRESSIVE FIX - DELETE CONFLICTING LAB ENTRIES
 * 
 * When THEORY lectures cannot be moved (no safe slots available),
 * the only option is to delete the conflicting LAB entries
 * 
 * Rationale:
 * - THEORY lectures are MANDATORY for all students
 * - LABs are OPTIONAL or can be rescheduled later
 * - Better to keep mandatory lectures than optional labs
 * 
 * This approach:
 * 1. Finds all THEORY-LAB conflicts
 * 2. Deletes the LAB entries that cause conflicts
 * 3. Allows students to attend all mandatory theory lectures
 * 4. Preserves academic integrity
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

async function findTheoryLabConflicts() {
  const query = `
    SELECT DISTINCT
      t1.timetable_id as theory_id,
      t1.subject_id,
      t1.day_of_week,
      t1.time_slot_start as theory_start,
      t1.time_slot_end as theory_end,
      s.code as subject_code,
      s.name as subject_name,
      t2.timetable_id as lab_id,
      t2.batch_id,
      t2.time_slot_start as lab_start,
      t2.time_slot_end as lab_end
    FROM timetable t1
    JOIN subjects s ON t1.subject_id = s.subject_id
    JOIN timetable t2 ON t2.subject_id = t1.subject_id
    WHERE t1.slot_type = 'THEORY'
      AND t1.batch_id IS NULL
      AND t2.slot_type = 'LAB'
      AND t2.batch_id IS NOT NULL
      AND t1.day_of_week = t2.day_of_week
      AND (t1.time_slot_start, t1.time_slot_end) OVERLAPS (t2.time_slot_start, t2.time_slot_end)
    ORDER BY s.name, t1.day_of_week, t1.time_slot_start
  `;

  try {
    const result = await pool.query(query);
    return result.rows;
  } catch (err) {
    console.error('Query error:', err.message);
    return [];
  }
}

async function deleteConflictingLabs(conflicts) {
  let deletedCount = 0;
  const labIdsToDelete = new Set();

  // Collect all LAB IDs that cause conflicts
  for (const conflict of conflicts) {
    labIdsToDelete.add(conflict.lab_id);
  }

  console.log(`\n🗑️  Deleting ${labIdsToDelete.size} conflicting LAB entries...\n`);

  for (const labId of labIdsToDelete) {
    try {
      const getLabQuery = `
        SELECT subject_id, batch_id, day_of_week, time_slot_start, time_slot_end
        FROM timetable
        WHERE timetable_id = $1
      `;

      const labInfo = await pool.query(getLabQuery, [labId]);

      if (labInfo.rows.length > 0) {
        const lab = labInfo.rows[0];
        
        // Find conflicting theory
        const theoryQuery = `
          SELECT t.subject_id, s.code, s.name
          FROM timetable t
          JOIN subjects s ON t.subject_id = s.subject_id
          WHERE t.subject_id = $1
            AND t.slot_type = 'THEORY'
            AND t.batch_id IS NULL
            AND t.day_of_week = $2
            AND t.time_slot_start < $4
            AND t.time_slot_end > $3
          LIMIT 1
        `;

        const theory = await pool.query(theoryQuery, [
          lab.subject_id,
          lab.day_of_week,
          lab.time_slot_start,
          lab.time_slot_end
        ]);

        // Delete the LAB
        const deleteQuery = `DELETE FROM timetable WHERE timetable_id = $1`;
        await pool.query(deleteQuery, [labId]);

        const theoryName = theory.rows.length > 0 ? theory.rows[0].code : 'Unknown';
        const batchName = lab.batch_id ? `Batch ${lab.batch_id}` : 'Unknown';

        console.log(`  ✓ Deleted LAB (${batchName}): Conflicted with THEORY ${theoryName} on ${lab.day_of_week} ${lab.time_slot_start.slice(0, 5)}`);
        deletedCount++;
      }
    } catch (err) {
      console.error(`  ✗ Error deleting LAB ${labId}: ${err.message}`);
    }
  }

  return deletedCount;
}

async function run() {
  try {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  SOLUTION 3: AGGRESSIVE FIX                        ║');
    console.log('║  Delete conflicting LABs (prioritize THEORY)       ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log('⚠️  WARNING: This solution will DELETE LAB entries');
    console.log('   Rationale: THEORY lectures are mandatory, LABs are optional\n');

    console.log('🔍 Step 1: Finding THEORY-LAB conflicts in database...\n');
    const conflicts = await findTheoryLabConflicts();
    
    if (conflicts.length === 0) {
      console.log('✅ No THEORY-LAB conflicts found!');
      await pool.end();
      return;
    }

    console.log(`Found ${conflicts.length} conflicting pairs:\n`);

    // Group by subject for display
    const conflictsBySubject = {};
    conflicts.forEach(conflict => {
      const key = conflict.subject_code;
      if (!conflictsBySubject[key]) {
        conflictsBySubject[key] = [];
      }
      conflictsBySubject[key].push(conflict);
    });

    for (const [subjectCode, pairs] of Object.entries(conflictsBySubject)) {
      console.log(`  📚 ${subjectCode}: ${pairs.length} conflict(s)`);
    }

    // Step 2: Delete conflicting LABs
    console.log('\n' + '═'.repeat(55));
    console.log('📝 Step 2: Removing conflicting LABs\n');
    
    const deletedCount = await deleteConflictingLabs(conflicts);

    console.log('\n' + '═'.repeat(55));
    console.log('📊 RESULTS:');
    console.log(`  ✓ Deleted: ${deletedCount} LAB entries`);
    console.log(`  ✓ Preserved: All ${conflicts.length} THEORY lectures`);

    // Step 3: Verify
    console.log('\n🔄 Step 3: Verifying conflicts are resolved...\n');
    const remainingConflicts = await findTheoryLabConflicts();
    
    if (remainingConflicts.length === 0) {
      console.log('✅ SUCCESS! All THEORY-LAB conflicts eliminated! 🎉');
      console.log('\n📌 Note: Some LAB sessions were deleted to preserve mandatory THEORY lectures.');
      console.log('   Students can attend all required theory lectures without conflict.');
    } else {
      console.log(`⚠️  Still ${remainingConflicts.length} conflicts remaining`);
      console.log('   Additional manual intervention may be needed');
    }

    await pool.end();
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

run();
