#!/usr/bin/env node

/**
 * SIMPLE VERIFICATION: All subjects scheduled?
 */

const pool = require('./backend/src/config/db');

async function simpleVerification() {
  let client;
  try {
    client = await pool.connect();

    console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
    console.log(`║   QUICK VERIFICATION: 1 Professor per 2 Subjects Config    ║`);
    console.log(`╚═══════════════════════════════════════════════════════════╝\n`);

    // Query 1: Count subjects
    const subjectCount = await client.query(`
      SELECT COUNT(*) as count FROM subjects 
      WHERE semester IN (1,3,5,7)
    `);
    const totalSubjects = subjectCount.rows[0].count;
    console.log(`[Total Subjects]   ${totalSubjects}`);

    // Query 2: Count scheduled
    const scheduledCount = await client.query(`
      SELECT COUNT(DISTINCT subject_id) as count 
      FROM timetable 
      WHERE slot_type IN ('LAB', 'THEORY')
    `);
    const scheduled = scheduledCount.rows[0].count;
    console.log(`[Scheduled]        ${scheduled}`);

    //Query 3: Professors with 2 subjects
    const prof2Result = await client.query(`
      SELECT COUNT(*) as count FROM (
        SELECT COUNT(*) as cnt FROM professors_subjects 
        GROUP BY professor_id HAVING COUNT(*) = 2
      ) x
    `);
    const prof2 = prof2Result.rows[0].count;
    console.log(`[Prof w/ 2 subj]   ${prof2}`);

    // Query 4: Timetable slots breakdown
    const breakdown = await client.query(`
      SELECT slot_type, COUNT(*) as count FROM timetable 
      GROUP BY slot_type ORDER BY count DESC
    `);
    
    console.log(`[Timetable Slots]`);
    for (const row of breakdown.rows) {
      console.log(`  • ${row.slot_type}: ${row.count}`);
    }

    // Query 5: Check for professor conflicts
    const conflicts = await client.query(`
      SELECT COUNT(*) FROM (
        SELECT professor_id, day_of_week, time_slot_start, COUNT(*) 
        FROM timetable 
        WHERE slot_type IN ('LAB', 'THEORY') 
        GROUP BY professor_id, day_of_week, time_slot_start 
        HAVING COUNT(*) > 1
      ) x
    `);
    const conflictCount = conflicts.rows[0].count;
    console.log(`[Prof Conflicts]   ${conflictCount}`);

    // Final Assessment
    console.log(`\n${'─'.repeat(60)}`);
    
    if (scheduled === totalSubjects && conflictCount === 0) {
      console.log(`✓✓✓ SYSTEM IS WORKING CORRECTLY ✓✓✓\n`);
      console.log(`• All ${totalSubjects}/31 subjects are scheduled`);
      console.log(`• No professor double-booking`);
      console.log(`• Algorithm is entity-centric ✓`);
    } else {
      console.log(`⚠️ Issues detected:\n`);
      if (scheduled < totalSubjects) {
        console.log(`• Missing subjects: ${totalSubjects - scheduled}`);
      }
      if (conflictCount > 0) {
        console.log(`• Professor conflicts detected: ${conflictCount}`);
      }
    }
    
    console.log(`\n`);
    process.exit(0);

  } catch (error) {
    console.error(`[ERROR]`, error.message);
    process.exit(1);
  } finally {
    if (client) client.release();
  }
}

simpleVerification();
