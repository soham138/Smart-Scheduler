#!/usr/bin/env node
/**
 * QUICK SUBJECT & LAB COUNT ANALYSIS
 */

const pool = require('./src/config/db');

async function quickAnalysis() {
  try {
    console.log('\n📊 SUBJECT & LAB ANALYSIS\n');

    // Get overall stats
    const stats = await pool.query(`
      SELECT 
        COUNT(DISTINCT s.subject_id) as total_subjects,
        COUNT(DISTINCT CASE WHEN t.slot_type = 'LAB' THEN s.subject_id END) as subjects_with_labs,
        COUNT(CASE WHEN t.slot_type = 'LAB' THEN 1 END) as total_labs
      FROM subjects s
      LEFT JOIN timetable t ON s.subject_id = t.subject_id
    `);

    const totalSubjects = stats.rows[0].total_subjects;
    const subjectsWithLabs = stats.rows[0].subjects_with_labs;
    const totalLabs = stats.rows[0].total_labs;

    console.log('OVERALL STATISTICS:');
    console.log(`  Total Subjects: ${totalSubjects}`);
    console.log(`  Subjects with Labs: ${subjectsWithLabs}`);
    console.log(`  Total Lab Sessions: ${totalLabs}\n`);

    // ODD semesters
    const oddStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT s.subject_id) as total_subjects,
        COUNT(DISTINCT CASE WHEN t.slot_type = 'LAB' THEN s.subject_id END) as subjects_with_labs,
        COUNT(CASE WHEN t.slot_type = 'LAB' THEN 1 END) as total_labs
      FROM subjects s
      LEFT JOIN timetable t ON s.subject_id = t.subject_id
      WHERE s.semester IN (1, 3, 5, 7)
    `);

    const oddTotal = oddStats.rows[0].total_subjects;
    const oddWithLabs = oddStats.rows[0].subjects_with_labs;
    const oddLabs = oddStats.rows[0].total_labs;

    console.log('ODD SEMESTERS (1, 3, 5, 7):');
    console.log(`  Total Subjects: ${oddTotal}`);
    console.log(`  Subjects with Labs: ${oddWithLabs} (${((oddWithLabs/oddTotal)*100).toFixed(1)}%)`);
    console.log(`  Total Lab Sessions: ${oddLabs}\n`);

    // EVEN semesters
    const evenStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT s.subject_id) as total_subjects,
        COUNT(DISTINCT CASE WHEN t.slot_type = 'LAB' THEN s.subject_id END) as subjects_with_labs,
        COUNT(CASE WHEN t.slot_type = 'LAB' THEN 1 END) as total_labs
      FROM subjects s
      LEFT JOIN timetable t ON s.subject_id = t.subject_id
      WHERE s.semester IN (2, 4, 6, 8)
    `);

    const evenTotal = evenStats.rows[0].total_subjects;
    const evenWithLabs = evenStats.rows[0].subjects_with_labs;
    const evenLabs = evenStats.rows[0].total_labs;

    console.log('EVEN SEMESTERS (2, 4, 6, 8):');
    console.log(`  Total Subjects: ${evenTotal}`);
    console.log(`  Subjects with Labs: ${evenWithLabs} (${((evenWithLabs/evenTotal)*100).toFixed(1)}%)`);
    console.log(`  Total Lab Sessions: ${evenLabs}\n`);

    // Per semester breakdown
    const perSem = await pool.query(`
      SELECT 
        s.semester,
        COUNT(DISTINCT s.subject_id) as total_subjects,
        COUNT(DISTINCT CASE WHEN t.slot_type = 'LAB' THEN s.subject_id END) as subjects_with_labs,
        COUNT(CASE WHEN t.slot_type = 'LAB' THEN 1 END) as total_labs
      FROM subjects s
      LEFT JOIN timetable t ON s.subject_id = t.subject_id
      GROUP BY s.semester
      ORDER BY s.semester
    `);

    console.log('PER SEMESTER BREAKDOWN:');
    console.log('Sem | Total | With Labs | Labs');
    console.log('─'.repeat(40));
    for (const row of perSem.rows) {
      console.log(` ${row.semester}  |  ${String(row.total_subjects).padStart(4)} |     ${String(row.subjects_with_labs).padStart(2)} | ${String(row.total_labs).padStart(4)}`);
    }
    console.log('─'.repeat(40));
    console.log(`TOTAL | ${String(totalSubjects).padStart(4)} | ${String(subjectsWithLabs).padStart(9)} | ${String(totalLabs).padStart(4)}\n`);

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

quickAnalysis();
