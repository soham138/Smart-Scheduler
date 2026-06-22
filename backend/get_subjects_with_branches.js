#!/usr/bin/env node
/**
 * Get all subjects organized by even/odd semesters with branch information
 */

const pool = require('./src/config/db');
const fs = require('fs');

async function getSubjectData() {
  let output = '';

  try {
    console.log('Fetching subject and branch data...');

    // Get all subjects with their branches
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
    
    // Convert to array
    const uniqueSubjects = Array.from(subjectsMap.values());

    // Organize by odd and even semesters
    const oddSemesters = {};
    const evenSemesters = {};

    for (const subject of uniqueSubjects) {
      const sem = subject.semester;

      if (sem % 2 === 1) {
        if (!oddSemesters[sem]) oddSemesters[sem] = [];
        oddSemesters[sem].push(subject);
      } else {
        if (!evenSemesters[sem]) evenSemesters[sem] = [];
        evenSemesters[sem].push(subject);
      }
    }

    // ODD SEMESTERS
    output += '\n╔════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║  📚 ODD SEMESTERS (1, 3, 5, 7) - WITH BRANCH INFORMATION                            ║\n';
    output += '╚════════════════════════════════════════════════════════════════════════════════════════╝\n';

    for (const sem of [1, 3, 5, 7]) {
      if (oddSemesters[sem] && oddSemesters[sem].length > 0) {
        output += `\n┌─ SEMESTER ${sem} (${oddSemesters[sem].length} subjects) ───────────────────────────────────────────┐\n`;
        output += '│\n';
        
        for (const [idx, s] of oddSemesters[sem].entries()) {
          const branchStr = s.branches.length > 0 
            ? s.branches.map(b => b.code).join(', ')
            : 'All Branches';
          output += `│ ${idx + 1}. ${s.name.padEnd(35)} | ${s.type.padEnd(8)} | Lec: ${String(s.weekly_lecture_count || '-').padEnd(2)} | Lab: ${String(s.weekly_lab_count || '-').padEnd(2)} | ${branchStr}\n`;
        }
        output += '│\n';
        output += '└───────────────────────────────────────────────────────────────────────────────────────────┘\n';
      }
    }

    // EVEN SEMESTERS
    output += '\n╔════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║  📚 EVEN SEMESTERS (2, 4, 6, 8) - WITH BRANCH INFORMATION                           ║\n';
    output += '╚════════════════════════════════════════════════════════════════════════════════════════╝\n';

    for (const sem of [2, 4, 6, 8]) {
      if (evenSemesters[sem] && evenSemesters[sem].length > 0) {
        output += `\n┌─ SEMESTER ${sem} (${evenSemesters[sem].length} subjects) ───────────────────────────────────────────┐\n`;
        output += '│\n';
        
        for (const [idx, s] of evenSemesters[sem].entries()) {
          const branchStr = s.branches.length > 0 
            ? s.branches.map(b => b.code).join(', ')
            : 'All Branches';
          output += `│ ${idx + 1}. ${s.name.padEnd(35)} | ${s.type.padEnd(8)} | Lec: ${String(s.weekly_lecture_count || '-').padEnd(2)} | Lab: ${String(s.weekly_lab_count || '-').padEnd(2)} | ${branchStr}\n`;
        }
        output += '│\n';
        output += '└───────────────────────────────────────────────────────────────────────────────────────────┘\n';
      }
    }

    // SUMMARY
    output += '\n╔════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║  📊 BRANCH-WISE SUBJECT DISTRIBUTION                                                  ║\n';
    output += '╚════════════════════════════════════════════════════════════════════════════════════════╝\n\n';

    // Count subjects per branch
    const branchCount = {};
    for (const subject of uniqueSubjects) {
      if (subject.branches.length > 0) {
        for (const branch of subject.branches) {
          branchCount[branch.code] = (branchCount[branch.code] || 0) + 1;
        }
      }
    }

    for (const [code, count] of Object.entries(branchCount).sort()) {
      output += `│ ${code.padEnd(10)}: ${count} subjects\n`;
    }

    // Count common subjects (in multiple branches)
    const commonSubjects = uniqueSubjects.filter(s => s.branches.length > 1);
    output += `\n│ Common Subjects (Multiple Branches): ${commonSubjects.length}\n`;

    output += '\n╔════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║  📈 OVERALL STATISTICS                                                                ║\n';
    output += '╚════════════════════════════════════════════════════════════════════════════════════════╝\n\n';

    const totalSubjects = uniqueSubjects.length;
    const totalTheory = uniqueSubjects.filter(s => s.type === 'THEORY').length;
    const totalLab = uniqueSubjects.filter(s => s.type === 'LAB').length;
    const totalBoth = uniqueSubjects.filter(s => s.type === 'BOTH').length;

    output += `   Total Subjects:              ${totalSubjects}\n`;
    output += `   • Theory Only:               ${totalTheory}\n`;
    output += `   • Lab Only:                  ${totalLab}\n`;
    output += `   • Theory + Lab (BOTH):       ${totalBoth}\n`;
    output += `\n   Odd Semesters (1,3,5,7):     ${Object.values(oddSemesters).flat().length} subjects\n`;
    output += `   Even Semesters (2,4,6,8):    ${Object.values(evenSemesters).flat().length} subjects\n`;
    output += '\n╔════════════════════════════════════════════════════════════════════════════════════════╗\n\n';

    console.log(output);

    // Save to file
    fs.writeFileSync('./subject_data_with_branches.txt', output, 'utf8');
    console.log('✓ Output saved to: subject_data_with_branches.txt\n');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

getSubjectData();
