const pool = require('./src/config/db');
const TimetableAlgorithm = require('./src/algorithms/TimetableAlgorithm');

async function quickTest() {
  try {
    const branchRes = await pool.query('SELECT branch_id FROM branches LIMIT 1');
    const branchId = branchRes.rows[0].branch_id;
    
    console.log('🧪 Quick Test - Semester 1 Gen');
    const algo = new TimetableAlgorithm(branchId, 1);
    const result = await algo.generate();
    
    if (result.success) {
      // Quick count
      const theoryRes = await pool.query(
        'SELECT COUNT(*) as cnt FROM timetable WHERE slot_type=$1 AND semester=$2', 
        ['THEORY', 1]
      );
      const labRes = await pool.query(
        'SELECT COUNT(*) as cnt FROM timetable WHERE slot_type=$1 AND semester=$2', 
        ['LAB', 1]
      );
      console.log(`✓ Theory: ${theoryRes.rows[0].cnt}, Labs: ${labRes.rows[0].cnt}`);
      
      // Check overlaps
      const overlapRes = await pool.query(`
        SELECT COUNT(*) FROM (
          SELECT day_of_week, time_slot_start, COUNT(*) as cnt
          FROM timetable WHERE slot_type='THEORY' AND semester=1
          GROUP BY day_of_week, time_slot_start
          HAVING COUNT(*) > 1
        ) x
      `);
      console.log(`⚠️ Overlapping slots: ${overlapRes.rows[0].count}`);
    } else {
      console.log('❌ Gen failed:', result.error);
    }
    
    await pool.end();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

quickTest();
