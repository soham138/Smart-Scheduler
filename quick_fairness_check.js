// Simple check: What subjects should exist vs what's generated
require('./backend/node_modules/dotenv').config({ path: './backend/.env' });
const db = require('./backend/src/config/db');

async function quickCheck() {
  try {
    console.log('Quick fairness check...\n');
    
    // Subjects that belong to branches
    const expected = await db.query(`
      SELECT DISTINCT
        s.code,
        s.name,
        s.semester,
        b.name as branch
      FROM subjects s
      JOIN subjects_branches sb ON s.subject_id = sb.subject_id
      JOIN branches b ON sb.branch_id = b.branch_id
      WHERE s.semester IN (3, 5)
      ORDER BY s.semester, s.name, b.name
      LIMIT 20;
    `);
    
    console.log('Expected (subjects assigned to branches):');
    expected.rows.forEach(r => {
      console.log(`  ${r.code} | ${r.name} | Sem ${r.semester} | ${r.branch}`);
    });
    
    console.log('\nGenerated (in timetable):');
    const generated = await db.query(`
      SELECT DISTINCT
        s.code,
        s.name,
        t.semester,
        b.name as branch,
        COUNT(*) as count
      FROM timetable t
      JOIN subjects s ON t.subject_id = s.subject_id
      JOIN branches b ON t.branch_id = b.branch_id
      WHERE t.semester IN (3, 5)
      GROUP BY s.code, s.name, t.semester, b.name
      ORDER BY t.semester, s.name, b.name
      LIMIT 20;
    `);
    
    generated.rows.forEach(r => {
      console.log(`  ${r.code} | ${r.name} | Sem ${r.semester} | ${r.branch} (${r.count})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

quickCheck();
