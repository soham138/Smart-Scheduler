// Reassign MIN3, OBJ3, MIN5 to OTHER professors (not Geeta) for fair distribution
require('./backend/node_modules/dotenv').config({ path: './backend/.env' });
const db = require('./backend/src/config/db');

async function fairAssignmentFix() {
  try {
    console.log('🔧 FIXING UNFAIR DISTRIBUTION...\n');
    console.log('Goal: Remove Geeta from MIN3, OBJ3, MIN5');
    console.log('      Assign to OTHER professors for balance\n');
    
    // Step 1: Find all professors (except Geeta)
    const allProfs = await db.query(`
      SELECT professor_id, name FROM professors 
      WHERE name NOT ILIKE '%Geeta%'
      ORDER BY name
      LIMIT 10
    `);
    
    console.log('📋 Available Professors (excluding Geeta):\n');
    allProfs.rows.forEach((p, i) => {
      console.log(`   ${i+1}. ${p.name} (ID: ${p.professor_id.substring(0, 8)}...)`);
    });
    
    // Step 2: Get the subjects that need reassignment
    const subjects = await db.query(`
      SELECT 
        ps.professor_id,
        s.subject_id,
        s.code,
        s.name,
        s.semester
      FROM professors_subjects ps
      JOIN subjects s ON ps.subject_id = s.subject_id
      JOIN professors p ON ps.professor_id = p.professor_id
      WHERE p.name ILIKE '%Geeta%'
      AND s.code IN ('MIN3', 'OBJ3', 'MIN5')
      ORDER BY s.code;
    `);
    
    console.log(`\n📌 Subjects to REASSIGN (currently with Geeta):\n`);
    subjects.rows.forEach(s => {
      console.log(`   ${s.code} - ${s.name} (Sem ${s.semester})`);
    });
    
    if (subjects.rows.length === 0) {
      console.log('\n✅ Already fixed! Geeta has no MIN3, OBJ3, MIN5');
      process.exit(0);
    }
    
    console.log(`\n⚠️ NEXT STEP: Choose which professor gets each subject`);
    console.log(`   Option 1: Remove all (professors will TBD later)`);
    console.log(`   Option 2: Assign to specific professor`);
    console.log(`   Option 3: Keep current (don't fix)\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fairAssignmentFix();
