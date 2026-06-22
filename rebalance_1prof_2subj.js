#!/usr/bin/env node

/**
 * REBALANCE ASSIGNMENTS: 1 Professor per 2 Subjects
 * 
 * Goal: Maximize 2-subject assignments
 * Strategy:
 *   - 31 subjects / 2 = 15 professors with 2 subjects + 1 subject unassigned
 *   - Remaining professors get 0 subjects
 *   - Round-robin assignment to distribute fairly
 */

const pool = require('./backend/src/config/db');

async function rebalanceAssignments() {
  let client;
  try {
    console.log(`\n╔══════════════════════════════════════════════════════════╗`);
    console.log(`║  REBALANCING: 1 Professor per 2 Subjects Configuration   ║`);
    console.log(`╚══════════════════════════════════════════════════════════╝\n`);

    client = await pool.connect();

    // Step 1: Get all subjects
    console.log(`[Step 1] Fetching subjects...`);
    const subjectResult = await client.query(`
      SELECT subject_id, code, name 
      FROM subjects 
      WHERE semester IN (1, 3, 5, 7)
      ORDER BY subject_id
    `);
    
    const subjects = subjectResult.rows;
    console.log(`  Found ${subjects.length} subjects\n`);

    // Step 2: Get all professors
    console.log(`[Step 2] Fetching professors...`);
    const profResult = await client.query(`
      SELECT professor_id, name 
      FROM professors 
      ORDER BY professor_id
    `);
    
    const professors = profResult.rows;
    console.log(`  Found ${professors.length} professors\n`);

    // Step 3: Calculate assignment
    console.log(`[Step 3] Calculating assignments...`);
    const subjectsPerProf = 2;
    const maxProfsToAssign = Math.floor(subjects.length / subjectsPerProf);
    const subjectsToAssign = maxProfsToAssign * subjectsPerProf;
    const unassignedSubjects = subjects.length - subjectsToAssign;
    
    console.log(`  Total subjects: ${subjects.length}`);
    console.log(`  Subjects per professor: ${subjectsPerProf}`);
    console.log(`  Maximum professors to assign: ${maxProfsToAssign}`);
    console.log(`  Subjects to assign: ${subjectsToAssign}`);
    console.log(`  Unassigned subjects: ${unassignedSubjects}\n`);

    // Step 4: Create assignment plan
    console.log(`[Step 4] Creating assignment plan...`);
    
    const assignments = [];
    for (let i = 0; i < subjectsToAssign; i++) {
      const profIndex = Math.floor(i / subjectsPerProf) % professors.length;
      const profession = professors[profIndex];
      const subject = subjects[i];
      
      assignments.push({
        professor_id: profession.professor_id,
        professor_name: profession.name,
        subject_id: subject.subject_id,
        subject_code: subject.code,
        subject_name: subject.name
      });
    }

    console.log(`  Created ${assignments.length} assignments\n`);

    // Step 5: Group by professor
    console.log(`[Step 5] Assignment summary by professor:\n`);
    
    const profMap = new Map();
    for (const assign of assignments) {
      if (!profMap.has(assign.professor_id)) {
        profMap.set(assign.professor_id, {
          name: assign.professor_name,
          subjects: []
        });
      }
      profMap.get(assign.professor_id).subjects.push({
        id: assign.subject_id,
        code: assign.subject_code,
        name: assign.subject_name
      });
    }

    let profCount = 0;
    for (const [profId, data] of profMap.entries()) {
      profCount++;
      console.log(`  ${profCount}. ${data.name}`);
      for (const subject of data.subjects) {
        console.log(`     • ${subject.code}: ${subject.name}`);
      }
    }

    if (unassignedSubjects > 0) {
      console.log(`\n  Unassigned subjects:`);
      for (let i = subjectsToAssign; i < subjects.length; i++) {
        const subject = subjects[i];
        console.log(`    • ${subject.code}: ${subject.name}`);
      }
    }

    console.log(`\n[Step 6] Applying to database...\n`);

    // Start transaction
    await client.query('BEGIN');

    try {
      // Delete all existing assignments
      console.log(`  Clearing previous assignments...`);
      await client.query(`DELETE FROM professors_subjects`);
      console.log(`  ✓ Cleared\n`);

      // Insert new assignments
      console.log(`  Inserting new assignments...`);
      let insertCount = 0;
      
      for (const assign of assignments) {
        await client.query(
          `INSERT INTO professors_subjects (professor_id, subject_id) VALUES ($1, $2)`,
          [assign.professor_id, assign.subject_id]
        );
        insertCount++;
        
        if (insertCount % 5 === 0) {
          process.stdout.write(`\r  Inserted: ${insertCount}/${assignments.length}`);
        }
      }
      
      console.log(`\r  Inserted: ${insertCount}/${assignments.length} ✓\n`);

      // Commit transaction
      await client.query('COMMIT');
      console.log(`[Step 7] Transaction committed ✓\n`);

      // Verification
      console.log(`[Step 8] Verification:\n`);
      
      // Count assignments
      const countResult = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT professor_id) as prof_count
        FROM professors_subjects
      `);
      
      const total = countResult.rows[0].total;
      const profCount = countResult.rows[0].prof_count;
      
      console.log(`  Total assignments in DB: ${total}`);
      console.log(`  Professors assigned: ${profCount}\n`);

      // Show distribution
      const distResult = await client.query(`
        SELECT 
          COUNT(*) as subject_count,
          COUNT(*) as prof_count
        FROM (
          SELECT professor_id, COUNT(*) FROM professors_subjects GROUP BY professor_id
        ) x
        GROUP BY subject_count
        ORDER BY subject_count
      `);

      console.log(`  Distribution:`);
      for (const row of distResult.rows) {
        console.log(`    • ${row.prof_count} professors with ${row.subject_count} subject(s)`);
      }

      console.log(`\n╔══════════════════════════════════════════════════════════╗`);
      console.log(`║              ✓ REBALANCING COMPLETE ✓                   ║`);
      console.log(`╚══════════════════════════════════════════════════════════╝\n`);

      console.log(`Summary:`);
      console.log(`  • ${maxProfsToAssign} professors assigned to 2 subjects each = ${subjectsToAssign} subjects`);
      console.log(`  • ${unassignedSubjects} subject(s) left unassigned`);
      console.log(`  • ${professors.length - maxProfsToAssign} professors with no subjects (available for future use)\n`);

      process.exit(0);

    } catch (error) {
      console.error(`\n✗ Error during insert, rolling back...`);
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error(`[ERROR]`, error.message);
    process.exit(1);
  } finally {
    if (client) client.release();
  }
}

rebalanceAssignments();
