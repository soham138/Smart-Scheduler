#!/usr/bin/env node
const { Pool } = require('pg');

// Create a new pool with explicit config
const pool = new Pool({
  user: 'postgres',
  password: 'root1234',
  host: 'localhost',
  port: 5432,
  database: 'smarttt_db'
});

async function showConflictDetails() {
  try {
    console.log('\n========== CONFLICT ANALYSIS ==========\n');

    // Query 1: Count conflicts
    const countQuery = `
      SELECT 
        (SELECT COUNT(DISTINCT t1.professor_id, t1.day_of_week, t1.time_slot_start) 
         FROM timetable t1 
         INNER JOIN timetable t2 ON t1.professor_id = t2.professor_id 
           AND t1.day_of_week = t2.day_of_week 
           AND t1.time_slot_start = t2.time_slot_start 
           AND t1.timetable_id < t2.timetable_id) as prof_conflicts,
        (SELECT COUNT(DISTINCT t1.batch_id, t1.day_of_week, t1.time_slot_start) 
         FROM timetable t1 
         INNER JOIN timetable t2 ON t1.batch_id = t2.batch_id 
           AND t1.day_of_week = t2.day_of_week 
           AND t1.time_slot_start = t2.time_slot_start 
           AND t1.slot_type = 'THEORY' AND t2.slot_type = 'LAB') as lab_theory_overlaps
    `;
    
    const countResult = await pool.query(countQuery);
    console.log('📊 CONFLICT COUNTS:');
    console.log(`  Professor Double-bookings: ${countResult.rows[0].prof_conflicts || 0}`);
    console.log(`  Lab+Theory Overlaps: ${countResult.rows[0].lab_theory_overlaps || 0}`);

    // Query 2: Sample professor conflicts
    console.log('\n📌 SAMPLE PROFESSOR CONFLICTS (First 3):');
    const profQuery = `
      SELECT 
        p.name, t1.day_of_week, t1.time_slot_start, 
        b1.name as branch1, t1.semester as sem1, s1.name as subj1,
        b2.name as branch2, t2.semester as sem2, s2.name as subj2
      FROM timetable t1
      INNER JOIN timetable t2 ON t1.professor_id = t2.professor_id
        AND t1.day_of_week = t2.day_of_week
        AND t1.time_slot_start = t2.time_slot_start
        AND t1.timetable_id < t2.timetable_id
      LEFT JOIN professor p ON t1.professor_id = p.id
      LEFT JOIN subject s1 ON t1.subject_id = s1.id
      LEFT JOIN subject s2 ON t2.subject_id = s2.id
      LEFT JOIN branch b1 ON t1.branch_id = b1.id
      LEFT JOIN branch b2 ON t2.branch_id = b2.id
      LIMIT 3
    `;
    
    const profResult = await pool.query(profQuery);
    if (profResult.rows.length === 0) {
      console.log('  ✅ No professor conflicts!');
    } else {
      profResult.rows.forEach((row, i) => {
        console.log(`\n  Conflict ${i+1}: ${row.name}`);
        console.log(`    Time: ${row.day_of_week} ${row.time_slot_start}`);
        console.log(`    - ${row.branch1} Sem${row.sem1}: ${row.subj1}`);
        console.log(`    - ${row.branch2} Sem${row.sem2}: ${row.subj2}`);
      });
    }

    // Query 3: Sample lab+theory overlaps
    console.log('\n\n📌 SAMPLE LAB+THEORY OVERLAPS (First 3):');
    const ltQuery = `
      SELECT 
        bat.name as batch, b.name as branch, t1.semester,
        s1.name as theory, s2.name as lab,
        t1.day_of_week, t1.time_slot_start
      FROM timetable t1
      INNER JOIN timetable t2 ON t1.batch_id = t2.batch_id
        AND t1.day_of_week = t2.day_of_week
        AND t1.time_slot_start = t2.time_slot_start
        AND t1.slot_type = 'THEORY'
        AND t2.slot_type = 'LAB'
        AND t1.timetable_id < t2.timetable_id
      LEFT JOIN branch b ON t1.branch_id = b.id
      LEFT JOIN batch bat ON t1.batch_id = bat.id
      LEFT JOIN subject s1 ON t1.subject_id = s1.id
      LEFT JOIN subject s2 ON t2.subject_id = s2.id
      LIMIT 3
    `;
    
    const ltResult = await pool.query(ltQuery);
    if (ltResult.rows.length === 0) {
      console.log('  ✅ No lab+theory overlaps!');
    } else {
      ltResult.rows.forEach((row, i) => {
        console.log(`\n  Overlap ${i+1}: ${row.batch} (${row.branch})`);
        console.log(`    Time: ${row.day_of_week} ${row.time_slot_start}, Sem ${row.semester}`);
        console.log(`    - THEORY: ${row.theory}`);
        console.log(`    - LAB: ${row.lab}`);
      });
    }

    // Query 4: Reserved time violations
    console.log('\n\n📌 RESERVED TIME VIOLATIONS (FRI 16:00 library, THU 16:00 project):');
    const resQuery = `
      SELECT COUNT(*) as cnt FROM timetable
      WHERE (day_of_week = 'FRI' AND time_slot_start >= '16:00')
         OR (day_of_week = 'THU' AND time_slot_start >= '16:00')
    `;
    
    const resResult = await pool.query(resQuery);
    console.log(`  Total violations: ${resResult.rows[0].cnt}`);

    console.log('\n========== END REPORT ==========\n');
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
    process.exit(1);
  }
}

showConflictDetails();
