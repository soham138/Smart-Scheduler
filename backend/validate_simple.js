const pool = require('./src/config/db');

(async () => {
  try {
    // Get Computer Engineering branch
    const branchRes = await pool.query(`
      SELECT branch_id, name FROM branches WHERE name = 'Computer Engineering'
    `);
    
    if (branchRes.rows.length === 0) {
      console.log('ERROR: Computer Engineering branch not found');
      process.exit(1);
    }

    const branchId = branchRes.rows[0].branch_id;
    const semester = 1;

    console.log('\n' + '='.repeat(80));
    console.log('TIMETABLE VALIDATION - Computer Engineering Semester 1');
    console.log('='.repeat(80) + '\n');

    // Get subject requirements
    const subjectsRes = await pool.query(`
      SELECT 
        s.subject_id, 
        s.code as subject_code,
        s.name as subject_name,
        s.weekly_lecture_count as lecture_count,
        s.weekly_lab_count as lab_count,
        0 as tutorial_count
      FROM subjects s
      LEFT JOIN subjects_branches sb ON s.subject_id = sb.subject_id
      WHERE sb.branch_id = $1 AND s.semester = $2
      ORDER BY s.code
    `, [branchId, semester]);

    console.log('1. SUBJECT REQUIREMENTS:');
    console.log('-'.repeat(80));
    const subjectMap = {};
    subjectsRes.rows.forEach(row => {
      subjectMap[row.subject_id] = {
        code: row.subject_code,
        name: row.subject_name,
        lectures: row.lecture_count || 0,
        labs: row.lab_count || 0,
        tutorials: row.tutorial_count || 0
      };
      console.log(`${row.subject_code}: ${row.subject_name}`);
      console.log(`  Lectures: ${row.lecture_count}, Labs: ${row.lab_count}, Tutorials: ${row.tutorial_count}`);
    });

    // Get current timetable
    const ttRes = await pool.query(`
      SELECT 
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end,
        t.slot_type,
        t.subject_id,
        s.code as subject_code,
        t.batch_id,
        b.batch_number
      FROM timetable t
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN batches b ON t.batch_id = b.batch_id
      WHERE t.branch_id = $1 AND t.semester = $2
      ORDER BY t.day_of_week, t.time_slot_start
    `, [branchId, semester]);

    console.log('\n2. CURRENT ALLOCATION:');
    console.log('-'.repeat(80));

    const alloc = {};
    const occupiedSlots = new Set();
    let batchACount = 0, batchBCount = 0;

    ttRes.rows.forEach(row => {
      // Track allocation
      const key = `${row.subject_id}_${row.slot_type}`;
      if (!alloc[key]) {
        alloc[key] = { code: row.subject_code, type: row.slot_type, count: 0, batches: {} };
      }
      alloc[key].count++;

      // Track batch distribution
      if (row.slot_type === 'LAB') {
        if (row.batch_number === 1) batchACount++;
        else if (row.batch_number === 2) batchBCount++;
      }

      // Track occupied slots
      occupiedSlots.add(`${row.time_slot_start}-${row.time_slot_end}`);
    });

    Object.entries(alloc).forEach(([key, data]) => {
      const [subId] = key.split('_');
      const subj = subjectMap[subId];
      if (!subj) {
        console.log(`❓ Unknown subject ${data.code} - ${data.type}: Current ${data.count}`);
        return;
      }
      const required = data.type === 'LECTURE' ? subj.lectures : data.type === 'LAB' ? subj.labs : subj.tutorials;
      const status = data.count === required ? '✅' : data.count > required ? '⚠️ OVER' : '❌ UNDER';
      console.log(`${status} ${data.code} - ${data.type}: Required ${required}, Current ${data.count}`);
    });

    // Check missing slots
    const allSlots = ['09:15-10:15', '10:15-11:15', '11:15-12:15', '12:15-13:15', '13:15-14:15', '14:15-15:15', '15:15-16:15'];
    const missingSlots = allSlots.filter(s => !occupiedSlots.has(s));

    console.log(`\n3. TIME SLOT ANALYSIS:`);
    console.log('-'.repeat(80));
    console.log(`Occupied slots: ${Array.from(occupiedSlots).sort().join(', ')}`);
    console.log(`Missing slots: ${missingSlots.length > 0 ? missingSlots.join(', ') : 'None'}`);

    if (missingSlots.includes('11:15-12:15') || missingSlots.includes('12:15-13:15')) {
      console.log(`⚠️  Key slots 11:15-12:15 and/or 12:15-13:15 not utilized!`);
    }

    console.log(`\n4. BATCH DISTRIBUTION:`);
    console.log('-'.repeat(80));
    console.log(`Batch A labs: ${batchACount}`);
    console.log(`Batch B labs: ${batchBCount}`);
    if (batchACount === batchBCount) {
      console.log(`✅ Batches equally distributed`);
    } else {
      console.log(`❌ Batch imbalance detected`);
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    process.exit(0);
  }
})();
