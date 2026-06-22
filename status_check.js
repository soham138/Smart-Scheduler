#!/usr/bin/env node

/**
 * Status Check: Professor Assignments + Timetable State
 * Uses correct db import pattern
 */

const pool = require('./backend/src/config/db');

async function statusCheck() {
  let client;
  try {
    console.log(`\n[Status Check] Professor Assignments & Timetable
========================================================\n`);

    client = await pool.connect();

    // [1] Check professor-subject mapping
    console.log(`[1] Professor-Subject Mapping`);
    console.log(`────────────────────────────`);
    
    const profResult = await client.query(`
      SELECT 
        p.professor_id,
        p.name,
        COUNT(DISTINCT ps.subject_id) as subject_count,
        STRING_AGG(DISTINCT s.code, ', ' ORDER BY s.code) as subject_codes
      FROM professors p
      LEFT JOIN professors_subjects ps ON p.professor_id = ps.professor_id
      LEFT JOIN subjects s ON ps.subject_id = s.subject_id
      GROUP BY p.professor_id, p.name
      ORDER BY subject_count DESC, p.name
    `);
    
    let prof0 = 0, prof1 = 0, prof2 = 0, prof3plus = 0;
    
    for (const row of profResult.rows) {
      const count = row.subject_count || 0;
      const codes = row.subject_codes ? row.subject_codes.substring(0, 40) : '(none)';
      
      console.log(`  • ${row.name}: ${count} subject(s) - ${codes}`);
      
      if (count === 0) prof0++;
      else if (count === 1) prof1++;
      else if (count === 2) prof2++;
      else prof3plus++;
    }
    
    console.log(`\n  Summary:`);
    console.log(`    With 0 subjects: ${prof0}`);
    console.log(`    With 1 subject:  ${prof1}`);
    console.log(`    With 2 subjects: ${prof2} ✓`);
    console.log(`    With 3+ subjects: ${prof3plus}`);
    
    if (prof2 > 0) {
      console.log(`\n  ✓ Found professors with exactly 2 subjects!`);
    } else {
      console.log(`\n  ⚠️ No professors have exactly 2 subjects`);
    }
    
    // [2] Check timetable
    console.log(`\n[2] Current Timetable Status`);
    console.log(`────────────────────────────`);
    
    const ttCount = await client.query(`SELECT COUNT(*) as count FROM timetable`);
    const slotCount = ttCount.rows[0].count;
    
    if (slotCount === 0) {
      console.log(`  ℹ️ Timetable is EMPTY (${slotCount} slots)`);
    } else {
      console.log(`  Timetable has ${slotCount} total slots`);
      
      // Breakdown
      const breakdown = await client.query(`
        SELECT slot_type, COUNT(*) as count
        FROM timetable
        GROUP BY slot_type
        ORDER BY count DESC
      `);
      
      for (const row of breakdown.rows) {
        console.log(`    • ${row.slot_type}: ${row.count}`);
      }
      
      // Subject count
      const subjectCount = await client.query(`
        SELECT COUNT(DISTINCT subject_id) as count
        FROM timetable
        WHERE slot_type IN ('LAB', 'THEORY')
      `);
      
      console.log(`\n  Subjects scheduled: ${subjectCount.rows[0].count || 0}/31`);
    }
    
    console.log(`\n[Next Steps]`);
    console.log(`────────────`);
    if (prof2 === 0) {
      console.log(`  1. Need to redistribute subjects to create 1-professor-per-2-subjects`);
      console.log(`  2. Run: node REBALANCE_ASSIGNMENTS.js`);
    } else if (slotCount === 0) {
      console.log(`  1. Professor assignments OK (${prof2} with 2 subjects)`);
      console.log(`  2. Now generate timetable`);
      console.log(`  3. Run: node regenerate_timetable.js`);
    } else {
      console.log(`  1. Everything ready!`);
      console.log(`  2. Proceed with testing`);
    }

    process.exit(0);

  } catch (error) {
    console.error(`[ERROR]`, error.message);
    process.exit(1);
  } finally {
    if (client) client.release();
  }
}

statusCheck();
