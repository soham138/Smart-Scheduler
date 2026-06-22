#!/usr/bin/env node

/**
 * Simple Regeneration: Clear timetable and regenerate with new config
 * Uses correct database schema
 */

const pool = require('./backend/src/config/db');
const TimetableAlgorithm = require('./backend/src/algorithms/TimetableAlgorithm');

async function simpleRegeneration() {
  let client;
  try {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`TIMETABLE REGENERATION - 1 Prof per 2 Subjects Config`);
    console.log(`${'═'.repeat(60)}\n`);

    client = await pool.connect();

    // Step 1: Clear timetable
    console.log(`[1] Clearing old timetable...`);
    await client.query(`TRUNCATE TABLE timetable CASCADE`);
    console.log(`✓ Cleared\n`);

    // Step 2: Get branches
    console.log(`[2] Fetching branches...`);
    const branchResult = await client.query(`
      SELECT branch_id, name FROM branches ORDER BY branch_id
    `);
    const branches = branchResult.rows;
    console.log(`Found ${branches.length} branches\n`);

    // Step 3: Generate for each branch
    console.log(`[3] Generating timetables...\n`);
    
    for (const branch of branches) {
      console.log(`  ├─ ${branch.name}...`);
      
      try {
        const algorithm = new TimetableAlgorithm(branch.branch_id);
        
        // Generate for odd semesters only
        const semesters = [1, 3, 5, 7];
        for (const semester of semesters) {
          const result = await algorithm.generate(semester);
          if (!result.success) {
            console.log(`    │  Sem ${semester}: ✗ ${result.error || 'Unknown error'}`);
          } else {
            console.log(`    │  Sem ${semester}: ✓`);
          }
        }
        
        console.log(`  │`);
        
      } catch (error) {
        console.log(`    ✗ Error: ${error.message}`);
      }
    }

    // Step 4: Verify
    console.log(`[4] Verification...\n`);
    
    const countResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN slot_type = 'LAB' THEN 1 END) as labs,
        COUNT(CASE WHEN slot_type = 'THEORY' THEN 1 END) as theory,
        COUNT(DISTINCT subject_id) as subjects
      FROM timetable
      WHERE slot_type IN ('LAB', 'THEORY')
    `);
    
    const stats = countResult.rows[0];
    console.log(`  Total slots: ${stats.total}`);
    console.log(`  LAB slots: ${stats.labs}`);
    console.log(`  THEORY slots: ${stats.theory}`);
    console.log(`  Subjects: ${stats.subjects}/31`);

    // Check for conflicts
    const conflictResult = await client.query(`
      SELECT COUNT(*) as count FROM (
        SELECT professor_id, day_of_week, time_slot_start, COUNT(*) 
        FROM timetable 
        WHERE slot_type IN ('LAB', 'THEORY') 
        GROUP BY professor_id, day_of_week, time_slot_start 
        HAVING COUNT(*) > 1
      ) x
    `);
    
    const conflicts = conflictResult.rows[0].count;
    console.log(`  Conflicts: ${conflicts}`);

    if (stats.subjects >= 31 && conflicts === 0) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`✓✓✓ REGENERATION SUCCESSFUL ✓✓✓`);
      console.log(`${'═'.repeat(60)}\n`);
    } else {
      console.log(`\n⚠️ Issues detected - see above\n`);
    }

    process.exit(0);

  } catch (error) {
    console.error(`[ERROR]`, error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (client) client.release();
  }
}

simpleRegeneration();
