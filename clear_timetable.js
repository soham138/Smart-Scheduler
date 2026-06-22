const pool = require('./backend/src/config/db');

(async () => {
  try {
    // Show existing count
    const before = await pool.query('SELECT COUNT(*) as count FROM timetable');
    console.log('📊 BEFORE: ' + before.rows[0].count + ' timetable entries');
    
    // Delete all entries
    await pool.query('DELETE FROM timetable');
    console.log('🗑️  Cleared all entries');
    
    // Verify deletion
    const after = await pool.query('SELECT COUNT(*) as count FROM timetable');
    console.log('✓ AFTER: ' + after.rows[0].count + ' timetable entries\n');
    
    console.log('✅ Database cleared - ready for regeneration!');
    
    await pool.end();
    process.exit(0);
  } catch(err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
