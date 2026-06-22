const pool = require('./backend/src/config/db');
const TimetableAlgorithm = require('./backend/src/algorithms/TimetableAlgorithm');

async function clearAndRegenerate() {
  try {
    console.log('\n🔴 CLEARING EXISTING TIMETABLES...\n');
    
    // Clear all timetables
    await pool.query('DELETE FROM timetables');
    console.log('✓ Cleared all timetables');
    
    // Get all branches
    const branches = await pool.query('SELECT branch_id, name FROM branches');
    console.log(`\n📊 Regenerating for ${branches.rows.length} branches...\n`);
    
    // Generate for each branch, semesters 1-3 only
    for (const branch of branches.rows) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🏫 BRANCH: ${branch.name} (${branch.branch_id})`);
      console.log(`${'='.repeat(60)}`);
      
      for (let sem = 1; sem <= 3; sem++) {
        console.log(`\n📚 Generating Semester ${sem}...`);
        const algorithm = new TimetableAlgorithm(branch.branch_id, sem);
        const result = await algorithm.generate();
        
        if (result.success) {
          console.log(`✅ Semester ${sem}: Generated ${result.timetable?.length || 0} slots`);
        } else {
          console.error(`❌ Semester ${sem}: ${result.error}`);
        }
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ REGENERATION COMPLETE');
    console.log(`${'='.repeat(60)}\n`);
    
    // Check final stats
    const stats = await pool.query(`
      SELECT 
        slot_type,
        COUNT(*) as count,
        COUNT(DISTINCT day_of_week) as days_used,
        COUNT(DISTINCT time_slot_start) as slots_used
      FROM timetables
      GROUP BY slot_type
      ORDER BY slot_type
    `);
    
    console.log('\n📈 FINAL STATISTICS:');
    stats.rows.forEach(row => {
      console.log(`  ${row.slot_type}: ${row.count} entries`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

clearAndRegenerate();
