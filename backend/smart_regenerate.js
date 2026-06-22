/**
 * SMART REGENERATION - Theory/Lab Slot Preference
 * 
 * Strategy:
 * - Labs: MON-THU morning blocks (09:00-11:00)
 * - Theory: MON-FRI afternoon blocks (14:00-16:00) + some morning gaps
 * - This naturally separates theory and labs, reducing conflicts
 */

const pool = require('./src/config/db');
const TimetableAlgorithm = require('./src/algorithms/TimetableAlgorithm');

async function smartRegenerate() {
  try {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  SMART REGENERATION - Lab/Theory Slot Preference               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // Step 1: Clear existing timetables
    console.log('🧹 Clearing existing timetable data...\n');
    await pool.query('DELETE FROM timetable WHERE branch_id IS NOT NULL');

    // Step 2: Get branches and semesters
    const branchesRes = await pool.query('SELECT branch_id, name FROM branches ORDER BY name');
    const semestersRes = await pool.query('SELECT DISTINCT semester FROM subjects ORDER BY semester');
    
    console.log(`Found: ${branchesRes.rows.length} branches, ${semestersRes.rows.length} semesters`);
    console.log(`Total: ${branchesRes.rows.length * semestersRes.rows.length} combinations\n`);

    // Step 3: Regenerate with conflict tracking
    let successCount = 0;
    let partialCount = 0;
    let failCount = 0;
    const results = [];

    for (const branch of branchesRes.rows) {
      for (const semRow of semestersRes.rows) {
        const sem = semRow.semester;
        console.log(`🔄 ${branch.name} - Semester ${sem}`);
        
        const algorithm = new TimetableAlgorithm(branch.branch_id, sem);
        const result = await algorithm.generate();
        
        if (result.success === false) {
          console.log(`  ❌ FAILED: ${result.error}`);
          failCount++;
        } else {
          // Check for conflicts
          const conflictRes = await pool.query(`
            SELECT COUNT(*) as conflict_pairs
            FROM timetable t1
            JOIN timetable t2 ON t1.professor_id = t2.professor_id 
              AND t1.day_of_week = t2.day_of_week
              AND t1.branch_id = t2.branch_id
              AND t1.semester = t2.semester
              AND t1.timetable_id < t2.timetable_id
            WHERE t1.branch_id = $1 AND t1.semester = $2
              AND (t1.time_slot_start::time, t1.time_slot_end::time) 
                OVERLAPS (t2.time_slot_start::time, t2.time_slot_end::time)
          `, [branch.branch_id, sem]);

          const conflicts = conflictRes.rows[0].conflict_pairs;
          
          if (conflicts > 0) {
            console.log(`  ⚠️  PARTIAL: ${conflicts} professor conflicts`);
            partialCount++;
          } else {
            console.log(`  ✅ SUCCESS: No conflicts`);
            successCount++;
          }
          
          results.push({
            branch: branch.name,
            semester: sem,
            status: conflicts > 0 ? 'PARTIAL' : 'SUCCESS',
            conflicts: conflicts
          });
        }
      }
    }

    // Summary
    console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║              REGENERATION RESULTS                              ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);
    
    console.log(`✅ SUCCESS:  ${successCount}/${successCount + partialCount}`);
    console.log(`⚠️  PARTIAL: ${partialCount}/${successCount + partialCount}`);
    console.log(`❌ FAILED:   ${failCount}\n`);

    // Check final database state
    const finalRes = await pool.query(`
      SELECT 
        COUNT(*) as total_classes,
        SUM(CASE WHEN slot_type = 'THEORY' THEN 1 ELSE 0 END) as theories,
        SUM(CASE WHEN slot_type = 'LAB' THEN 1 ELSE 0 END) as labs,
        COUNT(DISTINCT professor_id) as professors
      FROM timetable
      WHERE slot_type IN ('THEORY', 'LAB')
    `);

    const stats = finalRes.rows[0];
    console.log(`📊 FINAL STATS:`);
    console.log(`   Total: ${stats.total_classes}`);
    console.log(`   Theory: ${stats.theories}`);
    console.log(`   Labs: ${stats.labs}`);
    console.log(`   Professors: ${stats.professors}\n`);

    if (partialCount === 0 && failCount === 0) {
      console.log('🎉 REGENERATION COMPLETE - ALL SUCCESSFUL!\n');
    } else  {
      console.log('⚠️  Some combinations had issues. See details above.\n');
      console.log('Results:');
      console.table(results);
    }

    pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

smartRegenerate();
