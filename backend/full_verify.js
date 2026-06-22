#!/usr/bin/env node
/**
 * COMPREHENSIVE TIMETABLE VERIFICATION
 * - Same-subject-same-day violations
 * - Theory-Lab conflicts
 * - Lab batch fairness
 */

require('dotenv').config();
const pool = require('./src/config/db');

const BRANCHES = [
  { id: '72b6f7c5-f8ff-41d4-988f-aeab1d16c1c0', abbr: 'AI', name: 'Artificial Intelligence' },
  { id: '8e1571fa-2298-49c7-871c-ccdfdd9a6b18', abbr: 'CE', name: 'Computer Engineering' },
  { id: '243337b3-deeb-4023-ac29-5c55db8356d1', abbr: 'IoT', name: 'Internet of Things' }
];

class Verifier {
  constructor() {
    this.violations = { sameSubject: 0, conflict: 0, balance: 0 };
    this.results = [];
  }

  async verify(connection) {
    console.log('\n════════════════════════════════════════════════════════════════════════════════');
    console.log('                    COMPREHENSIVE TIMETABLE VERIFICATION');
    console.log('════════════════════════════════════════════════════════════════════════════════\n');

    for (const branch of BRANCHES) {
      for (const sem of [2, 4, 6, 8]) {
        const result = {
          branch: branch.abbr,
          semester: sem,
          sameSubject: { count: 0, items: [] },
          conflict: { count: 0, items: [] },
          balance: { count: 0, items: [] }
        };

        // ═══════════════════════════════════════════════════════════════════════════════
        // CHECK 1: Same Subject Same Day
        // ═══════════════════════════════════════════════════════════════════════════════
        const sameDayQuery = `
          SELECT 
            subject_name,
            day_of_week,
            COUNT(*) as cnt,
            STRING_AGG(time_slot_start::text || '-' || time_slot_end::text, ' | ') as times
          FROM timetable
          WHERE branch_id = $1 AND semester = $2 AND slot_type = 'THEORY'
          GROUP BY subject_name, day_of_week
          HAVING COUNT(*) > 1
          ORDER BY subject_name, day_of_week
        `;

        try {
          const res = await connection.query(sameDayQuery, [branch.id, sem]);
          result.sameSubject.count = res.rows.length;
          result.sameSubject.items = res.rows;
          this.violations.sameSubject += res.rows.length;
        } catch (e) {
          console.log(`  Query error for ${branch.abbr} Sem ${sem}: ${e.message}`);
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CHECK 2: Theory-Lab Time Conflicts
        // ═══════════════════════════════════════════════════════════════════════════════
        const conflictQuery = `
          SELECT DISTINCT
            t1.subject_name,
            t1.day_of_week,
            t1.time_slot_start,
            t1.time_slot_end,
            t2.time_slot_start as lab_start,
            t2.time_slot_end as lab_end,
            t2.batch_id
          FROM timetable t1
          INNER JOIN timetable t2 ON
            t1.subject_id = t2.subject_id AND
            t1.branch_id = t2.branch_id AND
            t1.semester = t2.semester AND
            t1.day_of_week = t2.day_of_week AND
            t1.slot_type = 'THEORY' AND
            t2.slot_type = 'LAB' AND
            t1.time_slot_start < t2.time_slot_end AND
            t1.time_slot_end > t2.time_slot_start
          WHERE t1.branch_id = $1 AND t1.semester = $2
          ORDER BY t1.subject_name, t1.day_of_week
        `;

        try {
          const res = await connection.query(conflictQuery, [branch.id, sem]);
          result.conflict.count = res.rows.length;
          result.conflict.items = res.rows;
          this.violations.conflict += res.rows.length;
        } catch (e) {
          console.log(`  Conflict check error: ${e.message}`);
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CHECK 3: Lab Batch Balance
        // ═══════════════════════════════════════════════════════════════════════════════
        const balanceQuery = `
          SELECT
            subject_name,
            SUM(CASE WHEN batch_id LIKE '%Batch A%' THEN 1 ELSE 0 END) as batch_a,
            SUM(CASE WHEN batch_id LIKE '%Batch B%' THEN 1 ELSE 0 END) as batch_b
          FROM timetable
          WHERE branch_id = $1 AND semester = $2 AND slot_type = 'LAB'
          GROUP BY subject_name
          HAVING
            SUM(CASE WHEN batch_id LIKE '%Batch A%' THEN 1 ELSE 0 END) = 0 OR
            SUM(CASE WHEN batch_id LIKE '%Batch B%' THEN 1 ELSE 0 END) = 0 OR
            ABS(SUM(CASE WHEN batch_id LIKE '%Batch A%' THEN 1 ELSE 0 END) - 
                SUM(CASE WHEN batch_id LIKE '%Batch B%' THEN 1 ELSE 0 END)) > 1
          ORDER BY subject_name
        `;

        try {
          const res = await connection.query(balanceQuery, [branch.id, sem]);
          result.balance.count = res.rows.length;
          result.balance.items = res.rows;
          this.violations.balance += res.rows.length;
        } catch (e) {
          console.log(`  Balance check error: ${e.message}`);
        }

        this.results.push(result);
      }
    }

    this.printResults();
  }

  printResults() {
    for (const result of this.results) {
      console.log(`\n┌─────────────────────────────────────────────────────────────────────────────────┐`);
      console.log(`│ ${result.branch} - Semester ${result.semester}                                                           │`);
      console.log(`└─────────────────────────────────────────────────────────────────────────────────┘\n`);

      // Check 1
      if (result.sameSubject.count === 0) {
        console.log(`✅ Constraint 1 (Max 1 theory per subject per day): PASS\n`);
      } else {
        console.log(`❌ Constraint 1 (Max 1 theory per subject per day): FAIL (${result.sameSubject.count})\n`);
        result.sameSubject.items.slice(0, 5).forEach(item => {
          console.log(`   • ${item.subject_name} on ${item.day_of_week}: ${item.cnt}x`);
          console.log(`     Times: ${item.times}\n`);
        });
        if (result.sameSubject.items.length > 5) {
          console.log(`   ... and ${result.sameSubject.items.length - 5} more\n`);
        }
      }

      // Check 2
      if (result.conflict.count === 0) {
        console.log(`✅ Constraint 2 (No theory-lab overlap): PASS\n`);
      } else {
        console.log(`❌ Constraint 2 (No theory-lab overlap): FAIL (${result.conflict.count})\n`);
        result.conflict.items.slice(0, 3).forEach(item => {
          console.log(`   • ${item.subject_name} on ${item.day_of_week}`);
          console.log(`     THEORY: ${item.time_slot_start}-${item.time_slot_end}`);
          console.log(`     LAB: ${item.lab_start}-${item.lab_end} (${item.batch_id})\n`);
        });
        if (result.conflict.items.length > 3) {
          console.log(`   ... and ${result.conflict.items.length - 3} more\n`);
        }
      }

      // Check 3
      if (result.balance.count === 0) {
        console.log(`✅ Lab Batch Balance: FAIR\n`);
      } else {
        console.log(`⚠️  Lab Batch Balance: IMBALANCED (${result.balance.count})\n`);
        result.balance.items.forEach(item => {
          const fair = item.batch_a && item.batch_b && Math.abs(item.batch_a - item.batch_b) <= 1;
          console.log(
            `   • ${item.subject_name}: Batch A=${item.batch_a}, Batch B=${item.batch_b} ${fair ? '(acceptable)' : '(FAIL)'}`
          );
        });
        console.log();
      }
    }

    // SUMMARY
    console.log('\n════════════════════════════════════════════════════════════════════════════════');
    console.log('                              SUMMARY REPORT');
    console.log('════════════════════════════════════════════════════════════════════════════════\n');

    const total = this.results.length;
    const pass1 = this.violations.sameSubject === 0;
    const pass2 = this.violations.conflict === 0;
    const pass3 = this.violations.balance === 0;

    console.log(`📊 CONSTRAINT CHECK RESULTS:\n`);
    console.log(`  Constraint 1 - Same subject single day: ${pass1 ? '✅ PASS' : `❌ FAIL (${this.violations.sameSubject})`}`);
    console.log(`  Constraint 2 - Theory-lab overlap: ${pass2 ? '✅ PASS' : `❌ FAIL (${this.violations.conflict})`}`);
    console.log(`  Batch fairness: ${pass3 ? '✅ FAIR' : `⚠️  IMBALANCED (${this.violations.balance})`}\n`);

    if (pass1 && pass2 && pass3) {
      console.log('✨ RESULT: All timetables are VALID and FAIR!\n');
    } else {
      console.log('⚠️  RESULT: Some timetables have issues - see above for details\n');
    }

    console.log('════════════════════════════════════════════════════════════════════════════════\n');
  }
}

async function main() {
  const verifier = new Verifier();
  let connection;

  try {
    connection = await pool.connect();
    await verifier.verify(connection);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    process.exit(0);
  }
}

main();
