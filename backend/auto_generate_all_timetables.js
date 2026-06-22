/**
 * AUTO-GENERATE ALL TIMETABLES
 * 
 * This script automatically regenerates timetables for ALL branches and semesters
 * with the new advanced algorithm:
 * - ProfessorAvailabilityMatrix (global conflict prevention)
 * - ConflictRepairEngine (automatic conflict resolution)
 * - UltimateTimetableValidator (7-point validation)
 * 
 * Usage:
 *   node auto_generate_all_timetables.js              (all branches, all semesters)
 *   node auto_generate_all_timetables.js branch=CE    (specific branch)
 *   node auto_generate_all_timetables.js sem=4        (specific semester)
 */

const pool = require('./src/config/db');
const TimetableAlgorithm = require('./src/algorithms/TimetableAlgorithm');

// Parse command line arguments
const args = process.argv.slice(2);
const filters = {};

args.forEach(arg => {
  const [key, value] = arg.split('=');
  if (key && value) {
    filters[key] = value;
  }
});

/**
 * Get all branches from database
 */
async function getAllBranches() {
  try {
    const query = 'SELECT branch_id, name FROM branches ORDER BY name';
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error fetching branches:', error);
    return [];
  }
}

/**
 * Get all semesters from database
 */
async function getAllSemesters() {
  try {
    const query = 'SELECT DISTINCT semester FROM subjects ORDER BY semester';
    const result = await pool.query(query);
    return result.rows.map(row => row.semester);
  } catch (error) {
    console.error('Error fetching semesters:', error);
    return [1, 2, 3, 4, 5, 6, 7, 8];
  }
}

/**
 * Generate timetable for a branch-semester combination
 */
async function generateTimetable(branchId, branchName, semester) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`[Generation] Starting: ${branchName} - Semester ${semester}`);
  console.log(`${'='.repeat(70)}`);

  try {
    const algorithm = new TimetableAlgorithm(branchId, semester);
    const result = await algorithm.generate();

    if (result.success) {
      console.log(`\n✅ SUCCESS: ${branchName} Sem ${semester}`);
      console.log(`   Generated ${result.timetable.length} slots`);
      return {
        status: 'SUCCESS',
        branch: branchName,
        semester,
        slotsGenerated: result.timetable.length
      };
    } else {
      console.error(`\n❌ FAILED: ${branchName} Sem ${semester}`);
      console.error(`   Reason: ${result.error}`);
      return {
        status: 'FAILED',
        branch: branchName,
        semester,
        error: result.error
      };
    }
  } catch (error) {
    console.error(`\n❌ ERROR: ${branchName} Sem ${semester}`);
    console.error(`   ${error.message}`);
    return {
      status: 'ERROR',
      branch: branchName,
      semester,
      error: error.message
    };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║    🚀 AUTOMATIC TIMETABLE GENERATION WITH ADVANCED ALGORITHM       ║
║                                                                    ║
║  Features:                                                         ║
║  ✅ Lab-First Scheduling (hard constraints prioritized)            ║
║  ✅ Professor Availability Matrix (O(1) conflict detection)        ║
║  ✅ Smart Conflict Repair Engine (auto-resolve 80% conflicts)      ║
║  ✅ 7-Point Ultimate Validation                                    ║
║  ✅ Cross-Branch Conflict Prevention                               ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
  `);

  // Get all branches and semesters
  console.log('\n[Setup] Loading data from database...');
  const branches = await getAllBranches();
  const allSemesters = await getAllSemesters();

  if (branches.length === 0) {
    console.error('❌ No branches found in database');
    process.exit(1);
  }

  console.log(`[Setup] Found ${branches.length} branches`);
  console.log(`[Setup] Found ${allSemesters.length} semesters: ${allSemesters.join(', ')}`);

  // Filter branches if specified
  let targetBranches = branches;
  if (filters.branch) {
    targetBranches = branches.filter(b => b.name.toUpperCase().includes(filters.branch.toUpperCase()));
    console.log(`[Filter] Branches: ${filters.branch} → ${targetBranches.map(b => b.name).join(', ')}`);
  }

  // Filter semesters if specified
  let targetSemesters = allSemesters;
  if (filters.sem) {
    const semNum = parseInt(filters.sem);
    targetSemesters = allSemesters.filter(s => s === semNum);
    console.log(`[Filter] Semesters: ${filters.sem} → ${targetSemesters.join(', ')}`);
  }

  const totalCombinations = targetBranches.length * targetSemesters.length;
  console.log(`\n[Plan] Will generate ${totalCombinations} timetables`);
  console.log(`   Branches: ${targetBranches.map(b => b.name).join(', ')}`);
  console.log(`   Semesters: ${targetSemesters.join(', ')}`);

  // Generate all timetables
  const results = [];
  let successCount = 0;
  let failureCount = 0;
  let errorCount = 0;

  for (const branch of targetBranches) {
    for (const semester of targetSemesters) {
      const result = await generateTimetable(branch.branch_id, branch.name, semester);
      results.push(result);

      if (result.status === 'SUCCESS') successCount++;
      else if (result.status === 'FAILED') failureCount++;
      else if (result.status === 'ERROR') errorCount++;
    }
  }

  // Print summary
  console.log(`\n\n${'='.repeat(70)}`);
  console.log('📊 GENERATION SUMMARY');
  console.log(`${'='.repeat(70)}`);

  console.log(`\nTotal Generated: ${successCount + failureCount + errorCount}/${totalCombinations}`);
  console.log(`  ✅ Success: ${successCount}`);
  console.log(`  ❌ Failed: ${failureCount}`);
  console.log(`  ⚠️  Error: ${errorCount}`);

  // Detailed results
  console.log(`\n📋 DETAILED RESULTS:`);
  console.log(`${'─'.repeat(70)}`);

  results.forEach((result, index) => {
    const status = result.status === 'SUCCESS' ? '✅' : result.status === 'FAILED' ? '❌' : '⚠️';
    const details = result.slotsGenerated ? `(${result.slotsGenerated} slots)` : `(${result.error})`;
    console.log(`${status} ${result.branch} Sem ${result.semester}: ${result.status} ${details}`);
  });

  console.log(`${'─'.repeat(70)}`);

  // Success rate
  const successRate = totalCombinations > 0 ? Math.round(successCount / totalCombinations * 100) : 0;
  console.log(`\n📈 Success Rate: ${successRate}% (${successCount}/${totalCombinations})`);

  // Overall status
  if (successCount === totalCombinations) {
    console.log(`\n🎉 ALL TIMETABLES GENERATED SUCCESSFULLY!`);
  } else if (successCount > 0) {
    console.log(`\n⚙️  PARTIAL SUCCESS - ${totalCombinations - successCount} timetable(s) need attention`);
  } else {
    console.log(`\n🔴 GENERATION FAILED - No timetables generated`);
  }

  console.log(`\n${'='.repeat(70)}\n`);

  process.exit(successCount === totalCombinations ? 0 : 1);
}

// Run main function
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
