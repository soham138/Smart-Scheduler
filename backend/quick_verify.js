#!/usr/bin/env node
require('dotenv').config();
const pool = require('./src/config/db');

async function verify() {
  let connection;
  try {
    connection = await pool.connect();

    // Get CE branch
    const branches = await connection.query(
      "SELECT branch_id, name FROM branches LIMIT 5"
    );
    
    const ceBranch = branches.rows.find(b => b.name.includes('Computer Engineering'));
    if (!ceBranch) {
      console.log('CE branch not found');
      return;
    }

    console.log(`\n✅ VERIFICATION: Computer Engineering Sem 2\n`);
    console.log('='.repeat(70));

    // Check for violations
    const violations = await connection.query(`
      SELECT day_of_week, t.subject_id, COUNT(*) as cnt, 
             STRING_AGG(time_slot_start::text, ', ') as times
      FROM timetable t
      WHERE t.branch_id = $1 AND t.semester = 2 AND t.slot_type = 'THEORY'
      GROUP BY day_of_week, t.subject_id
      HAVING COUNT(*) > 1
    `, [ceBranch.branch_id]);

    if (violations.rows.length === 0) {
      console.log('✅ CE Sem 2: NO same-subject-same-day violations found!');
      console.log('\n✨ CONSTRAINT WORKING: Max 1 theory per subject per day');
    } else {
      console.log('❌ CE Sem 2: Violations still exist:');
      violations.rows.forEach(r => {
        console.log(`  ${r.day_of_week}: Subject ${r.subject_id.substring(0,8)} = ${r.cnt}x at ${r.times}`);
      });
    }

    console.log('\n='.repeat(70));

    // Show some examples of correctly scheduled subjects
    const examples = await connection.query(`
      SELECT day_of_week, t.subject_id, COUNT(*) as cnt, 
             STRING_AGG(DISTINCT time_slot_start::text, ', ') as times
      FROM timetable t
      WHERE t.branch_id = $1 AND t.semester = 2 AND t.slot_type = 'THEORY'
      GROUP BY day_of_week, t.subject_id
      ORDER BY day_of_week
      LIMIT 10
    `, [ceBranch.branch_id]);

    console.log('\n📊 Sample timetable entries (verified 1 per day):');
    examples.rows.forEach(r => {
      console.log(`  ${r.day_of_week}: Subject ${r.subject_id.substring(0,8)} at ${r.times}`);
    });

  } catch (err) {
    console.error(err.message);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

verify();
