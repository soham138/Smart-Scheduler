const pool = require('./src/config/db');

async function analyzeHiddenConflicts() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║          ANALYZING HIDDEN PROFESSOR CONFLICTS              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const rohanRes = await pool.query(`
      SELECT 
        t.timetable_id,
        t.professor_id,
        p.name as prof_name,
        s.name as subject_name,
        b.name as branch_name,
        t.semester,
        t.slot_type,
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end
      FROM timetable t
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      WHERE p.name = 'Dr. Rohan Verma'
        AND t.day_of_week = 'FRI'
        AND t.time_slot_start = '11:15:00'
      ORDER BY t.branch_id
    `);
    
    console.log('[DR. ROHAN VERMA - FRI 11:15:00]\n');
    for (const row of rohanRes.rows) {
      console.log(`  ${row.branch_name} Sem${row.semester}: ${row.subject_name} (${row.slot_type})`);
    }
    console.log(`  Total: ${rohanRes.rows.length} assignments at same time\n`);

    const harshRes = await pool.query(`
      SELECT 
        t.timetable_id,
        t.professor_id,
        p.name as prof_name,
        s.name as subject_name,
        b.name as branch_name,
        t.semester,
        t.slot_type,
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end
      FROM timetable t
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      WHERE p.name = 'Dr. Harsh Dixit'
        AND t.day_of_week = 'TUE'
        AND t.time_slot_start = '11:15:00'
      ORDER BY t.branch_id
    `);
    
    console.log('[DR. HARSH DIXIT - TUE 11:15:00]\n');
    for (const row of harshRes.rows) {
      console.log(`  ${row.branch_name} Sem${row.semester}: ${row.subject_name} (${row.slot_type})`);
    }
    console.log(`  Total: ${harshRes.rows.length} assignments at same time\n`);

    pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    pool.end();
  }
}

analyzeHiddenConflicts();
