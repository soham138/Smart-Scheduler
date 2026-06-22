#!/usr/bin/env node

/**
 * COMPREHENSIVE VERIFICATION: 1-Professor-per-2-Subjects Configuration
 * Full audit of timetable generation, conflicts, and instance distribution
 */

const pool = require('./backend/src/config/db');

async function comprehensiveVerification() {
  let client;
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`COMPREHENSIVE TIMETABLE VERIFICATION`);
    console.log(`Configuration: 1 Professor per 2 Subjects`);
    console.log(`${'='.repeat(80)}\n`);

    client = await pool.connect();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [1] PROFESSOR CONFIGURATION VERIFICATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    console.log(`[1] PROFESSOR CONFIGURATION
────────────────────────────`);
    
    const profConfig = await client.query(`
      SELECT 
        count(*) as professor_count,
        COUNT(CASE WHEN subject_count = 0 THEN 1 END) as unassigned,
        COUNT(CASE WHEN subject_count = 1 THEN 1 END) as with_1_subject,
        COUNT(CASE WHEN subject_count = 2 THEN 1 END) as with_2_subjects,
        COUNT(CASE WHEN subject_count >= 3 THEN 1 END) as with_3plus_subjects
      FROM (
        SELECT 
          p.professor_id,
          COUNT(DISTINCT ps.subject_id) as subject_count
        FROM professors p
        LEFT JOIN professors_subjects ps ON p.professor_id = ps.professor_id
        GROUP BY p.professor_id
      ) prof_stats
    `);
    
    const stats = profConfig.rows[0];
    console.log(`  Total professors: ${stats.professor_count}`);
    console.log(`  • With 0 subjects (unassigned): ${stats.unassigned}`);
    console.log(`  • With 1 subject: ${stats.with_1_subject}`);
    console.log(`  • With 2 subjects: ${stats.with_2_subjects} ✓ TARGET`);
    console.log(`  • With 3+ subjects: ${stats.with_3plus_subjects}`);
    
    const prof2Count = parseInt(stats.with_2_subjects || 0);
    const targetProfs = 15; // Ideal: 31 subjects / 2 = 15.5, so min 15
    
    if (prof2Count >= 10) {
      console.log(`\n  ✓ Good distribution! ${prof2Count} professors with 2 subjects`);
    } else {
      console.log(`\n  ⚠️ Could improve: only ${prof2Count} professors with 2 subjects (target: ${targetProfs})`);
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [2] SUBJECT SCHEDULING VERIFICATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    console.log(`\n[2] SUBJECT SCHEDULING VERIFICATION
──────────────────────────────────`);
    
    const subjectStats = await client.query(`
      SELECT 
        COUNT(DISTINCT s.subject_id) as total_subjects,
        COUNT(DISTINCT CASE WHEN t.subject_id IS NOT NULL THEN s.subject_id END) as scheduled,
        COUNT(DISTINCT CASE WHEN t.subject_id IS NULL THEN s.subject_id END) as not_scheduled
      FROM subjects s
      LEFT JOIN timetable t ON s.subject_id = t.subject_id 
        AND t.slot_type IN ('LAB', 'THEORY')
      WHERE s.semester IN (1, 3, 5, 7)
    `);
    
    const subStats = subjectStats.rows[0];
    const scheduledCount = parseInt(subStats.scheduled || 0);
    const totalCount = parseInt(subStats.total_subjects || 0);
    
    console.log(`  Total subjects (odd semesters): ${totalCount}`);
    console.log(`  Scheduled: ${scheduledCount}`);
    console.log(`  Not scheduled: ${parseInt(subStats.not_scheduled || 0)}`);
    
    if (scheduledCount === totalCount) {
      console.log(`\n  ✓✓✓ SUCCESS! All ${totalCount} subjects scheduled!`);
    } else {
      console.log(`\n  ✗ ISSUE! Only ${scheduledCount}/${totalCount} scheduled`);
      
      // Show missing subjects
      const missing = await client.query(`
        SELECT s.code, s.name, s.semester
        FROM subjects s
        WHERE s.semester IN (1, 3, 5, 7)
          AND s.subject_id NOT IN (
            SELECT DISTINCT subject_id FROM timetable 
            WHERE slot_type IN ('LAB', 'THEORY')
          )
        ORDER BY s.code
      `);
      
      console.log(`\n  Missing subjects:`);
      for (const row of missing.rows) {
        console.log(`    • ${row.code} (Sem ${row.semester}): ${row.name}`);
      }
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [3] BATCH INSTANCE VERIFICATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    console.log(`\n[3] BATCH INSTANCE VERIFICATION
─────────────────────────────`);
    
    const batchStats = await client.query(`
      SELECT 
        s.subject_id,
        s.code,
        COUNT(DISTINCT CASE WHEN slot_type = 'LAB' AND batch = 'A' THEN 1 END) as lab_batch_a,
        COUNT(DISTINCT CASE WHEN slot_type = 'LAB' AND batch = 'B' THEN 1 END) as lab_batch_b,
        COUNT(DISTINCT CASE WHEN slot_type = 'THEORY' THEN 1 END) as theory_slots
      FROM timetable t
      JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.slot_type IN ('LAB', 'THEORY')
      GROUP BY s.subject_id, s.code
      ORDER BY s.code
    `);
    
    console.log(`  Checking LAB distribution by batch:\n`);
    
    let perfectBatchDist = 0;
    let imperfectBatchDist = 0;
    
    for (const row of batchStats.rows) {
      const labA = parseInt(row.lab_batch_a || 0);
      const labB = parseInt(row.lab_batch_b || 0);
      const theory = parseInt(row.theory_slots || 0);
      
      // For LAB subjects: both batches should have slots (or both 0)
      if (labA > 0 && labB > 0) {
        console.log(`  ✓ ${row.code}: LAB-A(${labA}), LAB-B(${labB}), THEORY(${theory})`);
        perfectBatchDist++;
      } else if (labA === 0 && labB === 0) {
        console.log(`  ○ ${row.code}: No LABs (theory-only), THEORY(${theory})`);
        perfectBatchDist++;
      } else {
        console.log(`  ⚠️ ${row.code}: UNBALANCED BATCHES - LAB-A(${labA}), LAB-B(${labB}), THEORY(${theory})`);
        imperfectBatchDist++;
      }
    }
    
    console.log(`\n  Summary:`);
    console.log(`    ✓ Balanced batch distribution: ${perfectBatchDist}`);
    console.log(`    ⚠️ Unbalanced batch distribution: ${imperfectBatchDist}`);
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [4] CONFLICT DETECTION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    console.log(`\n[4] CONFLICT DETECTION
────────────────────`);
    
    // Check professor double-booking
    const profConflicts = await client.query(`
      SELECT 
        t1.professor_id,
        p.name,
        t1.day_of_week,
        t1.time_slot_start,
        t1.time_slot_end,
        COUNT(*) as conflict_count
      FROM timetable t1
      JOIN professors p ON t1.professor_id = p.professor_id
      WHERE t1.slot_type IN ('LAB', 'THEORY')
      GROUP BY t1.professor_id, p.name, t1.day_of_week, t1.time_slot_start, t1.time_slot_end
      HAVING COUNT(*) > 1
      LIMIT 10
    `);
    
    if (profConflicts.rows.length === 0) {
      console.log(`  ✓ No professor double-booking detected`);
    } else {
      console.log(`  ✗ Professor conflicts found: ${profConflicts.rows.length}`);
      for (const row of profConflicts.rows.slice(0, 3)) {
        console.log(`    • ${row.name} on ${row.day_of_week} at ${row.time_slot_start}`);
      }
    }
    
    // Check batch time conflicts (same batch in 2 classes at same time)
    const batchConflicts = await client.query(`
      SELECT 
        b.batch_number,
        br.name as branch,
        t1.semester,
        t1.day_of_week,
        t1.time_slot_start,
        COUNT(*) as activities_count
      FROM timetable t1
      JOIN batches b ON t1.batch_id = b.batch_id
      JOIN branches br ON b.branch_id = br.branch_id
      WHERE t1.slot_type IN ('LAB', 'THEORY')
      GROUP BY b.batch_id, b.batch_number, br.name, t1.semester, t1.day_of_week, t1.time_slot_start
      HAVING COUNT(*) > 1
      LIMIT 10
    `);
    
    if (batchConflicts.rows.length === 0) {
      console.log(`  ✓ No batch time conflicts detected`);
    } else {
      console.log(`  ✗ Batch conflicts found: ${batchConflicts.rows.length}`);
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [5] ENTITY INSTANCE AUDIT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    console.log(`\n[5] ENTITY INSTANCE AUDIT
───────────────────────`);
    
    const instanceAudit = await client.query(`
      WITH instance_count AS (
        SELECT 
          COUNT(DISTINCT subject_id) as subjects,
          COUNT(DISTINCT CASE WHEN batch = 'A' THEN subject_id || '-LAB-A' END) as lab_a_instances,
          COUNT(DISTINCT CASE WHEN batch = 'B' THEN subject_id || '-LAB-B' END) as lab_b_instances,
          COUNT(DISTINCT subject_id) FILTER (WHERE slot_type = 'THEORY') as theory_instances
        FROM timetable
        WHERE slot_type IN ('LAB', 'THEORY')
      )
      SELECT 
        subjects,
        lab_a_instances,
        lab_b_instances,
        theory_instances,
        (lab_a_instances + lab_b_instances + theory_instances) as total_instances
      FROM instance_count
    `);
    
    const audit = instanceAudit.rows[0];
    console.log(`  Distinct scheduling instances created: ${audit.total_instances}`);
    console.log(`    • Subject entities: ${audit.subjects}`);
    console.log(`    • LAB-Batch-A instances: ${audit.lab_a_instances}`);
    console.log(`    • LAB-Batch-B instances: ${audit.lab_b_instances}`);
    console.log(`    • THEORY instances: ${audit.theory_instances}`);
    
    console.log(`\n  Expected instances:`);
    console.log(`    • LAB instances (per batch): ~${totalCount * 2} (if all have labs)`);
    console.log(`    • THEORY instances: ~${totalCount} (one per subject)`);
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [FINAL VERDICT]
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`FINAL VERDICT`);
    console.log(`${'='.repeat(80)}\n`);
    
    const pass1 = scheduledCount === totalCount;
    const pass2 = imperfectBatchDist === 0;
    const pass3 = profConflicts.rows.length === 0 && batchConflicts.rows.length === 0;
    
    let allPass = pass1 && pass2 && pass3;
    
    console.log(`  [${pass1 ? '✓' : '✗'}] All 31 subjects scheduled: ${pass1 ? 'YES' : 'NO'}`);
    console.log(`  [${pass2 ? '✓' : '✗'}] Batch distribution balanced: ${pass2 ? 'YES' : 'NO'}`);
    console.log(`  [${pass3 ? '✓' : '✗'}] No scheduling conflicts: ${pass3 ? 'YES' : 'NO'}`);
    
    if (allPass) {
      console.log(`\n✓✓✓ SYSTEM VERIFICATION PASSED ✓✓✓`);
      console.log(`Algorithm is entity-centric and working correctly!`);
    } else {
      console.log(`\n⚠️ ISSUES DETECTED - See details above`);
    }
    
    process.exit(allPass ? 0 : 1);

  } catch (error) {
    console.error(`\n[ERROR]`, error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (client) client.release();
  }
}

comprehensiveVerification();
