const pool = require('./src/config/db');

async function analyzeTimetable() {
  try {
    console.log('📊 TIMETABLE ANALYSIS\n');
    console.log('='.repeat(80));

    // Get branch and semester options
    const branchRes = await pool.query('SELECT DISTINCT branch_id FROM batches LIMIT 1');
    const branchId = branchRes.rows[0]?.branch_id;
    
    if (!branchId) {
      console.log('No timetable data found');
      await pool.end();
      process.exit(0);
    }

    const ttRes = await pool.query(`
      SELECT 
        DISTINCT semester
      FROM timetable
      WHERE branch_id = $1
      ORDER BY semester
    `, [branchId]);

    if (ttRes.rows.length === 0) {
      console.log('❌ No timetable generated yet');
      await pool.end();
      process.exit(0);
    }

    for (const semRow of ttRes.rows) {
      const semester = semRow.semester;
      console.log(`\n🔍 SEMESTER ${semester}\n`);

      // 1. Count theory vs lab
      const typeRes = await pool.query(`
        SELECT slot_type, COUNT(*) as count
        FROM timetable
        WHERE branch_id = $1 AND semester = $2 AND slot_type IN ('THEORY', 'LAB')
        GROUP BY slot_type
      `, [branchId, semester]);

      console.log('📌 Slot Count:');
      typeRes.rows.forEach(row => {
        console.log(`   ${row.slot_type}: ${row.count} slots`);
      });

      // 2. Count theory per subject
      const theoryRes = await pool.query(`
        SELECT 
          s.code,
          s.name,
          s.weekly_lecture_count,
          COUNT(*) as scheduled
        FROM timetable t
        LEFT JOIN subjects s ON t.subject_id = s.subject_id
        WHERE t.branch_id = $1 AND t.semester = $2 AND t.slot_type = 'THEORY'
        GROUP BY s.code, s.name, s.weekly_lecture_count
        ORDER BY s.code
      `, [branchId, semester]);

      console.log('\n📚 THEORY LECTURES:');
      theoryRes.rows.forEach(row => {
        const expected = row.weekly_lecture_count || 0;
        const status = row.scheduled >= expected ? '✓' : '❌';
        console.log(`   ${status} ${row.code}: ${row.scheduled}/${expected} lectures`);
      });

      // 3. Check for overlapping theory
      const overlapRes = await pool.query(`
        SELECT 
          t1.day_of_week,
          t1.time_slot_start,
          t1.time_slot_end,
          COUNT(*) as count,
          STRING_AGG(DISTINCT s.code, ', ') as subjects
        FROM timetable t1
        LEFT JOIN subjects s ON t1.subject_id = s.subject_id
        WHERE t1.branch_id = $1 AND t1.semester = $2 AND t1.slot_type = 'THEORY'
        GROUP BY t1.day_of_week, t1.time_slot_start, t1.time_slot_end
        HAVING COUNT(*) > 1
      `, [branchId, semester]);

      if (overlapRes.rows.length > 0) {
        console.log('\n❌ OVERLAPPING THEORY SLOTS:');
        overlapRes.rows.forEach(row => {
          console.log(`   ${row.day_of_week} ${row.time_slot_start}-${row.time_slot_end}: ${row.count} subjects (${row.subjects})`);
        });
      } else {
        console.log('\n✓ No overlapping theory slots');
      }

      // 4. Lab count per subject
      const labRes = await pool.query(`
        SELECT 
          s.code,
          s.name,
          s.weekly_lab_count,
          COUNT(*) as scheduled
        FROM timetable t
        LEFT JOIN subjects s ON t.subject_id = s.subject_id
        WHERE t.branch_id = $1 AND t.semester = $2 AND t.slot_type = 'LAB'
        GROUP BY s.code, s.name, s.weekly_lab_count
        ORDER BY s.code
      `, [branchId, semester]);

      console.log('\n🔬 LABORATORY SESSIONS:');
      labRes.rows.forEach(row => {
        const expected = row.weekly_lab_count || 0;
        const status = row.scheduled <= expected ? '✓' : '❌';
        console.log(`   ${status} ${row.code}: ${row.scheduled}/${expected} labs`);
      });

      // 5. Check overlapping batches (theory + lab at same time)
      const batchOverlapRes = await pool.query(`
        SELECT DISTINCT
          t1.day_of_week,
          t1.time_slot_start,
          t1.time_slot_end,
          s1.code,
          COUNT(DISTINCT t1.batch_id) as batch_count
        FROM timetable t1
        LEFT JOIN subjects s1 ON t1.subject_id = s1.subject_id
        WHERE t1.branch_id = $1 AND t1.semester = $2 AND t1.slot_type = 'THEORY'
        GROUP BY t1.day_of_week, t1.time_slot_start, t1.time_slot_end, s1.code
        HAVING COUNT(DISTINCT t1.batch_id) > 1
      `, [branchId, semester]);

      if (batchOverlapRes.rows.length > 0) {
        console.log('\n⚠️  BATCH OVERLAPS (Theory):');
        batchOverlapRes.rows.forEach(row => {
          console.log(`   ${row.day_of_week} ${row.time_slot_start}-${row.time_slot_end} ${row.code}: ${row.batch_count} batches`);
        });
      }

      // 6. Lab capacity check
      const labCapRes = await pool.query(`
        SELECT 
          day_of_week,
          time_slot_start,
          time_slot_end,
          COUNT(*) as lab_count
        FROM timetable
        WHERE branch_id = $1 AND semester = $2 AND slot_type = 'LAB'
        GROUP BY day_of_week, time_slot_start, time_slot_end
        HAVING COUNT(*) > 20
        ORDER BY COUNT(*) DESC
      `, [branchId, semester]);

      if (labCapRes.rows.length > 0) {
        console.log('\n❌ LAB CAPACITY EXCEEDED (Max 20):');
        labCapRes.rows.forEach(row => {
          console.log(`   ${row.day_of_week} ${row.time_slot_start}-${row.time_slot_end}: ${row.lab_count} labs`);
        });
      } else {
        console.log('\n✓ Lab capacity within limits');
      }
    }

    console.log('\n' + '='.repeat(80));
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

analyzeTimetable();
