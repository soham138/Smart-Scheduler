const pool = require('./src/config/db');

async function showConflicts() {
  try {
    console.log('\n=== CHECKING FOR CONFLICTS ===\n');
    
    // Get all timetable entries grouped by branch and semester
    const result = await pool.query(`
      SELECT 
        day_of_week,
        time_slot_start,
        time_slot_end,
        slot_type,
        subject_id,
        professor_id,
        batch_id,
        COUNT(*) as count
      FROM timetable
      GROUP BY day_of_week, time_slot_start, time_slot_end, slot_type, subject_id, professor_id, batch_id
      HAVING COUNT(*) > 1
      ORDER BY day_of_week, time_slot_start
    `);
    
    console.log('Duplicate slots found:', result.rows.length);
    
    if (result.rows.length > 0) {
      console.log('\nPotential conflicts (slots with >1 entry):');
      result.rows.forEach((row, idx) => {
        console.log(row.day_of_week + ' ' + row.time_slot_start + '-' + row.time_slot_end + ': ' + row.count + ' entries');
      });
    }
    
    // Get professor schedule
    const profResult = await pool.query(`
      SELECT 
        professor_id,
        day_of_week,
        time_slot_start,
        time_slot_end,
        COUNT(*) as count
      FROM timetable
      WHERE professor_id IS NOT NULL
      GROUP BY professor_id, day_of_week, time_slot_start, time_slot_end
      HAVING COUNT(*) > 1
    `);
    
    console.log('\nProfessor double bookings:', profResult.rows.length);
    
    process.exit(0);
  } catch (err) {
    console.log('Error:', err.message);
    console.log(err.stack);
    process.exit(1);
  }
}

showConflicts();
