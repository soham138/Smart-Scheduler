/**
 * CLEAN REGENERATION WITH ALL CONSTRAINTS
 * - Clear existing timetables  
 * - Validate professor loads (max 5 per semester)
 * - Regenerate with LABS-FIRST strategy
 * - Validate output before commit
 */

const pool = require('./src/config/db');
const TimetableAlgorithm = require('./src/algorithms/TimetableAlgorithm');

async function cleanRegenerate() {
  try {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  CLEAN REGENERATION - ALL CONSTRAINTS ENFORCED                 ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // Step 1: Validate professor loads
    console.log('📋 STEP 1: Validating professor subject loads per semester...\n');
    
    const profLoadRes = await pool.query(`
      SELECT 
        p.professor_id,
        p.name,
        s.semester,
        COUNT(DISTINCT ps.subject_id) as subject_count
      FROM professors p
      INNER JOIN professors_subjects ps ON p.professor_id = ps.professor_id
      INNER JOIN subjects s ON ps.subject_id = s.subject_id
      GROUP BY p.professor_id, p.name, s.semester
      HAVING COUNT(DISTINCT ps.subject_id) > 5
      ORDER BY s.semester, subject_count DESC
    `);

    if (profLoadRes.rows.length > 0) {
      console.log('⚠️  PROFESSORS EXCEEDING MAX 5 SUBJECTS PER SEMESTER:\n');
      const groupedBySem = {};
      profLoadRes.rows.forEach(row => {
        if (!groupedBySem[row.semester]) groupedBySem[row.semester] = [];
        groupedBySem[row.semester].push(row);
      });
      
      Object.entries(groupedBySem).forEach(([sem, profs]) => {
        console.log(`  Semester ${sem}:`);
        profs.forEach(p => {
          console.log(`    ❌ ${p.name}: ${p.subject_count} subjects (MAX 5)`);
        });
      });
      
      console.log('\n⚠️  ACTION: Need to reassign subjects or unassign professors');
      console.log('   This violates the max 5 subjects per professor constraint.');
      console.log('   Regeneration cannot proceed with invalid professor assignments.\n');
      
      // Don't clear yet - let user decide
      process.exit(1);
    } else {
      console.log('✅ All professors have 5 or fewer subjects per semester\n');
    }

    // Step 2: Clear existing timetables
    console.log('🧹 STEP 2: Clearing existing timetable data...\n');
    await pool.query('DELETE FROM timetable WHERE branch_id IS NOT NULL');
    const clearResult = await pool.query('SELECT COUNT(*) as count FROM timetable');
    console.log(`✅ Timetable cleared. Remaining entries: ${clearResult.rows[0].count}\n`);

    // Step 3: Get branches and semesters
    console.log('📦 STEP 3: Fetching branches and semesters...\n');
    
    const branchesRes = await pool.query('SELECT branch_id, name FROM branches ORDER BY name');
    const semestersRes = await pool.query('SELECT DISTINCT semester FROM subjects ORDER BY semester');
    
    console.log(`Found: ${branchesRes.rows.length} branches, ${semestersRes.rows.length} semesters`);
    console.log(`Total combinations to regenerate: ${branchesRes.rows.length} × ${semestersRes.rows.length} = ${branchesRes.rows.length * semestersRes.rows.length}\n`);

    // Step 4: Regenerate with validation
    console.log('⚙️  STEP 4: Regenerating with LABS-FIRST strategy...\n');
    
    let successCount = 0;
    let partialCount = 0;
    let failCount = 0;
    const results = [];

    for (const branch of branchesRes.rows) {
      for (const semRow of semestersRes.rows) {
        const sem = semRow.semester;
        const algorithm = new TimetableAlgorithm(branch.branch_id, sem);
        console.log(`🔄 Generating: ${branch.name} - Semester ${sem}`);
        
        const result = await algorithm.generate();
        
        if (result.success === false) {
          console.log(`  ❌ FAILED: ${result.error}`);
          failCount++;
          results.push({
            branch: branch.name,
            semester: sem,
            status: 'FAILED',
            message: result.error
          });
        } else {
          // Check for conflicts in generated schedule
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
            console.log(`  ⚠️  PARTIAL: Generated with ${conflicts} conflicts`);
            partialCount++;
            results.push({
              branch: branch.name,
              semester: sem,
              status: 'PARTIAL',
              conflicts: conflicts
            });
          } else {
            console.log(`  ✅ SUCCESS: No conflicts detected`);
            successCount++;
            results.push({
              branch: branch.name,
              semester: sem,
              status: 'SUCCESS',
              conflicts: 0
            });
          }
        }
      }
    }

    // Step 5: Summary
    console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║              REGENERATION SUMMARY                              ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);
    
    console.log(`✅ SUCCESS:  ${successCount} combinations`);
    console.log(`⚠️  PARTIAL: ${partialCount} combinations`);
    console.log(`❌ FAILED:   ${failCount} combinations\n`);

    console.log(`Results by branch-semester:`);
    console.table(results);

    // Final stats
    const finalRes = await pool.query(`
      SELECT 
        COUNT(*) as total_classes,
        SUM(CASE WHEN slot_type = 'THEORY' THEN 1 ELSE 0 END) as theories,
        SUM(CASE WHEN slot_type = 'LAB' THEN 1 ELSE 0 END) as labs
      FROM timetable
    `);

    const stats = finalRes.rows[0];
    console.log(`\n📊 FINAL DATABASE STATS:`);
    console.log(`   Total Classes: ${stats.total_classes}`);
    console.log(`   Theory: ${stats.theories}`);
    console.log(`   Labs: ${stats.labs}\n`);

    pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

cleanRegenerate();
