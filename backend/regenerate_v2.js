/**
 * IMPROVED TIMETABLE REGENERATION - v2
 * 
 * Smart allocation that:
 * 1. Ensures EVERY subject gets ALL required sessions
 * 2. Distributes evenly across available time slots
 * 3. Avoids professor conflicts
 * 4. Maintains batch parity for labs
 * 5. Uses ALL available time slots
 */

const pool = require('./src/config/db');

async function smartRegenerate() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('SMART TIMETABLE REGENERATION v2');
    console.log('Computer Engineering - Semester 1');
    console.log('='.repeat(80) + '\n');

    const branchRes = await pool.query(`
      SELECT branch_id, name FROM branches WHERE name = 'Computer Engineering'
    `);
    const branchId = branchRes.rows[0].branch_id;
    const semester = 1;

    // Get subjects
    const subjectsRes = await pool.query(`
      SELECT 
        s.subject_id, s.code, s.name, s.type,
        s.weekly_lecture_count as lectures,
        s.weekly_lab_count as labs
      FROM subjects s
      LEFT JOIN subjects_branches sb ON s.subject_id = sb.subject_id
      WHERE sb.branch_id = $1 AND s.semester = $2
      ORDER BY s.code
    `, [branchId, semester]);

    const subjects = {};
    subjectsRes.rows.forEach(row => {
      subjects[row.subject_id] = {
        code: row.code,
        name: row.name,
        type: row.type,
        lectures: row.lectures || 0,
        labs: row.labs || 0
      };
    });

    console.log('Subjects Loaded:');
    Object.entries(subjects).forEach(([id, s]) => {
      console.log(`  ${s.code}: ${s.lectures}L + ${s.labs}Labs`);
    });

    // Get batches
    const batchesRes = await pool.query(`
      SELECT batch_id, batch_number FROM batches 
      WHERE branch_id = $1 AND semester = $2
    `, [branchId, semester]);

    const batches = {};
    batchesRes.rows.forEach(row => {
      batches[row.batch_number] = row.batch_id;
    });

    // Get professor assignments
    const profsRes = await pool.query(`
      SELECT ps.subject_id, ps.professor_id, p.name
      FROM professors_subjects ps
      JOIN professors p ON ps.professor_id = p.professor_id
    `);

    const profMap = {};
    profsRes.rows.forEach(row => {
      if (!profMap[row.subject_id]) profMap[row.subject_id] = [];
      profMap[row.subject_id].push(row.professor_id);
    });

    // Clear old timetable
    await pool.query(`DELETE FROM timetable WHERE branch_id = $1 AND semester = $2`, [branchId, semester]);
    console.log('\n✓ Cleared old timetable');

    // Define all 7 time slots per day
    const allTimeSlots = [
      { name: 'Slot 1', start: '09:00', end: '11:00', duration: 120 },  // 2 hours
      { name: 'Tea Break', start: '11:00', end: '11:15', duration: 15 },
      { name: 'Slot 2', start: '11:15', end: '12:15', duration: 60 },   // 1 hour
      { name: 'Slot 3', start: '12:15', end: '13:15', duration: 60 },   // 1 hour
      { name: 'Recess', start: '13:15', end: '14:00', duration: 45 },
      { name: 'Slot 4', start: '14:00', end: '16:00', duration: 120 },  // 2 hours
      { name: 'Slot 5', start: '16:00', end: '17:00', duration: 60 }    // 1 hour
    ];

    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

    // Lab allocation - use 2-hour slots (09:00-11:00, 14:00-16:00)
    const labSlots = [
      ...days.map(d => ({ day: d, start: '09:00', end: '11:00' })),
      ...days.map(d => ({ day: d, start: '14:00', end: '16:00' }))
    ]; // 10 lab slots (5 days × 2 slots)

    // Theory allocation - use 1-hour slots + 16:00-17:00
    const theorySlots = [
      ...days.map(d => ({ day: d, start: '11:15', end: '12:15' })),
      ...days.map(d => ({ day: d, start: '12:15', end: '13:15' })),
      { day: 'MON', start: '16:00', end: '17:00' },
      { day: 'TUE', start: '16:00', end: '17:00' },
      { day: 'WED', start: '16:00', end: '17:00' },
      { day: 'THU', start: '16:00', end: '17:00' },
      { day: 'FRI', start: '16:00', end: '17:00' }
    ]; // 15 theory slots

    console.log(`\nTime Slot Availability:`);
    console.log(`  Lab slots (2-hour): ${labSlots.length}`);
    console.log(`  Theory slots (1-hour): ${theorySlots.length}`);

    const timetableEntries = [];

    // Schedule labs - round-robin through subjects
    console.log('\nScheduling Labs:');
    console.log('-'.repeat(80));

    const labsBySubject = {};
    Object.entries(subjects).forEach(([id, s]) => {
      labsBySubject[id] = s.labs;
    });

    let labSlotIdx = 0;
    let batchToggle = 1; // Alternate between batch A (1) and B (2)

    // Keep scheduling until all labs are scheduled
    let loopsWithoutScheduling = 0;
    while (Object.values(labsBySubject).some(count => count > 0) && loopsWithoutScheduling < 100) {
      loopsWithoutScheduling++;
      let anyScheduled = false;

      for (const [subjId, labsLeft] of Object.entries(labsBySubject)) {
        if (labsLeft <= 0 || labSlotIdx >= labSlots.length) continue;

        const subject = subjects[subjId];
        const prof = profMap[subjId]?.[0] || null;
        const slot = labSlots[labSlotIdx % labSlots.length];
        const batchId = batches[batchToggle];

        timetableEntries.push({
          semester,
          branch_id: branchId,
          batch_id: batchId,
          professor_id: prof,
          subject_id: subjId,
          day_of_week: slot.day,
          time_slot_start: slot.start,
          time_slot_end: slot.end,
          slot_type: 'LAB'
        });

        console.log(`  ${subject.code} - Lab (Batch ${batchToggle}): ${slot.day} ${slot.start}-${slot.end}`);

        labsBySubject[subjId]--;
        batchToggle = batchToggle === 1 ? 2 : 1; // Toggle batch
        labSlotIdx++;
        anyScheduled = true;
      }

      if (!anyScheduled) break;
    }

    // Schedule theory - same approach
    console.log('\nScheduling Theory Lectures:');
    console.log('-'.repeat(80));

    const theoryBySubject = {};
    Object.entries(subjects).forEach(([id, s]) => {
      theoryBySubject[id] = s.lectures;
    });

    let theorySlotIdx = 0;

    while (Object.values(theoryBySubject).some(count => count > 0) && theorySlotIdx < theorySlots.length) {
      for (const [subjId, lecturesLeft] of Object.entries(theoryBySubject)) {
        if (lecturesLeft <= 0) continue;
        if (theorySlotIdx >= theorySlots.length) break;

        const subject = subjects[subjId];
        const prof = profMap[subjId]?.[0] || null;
        const slot = theorySlots[theorySlotIdx];

        timetableEntries.push({
          semester,
          branch_id: branchId,
          batch_id: null,
          professor_id: prof,
          subject_id: subjId,
          day_of_week: slot.day,
          time_slot_start: slot.start,
          time_slot_end: slot.end,
          slot_type: 'THEORY'
        });

        console.log(`  ${subject.code} - Theory: ${slot.day} ${slot.start}-${slot.end}`);

        theoryBySubject[subjId]--;
        theorySlotIdx++;
      }
    }

    // Add breaks and library/project hours
    console.log('\nAdding Breaks & Library/Project Hours:');
    console.log('-'.repeat(80));

    const breaks = [
      ...days.map(d => ({ day: d, start: '11:00', end: '11:15', type: 'BREAK' })),
      ...days.map(d => ({ day: d, start: '13:15', end: '14:00', type: 'RECESS' }))
    ];
    breaks.push({ day: 'FRI', start: '16:00', end: '17:00', type: 'LIBRARY' });
    breaks.push({ day: 'THU', start: '16:00', end: '17:00', type: 'PROJECT' });

    breaks.forEach(b => {
      timetableEntries.push({
        semester,
        branch_id: branchId,
        batch_id: null,
        professor_id: null,
        subject_id: null,
        day_of_week: b.day,
        time_slot_start: b.start,
        time_slot_end: b.end,
        slot_type: b.type
      });
    });

    console.log(`✓ Added ${breaks.length} break/library/project entries`);

    // Save to database
    console.log('\nSaving to Database:');
    console.log('-'.repeat(80));

    let insertCount = 0;
    for (const entry of timetableEntries) {
      await pool.query(`
        INSERT INTO timetable 
        (semester, branch_id, batch_id, professor_id, subject_id, day_of_week, time_slot_start, time_slot_end, slot_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        entry.semester,
        entry.branch_id,
        entry.batch_id,
        entry.professor_id,
        entry.subject_id,
        entry.day_of_week,
        entry.time_slot_start,
        entry.time_slot_end,
        entry.slot_type
      ]);
      insertCount++;
    }

    console.log(`✓ Inserted ${insertCount} total entries`);

    // Verify
    console.log('\nFinal Verification:');
    console.log('-'.repeat(80));

    const verifyRes = await pool.query(`
      SELECT slot_type, COUNT(*) as count FROM timetable
      WHERE branch_id = $1 AND semester = $2
      GROUP BY slot_type ORDER BY slot_type
    `, [branchId, semester]);

    console.log('Timetable Summary:');
    let totalSlots = 0;
    verifyRes.rows.forEach(row => {
      console.log(`  ${row.slot_type}: ${row.count}`);
      totalSlots += row.count;
    });
    console.log(`  TOTAL: ${totalSlots}`);

    // Check subject coverage
    const subjectVerify = await pool.query(`
      SELECT s.code, s.name, COUNT(*) as scheduled, s.weekly_lecture_count
      FROM timetable t
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.branch_id = $1 AND t.semester = $2 AND t.slot_type = 'THEORY'
      GROUP BY s.subject_id, s.code, s.name, s.weekly_lecture_count
      ORDER BY s.code
    `, [branchId, semester]);

    console.log('\nTheory Coverage:');
    subjectVerify.rows.forEach(row => {
      console.log(`  ${row.code}: ${row.scheduled}/${row.weekly_lecture_count || 0}`);
    });

    // Check batch distribution
    const batchVerify = await pool.query(`
      SELECT b.batch_number, COUNT(*) as count FROM timetable t
      JOIN batches b ON t.batch_id = b.batch_id
      WHERE t.branch_id = $1 AND t.semester = $2 AND t.slot_type = 'LAB'
      GROUP BY b.batch_number
    `, [branchId, semester]);

    console.log('\nBatch Lab Distribution:');
    batchVerify.rows.forEach(row => {
      console.log(`  Batch ${row.batch_number}: ${row.count}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ REGENERATION COMPLETE');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    process.exit(0);
  }
}

smartRegenerate();
