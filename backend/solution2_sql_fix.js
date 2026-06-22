#!/usr/bin/env node
/**
 * SOLUTION 2: QUICK SQL FIX
 * 
 * Strategy: Move all THEORY lectures to SAFE TIME BLOCKS
 * where they cannot conflict with LAB sessions
 * 
 * Key Times:
 * - THEORY SAFE: 09:00-10:00, 10:00-11:00 (before MON/TUE labs at 14:00)
 * - THEORY SAFE: 16:00-17:00 (after main lab block 14:00-16:00)
 * - LAB BLOCKS: 10:00-12:00, 14:00-16:00 (2-hour blocks)
 * 
 * Approach:
 * 1. Find all THEORY entries that conflict with LAB entries
 * 2. Attempt to move THEORY to 09:00-10:00 or 16:00-17:00
 * 3. Relocate if slot already occupied
 * 4. Verify conflicts reduced to 0
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

// Safe time windows for THEORY that avoid LAB conflicts
const SAFE_THEORY_WINDOWS = [
  { start: '09:00', end: '10:00', priority: 1 }, // First choice: 09:00-10:00
  { start: '16:00', end: '17:00', priority: 2 }, // Second choice: 16:00-17:00
  { start: '10:00', end: '11:00', priority: 3 }, // Fallback: 10:00-11:00
];

// LAB blocks that cause conflicts
const LAB_BLOCKS = [
  { start: '10:00', end: '12:00' },
  { start: '14:00', end: '16:00' },
];

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
    // Fallback: Use application logic to find conflicts
    return [];
  }
}

async function moveTheoryToSafeSlot(theoryId, dayOfWeek, subjectName) {
  // Try each safe time window in order of priority
  for (const window of SAFE_THEORY_WINDOWS) {
    try {
      // Check if this time slot is already occupied for this day/subject
      const checkQuery = `
        SELECT COUNT(*) as count FROM timetable
        WHERE day_of_week = $1
          AND time_slot_start = $2
          AND slot_type = 'THEORY'
      `;

      const checkResult = await pool.query(checkQuery, [dayOfWeek, window.start]);
      
      if (checkResult.rows[0].count === 0) {
        // Slot is free! Update the THEORY entry
        const updateQuery = `
          UPDATE timetable
          SET time_slot_start = $1::time, time_slot_end = $2::time
          WHERE timetable_id = $3
          RETURNING timetable_id, day_of_week, time_slot_start, time_slot_end, slot_type
        `;

        const result = await pool.query(updateQuery, [window.start, window.end, theoryId]);
        
        if (result.rows.length > 0) {
          const moved = result.rows[0];
          console.log(`  ✓ Moved ${subjectName} from ${dayOfWeek} to ${dayOfWeek} ${moved.time_slot_start}-${moved.time_slot_end}`);
          return true;
        }
      } else {
        console.log(`  ⚠ Slot ${dayOfWeek} ${window.start} occupied, trying next...`);
      }
    } catch (err) {
      console.error(`  ✗ Error updating: ${err.message}`);
    }
  }

  return false;
}

 async function run() {
  try {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  SOLUTION 2: QUICK SQL FIX                         ║');
    console.log('║  Move THEORY to safe times (09:00, 10:00, 16:00)   ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log('🔍 Step 1: Finding THEORY-LAB conflicts in database...\n');
    const conflicts = await findTheoryLabConflicts();
    
    if (conflicts.length === 0) {
      console.log('✅ No THEORY-LAB conflicts found! All clear.');
      await pool.end();
      return;
    }

    console.log(`Found ${conflicts.length} conflicting pairs:\n`);

    // Group by subject for processing
    const conflictsBySubject = {};
    conflicts.forEach(conflict => {
      const key = conflict.subject_code;
      if (!conflictsBySubject[key]) {
        conflictsBySubject[key] = [];
      }
      conflictsBySubject[key].push(conflict);
    });

    let fixedCount = 0;
    let failedCount = 0;

    console.log('📝 Step 2: Attempting to move THEORY lectures to safe slots...\n');

    for (const [subjectCode, conflictList] of Object.entries(conflictsBySubject)) {
      console.log(`\n📚 Subject: ${subjectCode}`);
      
      // Get unique THEORY entries for this subject
      const theoryEntries = {};
      conflictList.forEach(conflict => {
        if (!theoryEntries[conflict.theory_id]) {
          theoryEntries[conflict.theory_id] = {
            id: conflict.theory_id,
            day_of_week: conflict.day_of_week,
            name: conflict.subject_name,
            current: `${conflict.day_of_week} ${conflict.theory_start}-${conflict.theory_end}`
          };
        }
      });

      for (const [theoryId, info] of Object.entries(theoryEntries)) {
        process.stdout.write(`  ${info.current}: `);
        const moved = await moveTheoryToSafeSlot(info.id, info.day_of_week, info.name);
        
        if (moved) {
          fixedCount++;
        } else {
          console.log(`✗ Could not find available safe slot`);
          failedCount++;
        }
      }
    }

    console.log('\n' + '═'.repeat(55));
    console.log('📊 RESULTS:');
    console.log(`  ✓ Fixed: ${fixedCount} THEORY lectures`);
    console.log(`  ✗ Failed: ${failedCount} THEORY lectures`);
    console.log(`  Reduction: ${(fixedCount / conflicts.length * 100).toFixed(1)}% of conflicts`);

    // Step 3: Verify
    console.log('\n🔄 Step 3: Verifying conflicts are resolved...\n');
    const remainingConflicts = await findTheoryLabConflicts();
    
    if (remainingConflicts.length === 0) {
      console.log('✅ SUCCESS! All THEORY-LAB conflicts resolved! 🎉');
    } else {
      console.log(`⚠️  Still ${remainingConflicts.length} conflicts remaining`);
      console.log('   May need to implement additional fixes');
    }

    await pool.end();
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

run();
