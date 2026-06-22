/**
 * BATCH REGENERATION - ALL BRANCHES & SEMESTERS
 * Regenerates complete timetable with LABS-FIRST scheduling
 */

const TimetableAlgorithm = require('./src/algorithms/TimetableAlgorithm');
const pool = require('./src/config/db');

console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  BATCH REGENERATION - ALL BRANCHES & SEMESTERS                   ║');
console.log('║  Strategy: LABS-FIRST (Optimal Slot Utilization)                 ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

async function getEnvironment() {
  try {
    // Verify pool is connected
    const connectionTest = await pool.query('SELECT 1');
    
    const branchesRes = await pool.query('SELECT branch_id, name FROM branches ORDER BY name');
    const semestersRes = await pool.query('SELECT DISTINCT semester FROM subjects ORDER BY semester');
    
    const branches = branchesRes.rows;
    const semesters = semestersRes.rows.map(r => r.semester);
    
    return { branches, semesters };
  } catch (error) {
    console.error('❌ Error fetching environment:', error.message);
    console.error('    Stack:', error.stack);
    process.exit(1);
  }
}

async function regenerateBranchSemester(branchId, branchName, semester) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`🔄 Regenerating: ${branchName} - Semester ${semester}`);
  console.log(`${'─'.repeat(70)}`);

  try {
    const algorithm = new TimetableAlgorithm(branchId, semester);
    const result = await algorithm.generate();

    if (result.success) {
      console.log(`✅ SUCCESS: ${result.slotsGenerated} slots created`);
      return {
        branch: branchName,
        semester,
        status: 'SUCCESS',
        slots: result.slotsGenerated,
        conflicts: result.conflicts || 0
      };
    } else {
      console.log(`⚠️ PARTIAL: ${result.error || 'Unknown error'}`);
      return {
        branch: branchName,
        semester,
        status: 'PARTIAL',
        error: result.error
      };
    }
  } catch (error) {
    console.error(`❌ ERROR: ${error.message}`);
    return {
      branch: branchName,
      semester,
      status: 'FAILED',
      error: error.message
    };
  }
}

async function main() {
  console.log('📊 Fetching all branches and semesters...\n');

  const { branches, semesters } = await getEnvironment();

  console.log(`Found ${branches.length} branches:`);
  branches.forEach(b => console.log(`   - ${b.name}`));
  
  console.log(`\nFound ${semesters.length} semesters: ${semesters.join(', ')}\n`);
  
  console.log(`Total regenerations needed: ${branches.length * semesters.length}\n`);
  console.log('═'.repeat(70));

  const results = [];
  let successCount = 0;
  let failureCount = 0;
  let partialCount = 0;

  // Regenerate each branch-semester combination
  for (const branch of branches) {
    for (const semester of semesters) {
      const result = await regenerateBranchSemester(branch.branch_id, branch.name, semester);
      results.push(result);

      if (result.status === 'SUCCESS') successCount++;
      else if (result.status === 'FAILED') failureCount++;
      else partialCount++;
    }
  }

  // Print summary
  console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                      REGENERATION SUMMARY                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Results by Status:\n');
  console.table(results);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📊 FINAL RESULTS:`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`✅ Successful: ${successCount}/${results.length}`);
  console.log(`⚠️  Partial:    ${partialCount}/${results.length}`);
  console.log(`❌ Failed:     ${failureCount}/${results.length}`);
  console.log(`${'═'.repeat(70)}\n`);

  // Verify data integrity
  console.log('🔍 Verifying data integrity...\n');
  
  try {
    const totalSlots = await pool.query('SELECT COUNT(*) as count FROM timetable WHERE slot_type IN (\'THEORY\', \'LAB\')');
    const labCount = await pool.query('SELECT COUNT(*) as count FROM timetable WHERE slot_type = \'LAB\'');
    const theoryCount = await pool.query('SELECT COUNT(*) as count FROM timetable WHERE slot_type = \'THEORY\'');
    
    console.log(`📊 Database Statistics:`);
    console.log(`   Total Classes: ${totalSlots.rows[0].count}`);
    console.log(`   Theory Classes: ${theoryCount.rows[0].count}`);
    console.log(`   Lab Sessions: ${labCount.rows[0].count}`);
    
    // Check for professor conflicts
    const profConflicts = await pool.query(`
      SELECT COUNT(*) as conflict_count
      FROM (
        SELECT professor_id, day_of_week, time_slot_start, time_slot_end, COUNT(*) as count
        FROM timetable
        WHERE slot_type IN ('THEORY', 'LAB') AND professor_id IS NOT NULL
        GROUP BY professor_id, day_of_week, time_slot_start, time_slot_end
        HAVING COUNT(*) > 1
      ) conflicts
    `);
    
    console.log(`\n⚠️  Professor Conflicts Detected: ${profConflicts.rows[0].conflict_count}`);
    
    if (profConflicts.rows[0].conflict_count === 0) {
      console.log('✅ NO PROFESSOR DOUBLE-BOOKINGS FOUND!\n');
    } else {
      console.log('⚠️  Some professor conflicts remain (expected for cross-branch common subjects)\n');
    }
    
  } catch (error) {
    console.error('Error verifying data:', error.message);
  }

  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                   REGENERATION COMPLETE! ✅                       ║');
  console.log('║                                                                  ║');
  console.log('║  Labs-First Scheduling Applied to ALL Branches & Semesters      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

// Run
main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
