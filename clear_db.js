const pool = require('./backend/src/config/db');

async function clearDatabase() {
  try {
    console.log('\n🔴 CLEARING DATABASE...\n');
    
    // Delete all timetable entries
    const result = await pool.query('DELETE FROM timetables;');
    console.log(`✓ Deleted ${result.rowCount} timetable entries`);
    
    console.log('\n✅ Database cleared successfully!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

clearDatabase();
