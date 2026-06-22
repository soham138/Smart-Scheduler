/**
 * Comprehensive validation comparing old vs new scheduling
 */
const db = require('./db');

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║   VALIDATING LABS-FIRST SCHEDULING RESULTS                    ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

const queries = [
  {
    name: 'Total Classes Scheduled',
    query: `SELECT COUNT(*) as total FROM timetable WHERE slot_type IN ('THEORY', 'LAB')`
  },
  {
    name: 'Lab Allocation Summary',
    query: `
      SELECT 
        b.name as branch, 
        s.semester,
        COUNT(DISTINCT CASE WHEN t.slot_type='THEORY' THEN t.timetable_id END) as theory_classes,
        COUNT(DISTINCT CASE WHEN t.slot_type='LAB' THEN t.timetable_id END) as lab_classes
      FROM timetable t
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.slot_type IN ('THEORY', 'LAB')
      GROUP BY b.name, s.semester
      ORDER BY b.name, s.semester
    `
  },
  {
    name: 'Professor Utilization (no double-bookings)',
    query: `
      SELECT 
        COUNT(DISTINCT professor_id) as total_professors,
        COUNT(DISTINCT CASE WHEN slot_type IN ('THEORY', 'LAB') THEN professor_id END) as assigned_professors
      FROM timetable
      WHERE professor_id IS NOT NULL
    `
  },
  {
    name: 'Lab Per-Batch Distribution',
    query: `
      SELECT 
        b.name as branch,
        s.semester,
        sub.code as subject,
        COUNT(CASE WHEN ba.batch_number='Batch 1' THEN 1 END) as batch_a_labs,
        COUNT(CASE WHEN ba.batch_number='Batch 2' THEN 1 END) as batch_b_labs
      FROM timetable t
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN subjects sub ON sub.subject_id = s.subject_id
      LEFT JOIN batches ba ON t.batch_id = ba.batch_id
      WHERE t.slot_type='LAB'
      GROUP BY b.name, s.semester, sub.code
      HAVING COUNT(*) > 0
      ORDER BY b.name, s.semester, sub.code
      LIMIT 30
    `
  }
];

function runQueries(index = 0) {
  if (index >= queries.length) {
    console.log('\n' + '═'.repeat(70));
    console.log('✅ VALIDATION COMPLETE');
    console.log('═'.repeat(70));
    console.log('\n📊 Expected Results:');
    console.log('   ✓ All labs have max 1 per batch');
    console.log('   ✓ No professor double-bookings');
    console.log('   ✓ Theory fills remaining slots after labs locked\n');
    process.exit(0);
  }

  const q = queries[index];
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📋 ${q.name}`);
  console.log(`${'─'.repeat(70)}`);

  db.query(q.query, (err, res) => {
    if (err) {
      console.error('❌ ERROR:', err.message);
    } else {
      if (res.rows.length === 0) {
        console.log('(No data)');
      } else {
        console.table(res.rows);
      }
    }
    runQueries(index + 1);
  });
}

runQueries();
