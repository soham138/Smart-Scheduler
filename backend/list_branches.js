const db = require('./src/config/db');

async function test() {
  try {
    console.log('Listing all branches and their subject mappings...\n');
    
    const branchesResult = await db.query(`
      SELECT b.branch_id, b.name,
             COUNT(sb.subject_id) as mapping_count
      FROM branches b
      LEFT JOIN subjects_branches sb ON b.branch_id = sb.branch_id
      GROUP BY b.branch_id, b.name
      ORDER BY b.name
    `);
    
    console.log('Branches:');
    branchesResult.rows.forEach(row => {
      console.log(`  ${row.name.padEnd(10)} | ID: ${row.branch_id} | Mappings: ${row.mapping_count}`);
    });
    
    // Find which branches have Sem 1 subjects
    console.log('\n\nBranches with Sem 1 subjects:');
    const sem1Result = await db.query(`
      SELECT DISTINCT b.branch_id, b.name,
             COUNT(DISTINCT sb.subject_id) as sem1_subjects
      FROM branches b
      INNER JOIN subjects_branches sb ON b.branch_id = sb.branch_id
      INNER JOIN subjects s ON s.subject_id = sb.subject_id
      WHERE s.semester = 1 AND sb.is_applicable = TRUE
      GROUP BY b.branch_id, b.name
      ORDER BY b.name
    `);
    
    sem1Result.rows.forEach(row => {
      console.log(`  ${row.name.padEnd(10)} | ID: ${row.branch_id} | Sem 1 subjects: ${row.sem1_subjects}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

test();
