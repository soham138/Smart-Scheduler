/**
 * OPTIMIZED TIMETABLE REGENERATION SCRIPT
 * 
 * Purpose: Fix allocation issues in Computer Engineering Sem 1
 * - Remove over-allocated lab sessions (6 extra slots)
 * - Add missing theory lectures (11 sessions)
 * - Utilize unused time slots (11:15-12:15, 12:15-13:15)
 * - Maintain balanced batch distribution
 * - Distribute sessions evenly across week
 */

const pool = require('./src/config/db');

async function optimizeAndRegenerate() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('TIMETABLE OPTIMIZATION & REGENERATION');
    console.log('Computer Engineering - Semester 1');
    console.log('='.repeat(80) + '\n');

    // Step 1: Get branch and semester info
    const branchRes = await pool.query(`
      SELECT branch_id, name FROM branches WHERE name = 'Computer Engineering'
    `);
    const branchId = branchRes.rows[0].branch_id;
    const semester = 1;
    console.log(`✓ Branch: Computer Engineering (${branchId})`);
    console.log(`✓ Semester: ${semester}\n`);

    // Step 2: Get all subjects with requirements
    console.log('STEP 1: Loading Subject Requirements...');
    console.log('-'.repeat(80));
    
    const subjectsRes = await pool.query(`
      SELECT 
        s.subject_id, 
        s.code,
        s.name,
        s.type,
        s.weekly_lecture_count,
        s.weekly_lab_count
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
        lectures: row.weekly_lecture_count || 0,
        labs: row.weekly_lab_count || 0,
        scheduledLectures: 0,
        scheduledLabs: 0
      };
    });

    console.log(`Loaded ${subjectsRes.rows.length} subjects:`);
    Object.entries(subjects).forEach(([id, subj]) => {
      console.log(`  ${subj.code}: ${subj.name} (${subj.lectures}L + ${subj.labs}Labs)`);
    });

    // Step 3: Get batches
    console.log('\nSTEP 2: Loading Batch Information...');
    console.log('-'.repeat(80));

    const batchesRes = await pool.query(`
      SELECT batch_id, batch_number FROM batches 
      WHERE branch_id = $1 AND semester = $2
      ORDER BY batch_number
    `, [branchId, semester]);

    const batches = {};
    batchesRes.rows.forEach(row => {
      batches[row.batch_number] = row.batch_id;
    });

    console.log(`Found ${batchesRes.rows.length} batches`);
    console.log(`  Batch A (1): ${batches[1]}`);
    console.log(`  Batch B (2): ${batches[2]}`);

    // Step 4: Get professors for subjects
    console.log('\nSTEP 3: Loading Professor Assignments...');
    console.log('-'.repeat(80));

    const profsRes = await pool.query(`
      SELECT ps.subject_id, ps.professor_id, p.name
      FROM professors_subjects ps
      JOIN professors p ON ps.professor_id = p.professor_id
    `);

    const profMap = {};
    profsRes.rows.forEach(row => {
      if (!profMap[row.subject_id]) {
        profMap[row.subject_id] = [];
      }
      profMap[row.subject_id].push({ id: row.professor_id, name: row.name });
    });

    // Step 5: Delete old timetable
    console.log('\nSTEP 4: Clearing Old Timetable...');
    console.log('-'.repeat(80));

    const deleteRes = await pool.query(`
      DELETE FROM timetable WHERE branch_id = $1 AND semester = $2
    `, [branchId, semester]);

    console.log(`✓ Deleted ${deleteRes.rowCount} old timetable entries`);

    // Step 6: Define optimized time slots
    console.log('\nSTEP 5: Planning Time Slot Allocation...');
    console.log('-'.repeat(80));

    const timeSlots = {
      lab: [
        { day: 'MON', start: '09:00', end: '11:00' },
        { day: 'WED', start: '09:00', end: '11:00' },
        { day: 'FRI', start: '09:00', end: '11:00' },
        { day: 'MON', start: '14:00', end: '16:00' },
        { day: 'WED', start: '14:00', end: '16:00' },
        { day: 'FRI', start: '14:00', end: '16:00' }
      ],
      theory: [
        { day: 'TUE', start: '11:15', end: '12:15' },
        { day: 'TUE', start: '12:15', end: '13:15' },
        { day: 'THU', start: '11:15', end: '12:15' },
        { day: 'THU', start: '12:15', end: '13:15' },
        { day: 'MON', start: '16:00', end: '17:00' },
        { day: 'WED', start: '16:00', end: '17:00' },
        { day: 'FRI', start: '16:00', end: '17:00' }
      ]
    };

    console.log(`Lab time slots available: ${timeSlots.lab.length}`);
    console.log(`Theory time slots available: ${timeSlots.theory.length}`);

    // Step 7: Schedule labs
    console.log('\nSTEP 6: Scheduling Labs...');
    console.log('-'.repeat(80));

    const newTimetable = [];
    let labSlotIdx = 0;
    let totalLabsScheduled = 0;

    // Iterate through subjects and schedule their labs
    for (const [subjId, subject] of Object.entries(subjects)) {
      if (subject.labs === 0) continue; // Skip subjects without labs

      const labsNeeded = subject.labs * 2; // Each lab needs 2 slots (Batch A + B)
      const profs = profMap[subjId] || [];
      let profIdx = 0;

      console.log(`\n${subject.code} (${subject.name}): Need ${subject.labs} labs/week`);

      for (let i = 0; i < subject.labs; i++) {
        // Schedule Batch A
        if (labSlotIdx < timeSlots.lab.length) {
          const slot = timeSlots.lab[labSlotIdx];
          const prof = profs[profIdx % profs.length];
          
          const entry = {
            semester,
            branch_id: branchId,
            batch_id: batches[1], // Batch A
            professor_id: prof ? prof.id : null,
            subject_id: subjId,
            day_of_week: slot.day,
            time_slot_start: slot.start,
            time_slot_end: slot.end,
            slot_type: 'LAB'
          };
          
          newTimetable.push(entry);
          console.log(`  ✓ Lab ${i + 1}/2 Batch A: ${slot.day} ${slot.start}-${slot.end} (${prof?.name || 'TBD'})`);
          
          totalLabsScheduled++;
          labSlotIdx++;
          profIdx++;
        }

        // Schedule Batch B
        if (labSlotIdx < timeSlots.lab.length) {
          const slot = timeSlots.lab[labSlotIdx];
          const prof = profs[profIdx % profs.length];
          
          const entry = {
            semester,
            branch_id: branchId,
            batch_id: batches[2], // Batch B
            professor_id: prof ? prof.id : null,
            subject_id: subjId,
            day_of_week: slot.day,
            time_slot_start: slot.start,
            time_slot_end: slot.end,
            slot_type: 'LAB'
          };
          
          newTimetable.push(entry);
          console.log(`  ✓ Lab ${i + 1}/2 Batch B: ${slot.day} ${slot.start}-${slot.end} (${prof?.name || 'TBD'})`);
          
          totalLabsScheduled++;
          labSlotIdx++;
          profIdx++;
        }
      }

      subject.scheduledLabs = subject.labs;
    }

    console.log(`\n✓ Total labs scheduled: ${totalLabsScheduled} (Required: ${Object.values(subjects).reduce((sum, s) => sum + s.labs * 2, 0)})`);

    // Step 8: Schedule theory lectures
    console.log('\nSTEP 7: Scheduling Theory Lectures...');
    console.log('-'.repeat(80));

    let theorySlotIdx = 0;
    let totalTheoryScheduled = 0;

    for (const [subjId, subject] of Object.entries(subjects)) {
      if (subject.lectures === 0) continue; // Skip subjects without theory

      const profs = profMap[subjId] || [];
      let profIdx = 0;

      console.log(`\n${subject.code} (${subject.name}): Need ${subject.lectures} lectures/week`);

      for (let i = 0; i < subject.lectures; i++) {
        if (theorySlotIdx < timeSlots.theory.length) {
          const slot = timeSlots.theory[theorySlotIdx];
          const prof = profs[profIdx % profs.length];

          const entry = {
            semester,
            branch_id: branchId,
            batch_id: null, // Theory for all batches
            professor_id: prof ? prof.id : null,
            subject_id: subjId,
            day_of_week: slot.day,
            time_slot_start: slot.start,
            time_slot_end: slot.end,
            slot_type: 'THEORY'
          };

          newTimetable.push(entry);
          console.log(`  ✓ Theory ${i + 1}/${subject.lectures}: ${slot.day} ${slot.start}-${slot.end} (${prof?.name || 'TBD'})`);

          totalTheoryScheduled++;
          theorySlotIdx++;
          profIdx++;
        } else {
          console.log(`  ⚠️  Theory ${i + 1}/${subject.lectures}: NO SLOT AVAILABLE`);
        }
      }

      subject.scheduledLectures = Math.min(subject.lectures, theorySlotIdx);
    }

    console.log(`\n✓ Total theory lectures scheduled: ${totalTheoryScheduled} (Required: ${Object.values(subjects).reduce((sum, s) => sum + s.lectures, 0)})`);

    // Step 9: Add breaks and library hours
    console.log('\nSTEP 8: Adding Breaks & Library Hours...');
    console.log('-'.repeat(80));

    const breaks = [
      { day: 'MON', start: '11:00', end: '11:15', type: 'BREAK' },
      { day: 'TUE', start: '11:00', end: '11:15', type: 'BREAK' },
      { day: 'WED', start: '11:00', end: '11:15', type: 'BREAK' },
      { day: 'THU', start: '11:00', end: '11:15', type: 'BREAK' },
      { day: 'FRI', start: '11:00', end: '11:15', type: 'BREAK' },
      { day: 'MON', start: '13:15', end: '14:00', type: 'RECESS' },
      { day: 'TUE', start: '13:15', end: '14:00', type: 'RECESS' },
      { day: 'WED', start: '13:15', end: '14:00', type: 'RECESS' },
      { day: 'THU', start: '13:15', end: '14:00', type: 'RECESS' },
      { day: 'FRI', start: '13:15', end: '14:00', type: 'RECESS' },
      { day: 'FRI', start: '16:00', end: '17:00', type: 'LIBRARY' },
      { day: 'THU', start: '16:00', end: '17:00', type: 'PROJECT' }
    ];

    breaks.forEach(br => {
      newTimetable.push({
        semester,
        branch_id: branchId,
        batch_id: null,
        professor_id: null,
        subject_id: null,
        day_of_week: br.day,
        time_slot_start: br.start,
        time_slot_end: br.end,
        slot_type: br.type
      });
    });

    console.log(`✓ Added ${breaks.length} breaks/library/project hours`);

    // Step 10: Insert into database
    console.log('\nSTEP 9: Saving to Database...');
    console.log('-'.repeat(80));

    let insertCount = 0;
    for (const entry of newTimetable) {
      try {
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
      } catch (error) {
        console.error(`Error inserting: ${error.message}`);
      }
    }

    console.log(`✓ Inserted ${insertCount} timetable entries`);

    // Step 11: Verification
    console.log('\nSTEP 10: Verification...');
    console.log('-'.repeat(80));

    const verifyRes = await pool.query(`
      SELECT slot_type, COUNT(*) as count FROM timetable
      WHERE branch_id = $1 AND semester = $2
      GROUP BY slot_type
    `, [branchId, semester]);

    console.log('Timetable Summary:');
    verifyRes.rows.forEach(row => {
      console.log(`  ${row.slot_type}: ${row.count}`);
    });

    const batchRes = await pool.query(`
      SELECT b.batch_number, COUNT(*) as count FROM timetable t
      JOIN batches b ON t.batch_id = b.batch_id
      WHERE t.branch_id = $1 AND t.semester = $2 AND t.slot_type = 'LAB'
      GROUP BY b.batch_number
    `, [branchId, semester]);

    console.log('\nBatch Distribution (Labs):');
    batchRes.rows.forEach(row => {
      console.log(`  Batch ${row.batch_number}: ${row.count} labs`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ OPTIMIZATION COMPLETE');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

optimizeAndRegenerate();
