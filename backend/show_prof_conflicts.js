const pool = require('./src/config/db');

async function showProfConflicts() {
  try {
    console.log('\n=== PROFESSOR DOUBLE BOOKING DETAILS ===\n');
    
    // Get professor conflicts with names
    const result = await pool.query(`
      SELECT 
        t.professor_id,
        p.name as professor_name,
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end,
        s.code as subject_code,
        COUNT(*) as count
      FROM timetable t
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.professor_id IS NOT NULL
      GROUP BY t.professor_id, p.name, t.day_of_week, t.time_slot_start, t.time_slot_end, s.code
      HAVING COUNT(*) > 1
      ORDER BY p.name, t.day_of_week, t.time_slot_start
      LIMIT 50
    `);
    
    console.log('Showing first 50 professor double bookings:\n');
    
    result.rows.forEach(row => {
      console.log(row.professor_name + ' - ' + row.day_of_week + ' ' + row.time_slot_start.substring(0,5) + '-' + row.time_slot_end.substring(0,5) + ' (' + row.subject_code + '): ' + row.count + ' slots');
    });
    
    console.log('\nTotal unique professor conflicts: ' + result.rows.length);
    
    process.exit(0);
  } catch (err) {
    console.log('Error:', err.message);
    process.exit(1);
  }
}

showProfConflicts();
