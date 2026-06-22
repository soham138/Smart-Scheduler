#!/usr/bin/env node
/**
 * SUBJECT & LAB ANALYSIS
 * 
 * Shows:
 * - Total subjects
 * - Subjects with labs
 * - Breakdown by semester (odd/even)
 */

const pool = require('./src/config/db');

async function analyzeSubjectsAndLabs() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║          SUBJECT & LAB ANALYSIS BY SEMESTER                ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // ========================================================================
    // 1. Get total subjects
    // ========================================================================
    console.log('📊 STEP 1: TOTAL SUBJECTS IN SYSTEM\n');

    const totalSubjectsResult = await pool.query(`
      SELECT COUNT(*) as total_subjects
      FROM subjects
    `);
    
    const totalSubjects = totalSubjectsResult.rows[0].total_subjects;
    console.log(`Total subjects in database: ${totalSubjects}\n`);

    // ========================================================================
    // 2. Get subjects with labs (all types)
    // ========================================================================
    console.log('📊 STEP 2: SUBJECTS WITH LABS (ALL SEMESTERS)\n');

    const subjectsWithLabsResult = await pool.query(`
      SELECT COUNT(DISTINCT subject_id) as subjects_with_labs
      FROM timetable
      WHERE slot_type = 'LAB'
    `);
    
    const subjectsWithLabs = subjectsWithLabsResult.rows[0].subjects_with_labs;
    console.log(`Subjects that have at least one lab: ${subjectsWithLabs}\n`);

    // ========================================================================
    // 3. ODD SEMESTERS (1, 3, 5, 7)
    // ========================================================================
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              ODD SEMESTERS (1, 3, 5, 7)                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const oddResult = await pool.query(`
      SELECT 
        s.subject_id,
        s.name as subject_name,
        s.semester,
        COUNT(CASE WHEN t.slot_type = 'LAB' THEN 1 END) as lab_count,
        COUNT(CASE WHEN t.slot_type = 'THEORY' THEN 1 END) as theory_count,
        COUNT(*) as total_classes
      FROM subjects s
      LEFT JOIN timetable t ON s.subject_id = t.subject_id
      WHERE s.semester IN (1, 3, 5, 7)
      GROUP BY s.subject_id, s.name, s.semester
      ORDER BY s.semester, s.name
    `);

    let oddSubjectsTotal = 0;
    let oddSubjectsWithLabs = 0;
    let oddLabCount = 0;

    console.log('Semester | Subject Name | Labs | Theory | Total Classes');
    console.log('─'.repeat(70));

    for (const row of oddResult.rows) {
      oddSubjectsTotal++;
      if (row.lab_count > 0) {
        oddSubjectsWithLabs++;
        oddLabCount += row.lab_count;
      }
      
      const subjectName = row.subject_name ? row.subject_name.substring(0, 28) : 'Unknown';
      console.log(
        `   ${row.semester}    | ${subjectName.padEnd(28)} | ${String(row.lab_count).padStart(4)} | ${String(row.theory_count).padStart(6)} | ${String(row.total_classes).padStart(12)}`
      );
    }

    console.log('─'.repeat(70));
    console.log(`\n📈 ODD SEMESTER SUMMARY:`);
    console.log(`   Total subjects: ${oddSubjectsTotal}`);
    console.log(`   Subjects with labs: ${oddSubjectsWithLabs}`);
    console.log(`   Total lab sessions: ${oddLabCount}`);
    console.log(`   Subjects without labs: ${oddSubjectsTotal - oddSubjectsWithLabs}\n`);

    // ========================================================================
    // 4. EVEN SEMESTERS (2, 4, 6, 8)
    // ========================================================================
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              EVEN SEMESTERS (2, 4, 6, 8)                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const evenResult = await pool.query(`
      SELECT 
        s.subject_id,
        s.name as subject_name,
        s.semester,
        COUNT(CASE WHEN t.slot_type = 'LAB' THEN 1 END) as lab_count,
        COUNT(CASE WHEN t.slot_type = 'THEORY' THEN 1 END) as theory_count,
        COUNT(*) as total_classes
      FROM subjects s
      LEFT JOIN timetable t ON s.subject_id = t.subject_id
      WHERE s.semester IN (2, 4, 6, 8)
      GROUP BY s.subject_id, s.name, s.semester
      ORDER BY s.semester, s.name
    `);

    let evenSubjectsTotal = 0;
    let evenSubjectsWithLabs = 0;
    let evenLabCount = 0;

    console.log('Semester | Subject Name | Labs | Theory | Total Classes');
    console.log('─'.repeat(70));

    for (const row of evenResult.rows) {
      evenSubjectsTotal++;
      if (row.lab_count > 0) {
        evenSubjectsWithLabs++;
        evenLabCount += row.lab_count;
      }
      
      const subjectName = row.subject_name ? row.subject_name.substring(0, 28) : 'Unknown';
      console.log(
        `   ${row.semester}    | ${subjectName.padEnd(28)} | ${String(row.lab_count).padStart(4)} | ${String(row.theory_count).padStart(6)} | ${String(row.total_classes).padStart(12)}`
      );
    }

    console.log('─'.repeat(70));
    console.log(`\n📈 EVEN SEMESTER SUMMARY:`);
    console.log(`   Total subjects: ${evenSubjectsTotal}`);
    console.log(`   Subjects with labs: ${evenSubjectsWithLabs}`);
    console.log(`   Total lab sessions: ${evenLabCount}`);
    console.log(`   Subjects without labs: ${evenSubjectsTotal - evenSubjectsWithLabs}\n`);

    // ========================================================================
    // 5. COMPREHENSIVE COMPARISON
    // ========================================================================
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              COMPREHENSIVE COMPARISON                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const comparison = {
      'ODD Semesters': {
        'Total Subjects': oddSubjectsTotal,
        'Subjects with Labs': oddSubjectsWithLabs,
        'Total Lab Sessions': oddLabCount,
        'Subjects without Labs': oddSubjectsTotal - oddSubjectsWithLabs,
        'Lab Coverage %': ((oddSubjectsWithLabs / oddSubjectsTotal) * 100).toFixed(1)
      },
      'EVEN Semesters': {
        'Total Subjects': evenSubjectsTotal,
        'Subjects with Labs': evenSubjectsWithLabs,
        'Total Lab Sessions': evenLabCount,
        'Subjects without Labs': evenSubjectsTotal - evenSubjectsWithLabs,
        'Lab Coverage %': ((evenSubjectsWithLabs / evenSubjectsTotal) * 100).toFixed(1)
      },
      'COMBINED': {
        'Total Subjects': oddSubjectsTotal + evenSubjectsTotal,
        'Subjects with Labs': oddSubjectsWithLabs + evenSubjectsWithLabs,
        'Total Lab Sessions': oddLabCount + evenLabCount,
        'Subjects without Labs': (oddSubjectsTotal - oddSubjectsWithLabs) + (evenSubjectsTotal - evenSubjectsWithLabs),
        'Lab Coverage %': (((oddSubjectsWithLabs + evenSubjectsWithLabs) / (oddSubjectsTotal + evenSubjectsTotal)) * 100).toFixed(1)
      }
    };

    console.log('Metric'.padEnd(28) + '| ODD      | EVEN     | COMBINED');
    console.log('─'.repeat(70));

    for (const [metric, _] of Object.entries(comparison['ODD Semesters'])) {
      const odd = comparison['ODD Semesters'][metric];
      const even = comparison['EVEN Semesters'][metric];
      const combined = comparison['COMBINED'][metric];
      
      console.log(
        String(metric).padEnd(28) + 
        `| ${String(odd).padStart(8)} | ${String(even).padStart(8)} | ${String(combined).padStart(8)}`
      );
    }

    console.log('─'.repeat(70));

    // ========================================================================
    // 6. DETAILED BREAKDOWN BY SEMESTER
    // ========================================================================
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║            DETAILED BREAKDOWN BY SEMESTER                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const semesterBreakdown = await pool.query(`
      SELECT 
        s.semester,
        COUNT(DISTINCT s.subject_id) as total_subjects,
        COUNT(DISTINCT CASE WHEN t.slot_type = 'LAB' THEN s.subject_id END) as subjects_with_labs,
        COUNT(CASE WHEN t.slot_type = 'LAB' THEN 1 END) as total_labs,
        COUNT(CASE WHEN t.slot_type = 'THEORY' THEN 1 END) as total_theory
      FROM subjects s
      LEFT JOIN timetable t ON s.subject_id = t.subject_id
      GROUP BY s.semester
      ORDER BY s.semester
    `);

    console.log('Sem | Total Subjects | With Labs | Lab Sessions | Theory Sessions | Coverage %');
    console.log('─'.repeat(90));

    for (const row of semesterBreakdown.rows) {
      const coverage = ((row.subjects_with_labs / row.total_subjects) * 100).toFixed(1);
      console.log(
        ` ${row.semester}  | ` +
        `${String(row.total_subjects).padStart(14)} | ` +
        `${String(row.subjects_with_labs).padStart(9)} | ` +
        `${String(row.total_labs).padStart(12)} | ` +
        `${String(row.total_theory).padStart(15)} | ` +
        `${coverage.padStart(8)}%`
      );
    }

    console.log('─'.repeat(90));

    // ========================================================================
    // 7. SUMMARY STATS
    // ========================================================================
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    KEY INSIGHTS                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const totalLabsAcrossAll = oddLabCount + evenLabCount;
    const totalSubjectsWithLabs = oddSubjectsWithLabs + evenSubjectsWithLabs;

    console.log(`✅ Total Subjects in System: ${totalSubjects}`);
    console.log(`✅ Subjects with at least 1 Lab: ${totalSubjectsWithLabs} (${((totalSubjectsWithLabs / totalSubjects) * 100).toFixed(1)}%)`);
    console.log(`✅ Subjects without Labs: ${totalSubjects - totalSubjectsWithLabs} (${(((totalSubjects - totalSubjectsWithLabs) / totalSubjects) * 100).toFixed(1)}%)`);
    console.log(`\n✅ Total Lab Sessions (ODD): ${oddLabCount}`);
    console.log(`✅ Total Lab Sessions (EVEN): ${evenLabCount}`);
    console.log(`✅ Total Lab Sessions (ALL): ${totalLabsAcrossAll}`);
    console.log(`\n✅ Lab Balance:`);
    console.log(`   ODD semesters: ${oddLabCount} labs`);
    console.log(`   EVEN semesters: ${evenLabCount} labs`);
    console.log(`   Difference: ${Math.abs(oddLabCount - evenLabCount)} labs`);
    console.log(`   Ratio: ${(evenLabCount / oddLabCount).toFixed(2)}:1 (EVEN:ODD)\n`);

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

// Run analysis
analyzeSubjectsAndLabs();
