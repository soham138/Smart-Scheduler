const pool = require('./src/config/db');

async function findDuplicateLabs() {
  try {
    console.log('\n=== CHECKING FOR DUPLICATE LAB ASSIGNMENTS ===\n');
    
    // Find duplicate labs: same subject, branch, semester
    const duplicates = await pool.query(`
      SELECT 
        s.code,
        s.name,
        b.name as branch,
        t.semester,
        t.batch_id,
        COUNT(*) as lab_count,
        STRING_AGG(CONCAT(t.day_of_week, ' ', t.time_slot_start, '-', t.time_slot_end), ', ') as times
      FROM timetable t
      JOIN subjects s ON t.subject_id = s.subject_id
      JOIN branches b ON t.branch_id = b.branch_id
      WHERE t.slot_type = 'LAB'
      GROUP BY s.subject_id, s.code, s.name, b.branch_id, b.name, t.semester, t.batch_id
      HAVING COUNT(*) > 1
      ORDER BY s.code, b.name, t.semester
    `);
    
    if (duplicates.rows.length === 0) {
      console.log('✅ NO DUPLICATES FOUND - Each subject has correct lab count per batch\n');
    } else {
      console.log(`❌ FOUND ${duplicates.rows.length} DUPLICATE ISSUES:\n`);
      console.log('Code\tBranch\t\t\tSem\tBatch\tCount\tTimes');
      console.log('─'.repeat(120));
      
      duplicates.rows.forEach(row => {
        if (row.lab_count > 2) {  // More than 2 labs for same subject/batch/semester is wrong
          console.log(
            `${row.code}\t` +
            `${row.branch.padEnd(20)}\t` +
            `${row.semester}\t` +
            `${row.batch_id}\t` +
            `${row.lab_count}\t` +
            `${row.times}`
          );
        }
      });
    }
    
    // Also check: is the same lab scheduled at overlapping times for same batch?
    console.log('\n=== CHECKING FOR TIME CONFLICTS (Batch attending 2 labs simultaneously) ===\n');
    
    const conflicts = await pool.query(`
      SELECT DISTINCT
        b.name as branch,
        t.semester,
        t.batch_id,
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end,
        COUNT(*) as lab_count,
        STRING_AGG(s.code, ', ') as subjects
      FROM timetable t
      JOIN subjects s ON t.subject_id = s.subject_id
      JOIN branches b ON t.branch_id = b.branch_id
      WHERE t.slot_type = 'LAB'
      GROUP BY b.branch_id, b.name, t.semester, t.batch_id, t.day_of_week, t.time_slot_start, t.time_slot_end
      HAVING COUNT(*) > 1
      ORDER BY b.name, t.semester, t.batch_id, t.day_of_week
    `);
    
    if (conflicts.rows.length === 0) {
      console.log('✅ NO TIME CONFLICTS - No batch is double-booked for same time slot\n');
    } else {
      console.log(`⚠️  FOUND ${conflicts.rows.length} TIME OVERLAPS (might be OK if for different batches):\n`);
      console.log('Branch\t\t\tSem\tBatch\tDay\tTime\t\t\tCount\tSubjects');
      console.log('─'.repeat(140));
      
      conflicts.rows.forEach(row => {
        console.log(
          `${row.branch.padEnd(20)}\t` +
          `${row.semester}\t` +
          `${row.batch_id}\t` +
          `${row.day_of_week}\t` +
          `${row.time_slot_start}-${row.time_slot_end}\t` +
          `${row.lab_count}\t` +
          `${row.subjects}`
        );
      });
    }
    
    pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    pool.end();
  }
}

findDuplicateLabs();
