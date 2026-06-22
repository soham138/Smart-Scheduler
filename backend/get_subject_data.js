/**
 * Get all subjects organized by even/odd semesters
 */

const pool = require('./src/config/db');

async function getSubjectData() {
  try {
    // Get all subjects with their branches (using LEFT JOIN to include subjects with no branches)
    const result = await pool.query(`
      SELECT DISTINCT
        s.subject_id,
        s.name,
        s.code,
        s.semester,
        s.type,
        s.weekly_lecture_count,
        s.weekly_lab_count,
        b.name as branch_name,
        b.code as branch_code
      FROM subjects s
      LEFT JOIN subjects_branches sb ON s.subject_id = sb.subject_id
      LEFT JOIN branches b ON sb.branch_id = b.branch_id
      ORDER BY s.semester, s.name, b.name
    `);

    const subjects = result.rows;

    // Group subjects and combine branches
    const subjectsMap = new Map();
    for (const row of subjects) {
      const key = `${row.subject_id}`;
      
      if (!subjectsMap.has(key)) {
        subjectsMap.set(key, {
          subject_id: row.subject_id,
          name: row.name,
          code: row.code,
          semester: row.semester,
          type: row.type,
          weekly_lecture_count: row.weekly_lecture_count,
          weekly_lab_count: row.weekly_lab_count,
          branches: []
        });
      }
      
      // Add branch if it exists
      if (row.branch_name) {
        const branch = subjectsMap.get(key).branches;
        const branchExists = branch.some(b => b.name === row.branch_name);
        if (!branchExists) {
          branch.push({
            name: row.branch_name,
            code: row.branch_code
          });
        }
      }
    }
    
    // Convert to array and process
    const uniqueSubjects = Array.from(subjectsMap.values());

    // Organize by odd and even semesters
    const oddSemesters = {};
    const evenSemesters = {};

    for (const subject of uniqueSubjects) {
      const sem = subject.semester;

      if (sem % 2 === 1) {
        // Odd semester
        if (!oddSemesters[sem]) {
          oddSemesters[sem] = [];
        }
        oddSemesters[sem].push(subject);
      } else {
        // Even semester
        if (!evenSemesters[sem]) {
          evenSemesters[sem] = [];
        }
        evenSemesters[sem].push(subject);
      }
    }

    // Print ODD SEMESTERS TABLE
    console.log('\n════════════════════════════════════════════════════════════════════════════════════════════\n');
    console.log('📚 ODD SEMESTERS (1, 3, 5, 7)');
    console.log('\n════════════════════════════════════════════════════════════════════════════════════════════\n');

    for (const sem of [1, 3, 5, 7]) {
      if (oddSemesters[sem] && oddSemesters[sem].length > 0) {
        console.log(`\n┌─── SEMESTER ${sem} ───────────────────────────────────────────────────────────────────────┐`);
        console.log(`│ Total Subjects: ${oddSemesters[sem].length}`);
        console.log(`└────────────────────────────────────────────────────────────────────────────────────────┘\n`);

        // Create table
        const data = oddSemesters[sem].map((s, idx) => ({
          'No': idx + 1,
          'Subject Name': s.name,
          'Type': s.type,
          'Lectures/Week': s.weekly_lecture_count || '-',
          'Labs/Week': s.weekly_lab_count || '-',
          'Branches': s.branches.length > 0 ? s.branches.map(b => `${b.name} (${b.code})`).join('; ') : 'All Branches'
        }));

        console.table(data);
      }
    }

    // Print EVEN SEMESTERS TABLE
    console.log('\n════════════════════════════════════════════════════════════════════════════════════════════\n');
    console.log('📚 EVEN SEMESTERS (2, 4, 6, 8)');
    console.log('\n════════════════════════════════════════════════════════════════════════════════════════════\n');

    for (const sem of [2, 4, 6, 8]) {
      if (evenSemesters[sem] && evenSemesters[sem].length > 0) {
        console.log(`\n┌─── SEMESTER ${sem} ───────────────────────────────────────────────────────────────────────┐`);
        console.log(`│ Total Subjects: ${evenSemesters[sem].length}`);
        console.log(`└────────────────────────────────────────────────────────────────────────────────────────┘\n`);

        // Create table
        const data = evenSemesters[sem].map((s, idx) => ({
          'No': idx + 1,
          'Subject Name': s.name,
          'Type': s.type,
          'Lectures/Week': s.weekly_lecture_count || '-',
          'Labs/Week': s.weekly_lab_count || '-',
          'Branches': s.branches.length > 0 ? s.branches.map(b => `${b.name} (${b.code})`).join('; ') : 'All Branches'
        }));

        console.table(data);
      }
    }

    // Print SUMMARY TABLE
    console.log('\n════════════════════════════════════════════════════════════════════════════════════════════\n');
    console.log('📊 SUMMARY');
    console.log('\n════════════════════════════════════════════════════════════════════════────────────────────\n');

    const summary = [];
    for (let sem = 1; sem <= 8; sem++) {
      const sems = sem % 2 === 1 ? oddSemesters : evenSemesters;
      const count = sems[sem] ? sems[sem].length : 0;
      const semType = sem % 2 === 1 ? 'ODD' : 'EVEN';
      summary.push({
        'Semester': `Sem ${sem}`,
        'Type': semType,
        'Total Subjects': count,
        'Theory/Both': sems[sem] ? sems[sem].filter(s => s.type !== 'LAB').length : 0,
        'Lab Only': sems[sem] ? sems[sem].filter(s => s.type === 'LAB').length : 0
      });
    }

    console.table(summary);

    // Overall stats
    const totalSubjects = uniqueSubjects.length;
    const totalTheory = uniqueSubjects.filter(s => s.type === 'THEORY').length;
    const totalLab = uniqueSubjects.filter(s => s.type === 'LAB').length;
    const totalBoth = uniqueSubjects.filter(s => s.type === 'BOTH').length;

    console.log('\n════════════════════════════════════════════════════════════════════════════════════════════\n');
    console.log('📈 OVERALL STATISTICS');
    console.log('──────────────────────────────────────────────────────────────────────────────────────────\n');
    console.log(`   Total Subjects: ${totalSubjects}`);
    console.log(`   • Theory Only:  ${totalTheory}`);
    console.log(`   • Lab Only:     ${totalLab}`);
    console.log(`   • Theory + Lab: ${totalBoth}`);
    console.log(`\n   Odd Semesters Total:  ${Object.values(oddSemesters).flat().length}`);
    console.log(`   Even Semesters Total: ${Object.values(evenSemesters).flat().length}`);
    console.log('\n════════════════════════════════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

getSubjectData();
