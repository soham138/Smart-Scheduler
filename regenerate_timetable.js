/**
 * Timetable Regeneration & Verification Script
 * This script will:
 * 1. Clear old (broken) timetables
 * 2. Regenerate timetable with the fixed algorithm
 * 3. Verify both Batch A and B are scheduled
 * 4. Check all constraints are satisfied
 */

const pool = require('./backend/src/config/db');
const TimetableAlgorithm = require('./backend/src/algorithms/TimetableAlgorithm');

async function regenerateTimetable() {
  let connection;
  try {
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('TIMETABLE REGENERATION WITH BATCH-AWARE ALGORITHM');
    console.log('════════════════════════════════════════════════════════════════\n');

    connection = await pool.connect();

    // Step 1: Get branch and semester info
    console.log('Step 1: Fetching branch and semester information...');
    const branchResult = await connection.query(`
      SELECT DISTINCT b.branch_id, b.branch_name 
      FROM branches b
      LIMIT 1
    `);

    if (branchResult.rows.length === 0) {
      console.error('❌ No branches found in database');
      return;
    }

    const branchId = branchResult.rows[0].branch_id;
    const branchName = branchResult.rows[0].branch_name;
    console.log(`✓ Found branch: ${branchName} (${branchId})`);

    // Get semester (you can modify this to test multiple semesters)
    const semester = 6; // Change as needed
    console.log(`✓ Using semester: ${semester}\n`);

    // Step 2: Clear old timetables for this branch-semester
    console.log('Step 2: Clearing old timetables...');
    const deleteResult = await connection.query(
      'DELETE FROM timetables WHERE branch_id = $1 AND semester = $2',
      [branchId, semester]
    );
    console.log(`✓ Deleted ${deleteResult.rowCount} old timetable entries\n`);

    // Step 3: Run the fixed algorithm
    console.log('Step 3: Generating new timetable with BATCH-AWARE algorithm...');
    console.log('(This will schedule Batch A and B separately at different times)\n');

    const algorithm = new TimetableAlgorithm(branchId, semester);
    const result = await algorithm.generate();

    if (!result.success) {
      console.error('❌ Timetable generation failed:', result.error);
      console.error('Details:', result.details);
      return;
    }

    console.log(`✓ Timetable generated successfully\n`);

    // Step 4: Verify the results
    console.log('Step 4: Verifying batch allocation in database...\n');

    // Check total entries
    const totalResult = await connection.query(`
      SELECT COUNT(*) as total FROM timetables 
      WHERE branch_id = $1 AND semester = $2
    `, [branchId, semester]);

    const totalEntries = totalResult.rows[0].total;
    console.log(`Total timetable entries: ${totalEntries}`);

    // Check theory entries
    const theoryResult = await connection.query(`
      SELECT COUNT(*) as theory FROM timetables 
      WHERE branch_id = $1 AND semester = $2 AND slot_type = 'THEORY'
    `, [branchId, semester]);

    console.log(`Theory lectures: ${theoryResult.rows[0].theory}`);

    // Check lab entries
    const labResult = await connection.query(`
      SELECT COUNT(*) as labs FROM timetables 
      WHERE branch_id = $1 AND semester = $2 AND slot_type = 'LAB'
    `, [branchId, semester]);

    const totalLabs = labResult.rows[0].labs;
    console.log(`Total lab entries: ${totalLabs}\n`);

    // ✅ CRITICAL: Check Batch A and B coverage
    console.log('════════════════════════════════════════════════════════════════');
    console.log('BATCH ASSIGNMENT VERIFICATION');
    console.log('════════════════════════════════════════════════════════════════\n');

    const batchResult = await connection.query(`
      SELECT 
        b.batch_number,
        COUNT(*) as lab_count,
        COUNT(DISTINCT s.subject_id) as unique_subjects
      FROM timetables t
      LEFT JOIN batches b ON t.batch_id = b.batch_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.branch_id = $1 AND t.semester = $2 AND t.slot_type = 'LAB'
      GROUP BY b.batch_number
      ORDER BY b.batch_number
    `, [branchId, semester]);

    if (batchResult.rows.length === 0) {
      console.error('❌ ERROR: No batches found for labs!');
      console.error('This means labs were not assigned to any batch.');
      return;
    }

    let batchAFound = false;
    let batchBFound = false;

    for (const row of batchResult.rows) {
      const batchNum = row.batch_number;
      const labCount = row.lab_count;
      const subjects = row.unique_subjects;
      const batchLabel = batchNum === 1 ? 'Batch A' : `Batch ${batchNum}`;

      console.log(`${batchLabel}:`);
      console.log(`  Lab sessions: ${labCount}`);
      console.log(`  Subjects: ${subjects}`);

      if (batchNum === 1) batchAFound = true;
      if (batchNum === 2) batchBFound = true;
    }

    console.log('');

    // ✅ VERIFICATION
    if (batchAFound && batchBFound) {
      console.log('✅ SUCCESS: Both Batch A and Batch B are scheduled!');
    } else if (batchAFound) {
      console.log('⚠️  WARNING: Batch A found but Batch B missing!');
    } else if (batchBFound) {
      console.log('❌ ERROR: Only Batch B found - Batch A is MISSING!');
      console.log('\nThis means the algorithm fix is not working correctly.');
    } else {
      console.log('❌ ERROR: Neither batch found!');
    }

    // Step 5: Show detailed lab schedule by time
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('DETAILED LAB SCHEDULE');
    console.log('════════════════════════════════════════════════════════════════\n');

    const scheduleResult = await connection.query(`
      SELECT 
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end,
        s.name as subject_name,
        b.batch_number,
        p.name as professor_name,
        COUNT(*) as count
      FROM timetables t
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN batches b ON t.batch_id = b.batch_id
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      WHERE t.branch_id = $1 AND t.semester = $2 AND t.slot_type = 'LAB'
      GROUP BY 
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end,
        s.name,
        b.batch_number,
        p.name
      ORDER BY 
        t.day_of_week,
        t.time_slot_start,
        s.name,
        b.batch_number
    `, [branchId, semester]);

    const dayOrder = { 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5 };
    const sortedSchedule = scheduleResult.rows.sort((a, b) => {
      const dayDiff = dayOrder[a.day_of_week] - dayOrder[b.day_of_week];
      if (dayDiff !== 0) return dayDiff;
      return a.time_slot_start.localeCompare(b.time_slot_start);
    });

    let currentDay = null;
    let currentTime = null;

    for (const slot of sortedSchedule) {
      const dayTime = `${slot.day_of_week} ${slot.time_slot_start}`;
      
      if (dayTime !== currentDay) {
        if (currentDay !== null) console.log('');
        currentDay = dayTime;
        console.log(`${dayTime}:`);
      }

      const batchLabel = slot.batch_number === 1 ? 'Batch A' : slot.batch_number === 2 ? 'Batch B' : `Batch ${slot.batch_number}`;
      console.log(`  • ${(slot.subject_name || 'Unknown').padEnd(20)} | ${batchLabel.padEnd(8)} | Prof: ${slot.professor_name || 'N/A'}`);
    }

    // Step 6: Check for duplicates
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('DUPLICATE CHECK');
    console.log('════════════════════════════════════════════════════════════════\n');

    const duplicateResult = await connection.query(`
      SELECT 
        day_of_week,
        time_slot_start,
        subject_id,
        batch_id,
        COUNT(*) as count
      FROM timetables
      WHERE branch_id = $1 AND semester = $2 AND slot_type = 'LAB'
      GROUP BY day_of_week, time_slot_start, subject_id, batch_id
      HAVING COUNT(*) > 1
    `, [branchId, semester]);

    if (duplicateResult.rows.length === 0) {
      console.log('✅ No duplicate lab entries found');
    } else {
      console.log('❌ Found duplicate lab entries:');
      for (const dup of duplicateResult.rows) {
        console.log(`  • ${dup.day_of_week} ${dup.time_slot_start} | Subject: ${dup.subject_id} | Batch: ${dup.batch_id} | Count: ${dup.count}`);
      }
    }

    // Final summary
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('REGENERATION COMPLETE');
    console.log('════════════════════════════════════════════════════════════════\n');

    console.log('SUMMARY:');
    console.log(`  Total entries:    ${totalEntries}`);
    console.log(`  Theory lectures:  ${theoryResult.rows[0].theory}`);
    console.log(`  Lab sessions:     ${totalLabs}`);
    console.log(`  Batch A labs:     ${batchAFound ? '✅ Present' : '❌ Missing'}`);
    console.log(`  Batch B labs:     ${batchBFound ? '✅ Present' : '❌ Missing'}`);
    console.log(`  Duplicates:       ${duplicateResult.rows.length === 0 ? '✅ None' : `❌ ${duplicateResult.rows.length} found`}`);

    if (batchAFound && batchBFound && duplicateResult.rows.length === 0) {
      console.log('\n✅✅✅ TIMETABLE REGENERATION SUCCESSFUL ✅✅✅\n');
      console.log('The batch scheduling fix is working correctly!');
    } else {
      console.log('\n⚠️  ISSUES DETECTED - Review above\n');
    }

  } catch (error) {
    console.error('Error during regeneration:', error.message);
    console.error(error.stack);
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

// Run the regeneration
regenerateTimetable();
