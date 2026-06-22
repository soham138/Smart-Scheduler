const pool = require('./src/config/db');

(async () => {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              GLOBAL TIMETABLE ANALYSIS REPORT               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Get all time slots and lab counts
    const slots = await pool.query(`
      SELECT 
        day_of_week,
        time_slot_start,
        COUNT(*) as lab_count
      FROM timetable
      WHERE slot_type = 'LAB'
      GROUP BY day_of_week, time_slot_start
      ORDER BY 
        CASE day_of_week
          WHEN 'MON' THEN 1
          WHEN 'TUE' THEN 2
          WHEN 'WED' THEN 3
          WHEN 'THU' THEN 4
          WHEN 'FRI' THEN 5
        END,
        time_slot_start
    `);

    console.log('📊 LAB DISTRIBUTION BY TIME SLOT:\n');
    
    let overloaded = [];
    let validSlots = 0;
    let totalLabs = 0;

    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    for (const day of DAYS) {
      for (const startTime of ['09:00', '11:15', '14:00']) {
        const slot = slots.rows.find(s => s.day_of_week === day && s.time_slot_start === startTime);
        const count = slot?.lab_count || 0;
        totalLabs += count;
        
        if (count === 0) {
          console.log(`  ${day} ${startTime}: [empty]`);
        } else if (count > 7) {
          console.log(`  ❌ ${day} ${startTime}: ${count} labs (OVERLOAD by ${count - 7})`);
          overloaded.push({ day, time: startTime, count, excess: count - 7 });
        } else {
          console.log(`  ✅ ${day} ${startTime}: ${count} labs`);
          validSlots++;
        }
      }
    }

    console.log(`\n📈 STATISTICS:
   Total lab slots: ${slots.rows.length} active
   Valid slots (≤7): ${validSlots}
   Overloaded slots: ${overloaded.length}
   Total labs: ${totalLabs}
   Max capacity: ${7 * 15} (7 labs × 15 time slots)\n`);

    if (overloaded.length > 0) {
      console.log('⚠️  OVERLOADED SLOTS:');
      overloaded.forEach(slot => {
        console.log(`   ${slot.day} ${slot.time}: ${slot.count} labs (excess: +${slot.excess})`);
      });
      console.log();
    }

    // Get sample of overloaded labs
    if (overloaded.length > 0) {
      const firstOverload = overloaded[0];
      console.log(`\n📋 SAMPLE: First overloaded slot (${firstOverload.day} ${firstOverload.time}):`);
      const labs = await pool.query(`
        SELECT 
          s.name as subject,
          bat.batch_number as batch,
          b.name as branch,
          t.semester
        FROM timetable t
        LEFT JOIN subjects s ON t.subject_id = s.subject_id
        LEFT JOIN batches bat ON t.batch_id = bat.batch_id
        LEFT JOIN branches b ON t.branch_id = b.branch_id
        WHERE t.slot_type = 'LAB'
          AND t.day_of_week = $1
          AND t.time_slot_start = $2
        LIMIT 10
      `, [firstOverload.day, firstOverload.time]);

      labs.rows.forEach(lab => {
        console.log(`   - ${lab.subject} | Batch ${lab.batch} | ${lab.branch} (Sem ${lab.semester})`);
      });
    }

    console.log('\n✨ Analysis complete\n');
    await pool.end();
    process.exit(0);

  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
    process.exit(1);
  }
})();
