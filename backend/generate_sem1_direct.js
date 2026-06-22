const TimetableAlgorithm = require('./src/algorithms/TimetableAlgorithm');

async function generateDirect() {
  try {
    console.log('Generating timetable directly for branch e72b8c0f... Sem 1\n');
    const branchId = 'e72b8c0f-fb48-4f19-bedc-c2b65373be48';
    const semester = 1;
    
    const algorithm = new TimetableAlgorithm(branchId, semester);
    
    // Debug: try getting subjects directly
    console.log('Debug: Getting subjects...');
    const pool = require('./src/config/db');
    const query = `
      SELECT DISTINCT s.*, p.professor_id
      FROM subjects s
      INNER JOIN subjects_branches sb ON s.subject_id = sb.subject_id
      LEFT JOIN professors_subjects ps ON s.subject_id = ps.subject_id
      LEFT JOIN professors p ON ps.professor_id = p.professor_id
      WHERE sb.branch_id = $1 AND s.semester = $2 AND sb.is_applicable = TRUE
      ORDER BY s.type DESC, s.name;
    `;
    const result = await pool.query(query, [branchId, semester]);
    console.log('Debug: Query returned', result.rows.length, 'subjects');
    result.rows.slice(0, 3).forEach(row => {
      console.log('  -', row.name, row.type);
    });
    
    console.log('\nProceeding with generation...\n');
    const genResult = await algorithm.generate();
    
    if (genResult.success) {
      console.log('\n✅ Generation completed successfully!');
      console.log('Timetable saved:', genResult.timetable.length, 'slots');
    } else {
      console.log('\n❌ Generation failed:', genResult.error);
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
  process.exit(0);
}

generateDirect();
