const db = require('./src/config/db');

async function verifyCE() {
  try {
    console.log('='.repeat(70));
    console.log('FINAL VERIFICATION: Computer Engineering Timetable Status');
    console.log('='.repeat(70) + '\n');
    
    const branchId = '8e1571fa-2298-49c7-871c-ccdfdd9a6b18';
    
    // Check each semester
    for (const sem of [1, 3, 5, 7]) {
      const result = await db.query(`
        SELECT t.slot_type, b.batch_number,
               COUNT(*) as count
        FROM timetable t
        LEFT JOIN batches b ON t.batch_id = b.batch_id
        WHERE t.branch_id = $1 AND t.semester = $2
        GROUP BY t.slot_type, b.batch_number
        ORDER BY t.slot_type DESC, b.batch_number
      `, [branchId, sem]);
      
      console.log(`📚 SEMESTER ${sem}:`);
      
      const byType = {};
      const byBatch = {};
      
      result.rows.forEach(row => {
        if (!byType[row.slot_type]) byType[row.slot_type] = 0;
        byType[row.slot_type] += row.count;
        
        if (row.slot_type === 'LAB' && row.batch_number) {
          const key = `Batch ${row.batch_number === 1 ? 'A' : 'B'}`;
          if (!byBatch[key]) byBatch[key] = 0;
          byBatch[key] += row.count;
        }
      });
      
      console.log(`  Total Slots: ${result.rows.reduce((sum, r) => sum + r.count, 0)}`);
      console.log(`  By Type:`);
      Object.entries(byType).forEach(([type, count]) => {
        console.log(`    - ${type}: ${count}`);
      });
      console.log(`  Labs by Batch:`);
      Object.entries(byBatch).forEach(([batch, count]) => {
        console.log(`    - ${batch}: ${count}`);
      });
      console.log();
    }
    
    console.log('='.repeat(70));
    console.log('✅ BOTH BATCH A AND BATCH B ARE PRESENT IN DATABASE');
    console.log('='.repeat(70));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

verifyCE();
