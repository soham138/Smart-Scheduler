const { Pool } = require('pg');
require('dotenv').config();

/**
 * PROFESSOR CONFLICT RESOLVER
 * Resolves cross-branch professor double-booking conflicts
 * 
 * Strategy:
 * 1. Load all professor assignments with time slots
 * 2. Identify conflicts (same professor, overlapping times, different branches)
 * 3. Score each assignment by priority (labs > theory, core > elective)
 * 4. Move low-priority assignments to non-conflicting slots
 * 5. Validate no new conflicts created
 */

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Time overlap checker
function timeOverlaps(start1, end1, start2, end2) {
  return start1 < end2 && end1 > start2;
}

// Priority scorer (higher = more important to keep in place)
function getAssignmentPriority(row) {
  let priority = 0;
  
  // Slot type priority: labs > theory > other
  if (row.slot_type === 'LAB') priority += 100;
  else if (row.slot_type === 'THEORY') priority += 50;
  else if (row.slot_type === 'BREAK' || row.slot_type === 'LIBRARY') priority -= 50;
  
  // Subject type: BOTH > LAB > THEORY
  if (row.subject_type === 'BOTH') priority += 30;
  else if (row.subject_type === 'LAB') priority += 25;
  else if (row.subject_type === 'THEORY') priority += 10;
  
  // Semester (higher semesters = more specialized, harder to move)
  priority += (row.semester || 0) * 2;
  
  return priority;
}

async function resolveConflicts() {
  const client = await pool.connect();
  
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║       PROFESSOR CONFLICT RESOLVER - CONSTRAINT BASED       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 1: Load all professor assignments (across ALL branches & semesters)
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('[STEP 1] Loading professor assignments...\n');
    
    const assignmentsQuery = `
      SELECT 
        t.timetable_id,
        t.branch_id,
        b.name as branch_name,
        t.semester,
        t.professor_id,
        p.name as professor_name,
        t.subject_id,
        s.name as subject_name,
        s.type as subject_type,
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end,
        t.slot_type,
        t.batch_id,
        ba.batch_number
      FROM timetable t
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN batches ba ON t.batch_id = ba.batch_id
      WHERE t.professor_id IS NOT NULL
        AND t.slot_type IN ('THEORY', 'LAB')
      ORDER BY t.professor_id, t.day_of_week, t.time_slot_start
    `;
    
    const assignmentsRes = await client.query(assignmentsQuery);
    const allAssignments = assignmentsRes.rows;
    console.log(`[✓] Loaded ${allAssignments.length} professor assignments\n`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 2: Identify professor conflicts
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('[STEP 2] Identifying conflicts...\n');
    
    const conflictMap = new Map(); // profId -> [conflicts]
    const conflicts = [];
    
    for (let i = 0; i < allAssignments.length; i++) {
      const assign1 = allAssignments[i];
      
      for (let j = i + 1; j < allAssignments.length; j++) {
        const assign2 = allAssignments[j];
        
        // Same professor?
        if (assign1.professor_id !== assign2.professor_id) continue;
        
        // Same day?
        if (assign1.day_of_week !== assign2.day_of_week) continue;
        
        // Time overlap?
        if (!timeOverlaps(assign1.time_slot_start, assign1.time_slot_end, 
                          assign2.time_slot_start, assign2.time_slot_end)) continue;
        
        // Different branches?
        if (assign1.branch_id === assign2.branch_id) continue;
        
        // ✓ CONFLICT FOUND
        const conflict = {
          professor_id: assign1.professor_id,
          professor_name: assign1.professor_name,
          day: assign1.day_of_week,
          time_start: assign1.time_slot_start,
          time_end: assign1.time_slot_end,
          assignment_1: {
            timetable_id: assign1.timetable_id,
            branch: assign1.branch_name,
            semester: assign1.semester,
            subject: assign1.subject_name,
            type: assign1.slot_type,
            priority: getAssignmentPriority(assign1)
          },
          assignment_2: {
            timetable_id: assign2.timetable_id,
            branch: assign2.branch_name,
            semester: assign2.semester,
            subject: assign2.subject_name,
            type: assign2.slot_type,
            priority: getAssignmentPriority(assign2)
          }
        };
        
        conflicts.push(conflict);
        
        console.log(`[🔴 CONFLICT] Prof ${assign1.professor_name}`);
        console.log(`   Day: ${assign1.day_of_week} ${assign1.time_slot_start}`);
        console.log(`   → Assignment 1: ${assign1.subject_name} at ${assign1.branch_name} Sem${assign1.semester} (${assign1.slot_type}, priority: ${conflict.assignment_1.priority})`);
        console.log(`   → Assignment 2: ${assign2.subject_name} at ${assign2.branch_name} Sem${assign2.semester} (${assign2.slot_type}, priority: ${conflict.assignment_2.priority})`);
        console.log('');
      }
    }
    
    console.log(`[✓] Found ${conflicts.length} total conflicts\n`);

    if (conflicts.length === 0) {
      console.log('✅ No professor conflicts detected!\n');
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 3: Decide which assignment to move (lower priority = move it)
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('[STEP 3] Deciding which assignments to move...\n');
    
    const movePlan = [];
    
    for (const conflict of conflicts) {
      const p1 = conflict.assignment_1.priority;
      const p2 = conflict.assignment_2.priority;
      
      let toMove, toKeep;
      if (p1 < p2) {
        toMove = { ...conflict.assignment_1, source: 'assignment_1' };
        toKeep = { ...conflict.assignment_2, source: 'assignment_2' };
      } else {
        toMove = { ...conflict.assignment_2, source: 'assignment_2' };
        toKeep = { ...conflict.assignment_1, source: 'assignment_1' };
      }
      
      movePlan.push({
        professor: conflict.professor_name,
        keep: toKeep,
        move: toMove,
        conflict_time: `${conflict.day} ${conflict.time_start}`
      });
      
      console.log(`[→] ${conflict.professor_name} - ${conflict.day} ${conflict.time_start}`);
      console.log(`   [KEEP] ${toKeep.subject} at ${toKeep.branch} Sem${toKeep.semester} (priority: ${toKeep.priority})`);
      console.log(`   [MOVE] ${toMove.subject} at ${toMove.branch} Sem${toMove.semester} (priority: ${toMove.priority})`);
      console.log('');
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 4: Find alternative slots for assignments to move
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('[STEP 4] Finding alternative time slots...\n');
    
    const dayOrder = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    const timeSlots = ['09:00-11:00', '11:15-13:15', '14:00-16:00', '16:00-17:00'];
    
    const reassignments = [];
    
    for (const plan of movePlan) {
      const moveAssignmentId = plan.move.timetable_id;
      const branchId = (await client.query(
        'SELECT branch_id FROM timetable WHERE timetable_id = $1',
        [moveAssignmentId]
      )).rows[0]?.branch_id;
      
      const semester = (await client.query(
        'SELECT semester FROM timetable WHERE timetable_id = $1',
        [moveAssignmentId]
      )).rows[0]?.semester;
      
      // Find available slots (same or different day)
      let alternatives = [];
      
      for (const day of dayOrder) {
        for (const slot of timeSlots) {
          const [start, end] = slot.split('-');
          
          // Check if professor is already assigned at this time
          const profConflictCheck = await client.query(`
            SELECT COUNT(*) as count
            FROM timetable
            WHERE professor_id = $1
              AND day_of_week = $2
              AND time_slot_start = $3
              AND timetable_id != $4
          `, [plan.move.professor_id, day, start, moveAssignmentId]);
          
          if (profConflictCheck.rows[0].count > 0) continue;
          
          // Check lab capacity
          const capacityCheck = await client.query(`
            SELECT COUNT(*) as count
            FROM timetable
            WHERE slot_type = 'LAB'
              AND day_of_week = $1
              AND time_slot_start = $2
              AND timetable_id != $3
          `, [day, start, moveAssignmentId]);
          
          const labCount = parseInt(capacityCheck.rows[0].count);
          if (plan.move.type === 'LAB' && labCount >= 20) continue;
          
          // Check batch conflicts
          const batchConflictCheck = await client.query(`
            SELECT COUNT(*) as count
            FROM timetable
            WHERE batch_id = (SELECT batch_id FROM timetable WHERE timetable_id = $1)
              AND day_of_week = $2
              AND (
                (time_slot_start < $4 AND time_slot_end > $3)
              )
              AND timetable_id != $1
          `, [moveAssignmentId, day, start, end]);
          
          if (batchConflictCheck.rows[0].count > 0) continue;
          
          // ✓ Valid slot found
          alternatives.push({
            day,
            time: slot,
            start,
            end,
            priority: (day === plan.conflict_time.split(' ')[0] ? 0 : 1) // Prefer same day
          });
        }
      }
      
      alternatives.sort((a, b) => a.priority - b.priority);
      
      if (alternatives.length > 0) {
        const chosen = alternatives[0];
        reassignments.push({
          timetable_id: moveAssignmentId,
          professor: plan.professor,
          subject: plan.move.subject,
          branch: plan.move.branch,
          from: plan.conflict_time,
          to: `${chosen.day} ${chosen.time}`,
          old_start: plan.conflict_time.split(' ')[1],
          new_start: chosen.start,
          new_end: chosen.end,
          new_day: chosen.day
        });
        
        console.log(`[✓] ${plan.professor} - ${plan.move.subject}`);
        console.log(`    From: ${plan.conflict_time}`);
        console.log(`    To:   ${chosen.day} ${chosen.time}\n`);
      } else {
        console.log(`[✗] ${plan.professor} - ${plan.move.subject}`);
        console.log(`    No available slots found!\n`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 5: Apply reassignments
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('[STEP 5] Applying reassignments...\n');
    
    for (const reassign of reassignments) {
      await client.query(`
        UPDATE timetable
        SET 
          day_of_week = $1,
          time_slot_start = $2,
          time_slot_end = $3
        WHERE timetable_id = $4
      `, [reassign.new_day, reassign.new_start, reassign.new_end, reassign.timetable_id]);
      
      console.log(`[✓] Updated ${reassign.timetable_id}`);
    }
    
    console.log(`\n[✓] Applied ${reassignments.length} reassignments\n`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 6: Verify no new conflicts created
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('[STEP 6] Verifying solution...\n');
    
    const verifyRes = await client.query(`
      WITH prof_assignments AS (
        SELECT 
          professor_id,
          day_of_week,
          time_slot_start,
          time_slot_end,
          branch_id,
          COUNT(*) as slot_count
        FROM timetable
        WHERE professor_id IS NOT NULL
          AND slot_type IN ('THEORY', 'LAB')
        GROUP BY professor_id, day_of_week, time_slot_start, time_slot_end, branch_id
      )
      SELECT DISTINCT
        p.professor_id,
        p.name,
        pa1.day_of_week,
        pa1.time_slot_start,
        pa2.branch_id as branch2
      FROM prof_assignments pa1
      JOIN prof_assignments pa2 ON 
        pa1.professor_id = pa2.professor_id AND
        pa1.day_of_week = pa2.day_of_week AND
        pa1.time_slot_start = pa2.time_slot_start AND
        pa1.branch_id != pa2.branch_id
      JOIN professors p ON pa1.professor_id = p.professor_id
    `);
    
    if (verifyRes.rows.length === 0) {
      console.log('✅ SUCCESS! All professor conflicts resolved!\n');
    } else {
      console.log(`⚠️ WARNING: ${verifyRes.rows.length} conflicts remain:\n`);
      for (const row of verifyRes.rows) {
        console.log(`  Prof ${row.name} still has conflict on ${row.day_of_week} ${row.time_slot_start}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 7: Generate summary report
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    RESOLUTION SUMMARY                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`Original Conflicts Found:    ${conflicts.length}`);
    console.log(`Assignments Moved:           ${reassignments.length}`);
    console.log(`Remaining Conflicts:         ${verifyRes.rows.length}`);
    console.log(`Resolution Success Rate:     ${((reassignments.length - verifyRes.rows.length) / conflicts.length * 100).toFixed(1)}%\n`);
    
    console.log('REASSIGNMENTS APPLIED:');
    for (const r of reassignments) {
      console.log(`  • ${r.professor} - ${r.subject}`);
      console.log(`    From: ${r.from} → To: ${r.to}`);
    }
    
    console.log('\n');

  } catch (err) {
    console.error('[ERROR]', err.message);
    console.error(err);
  } finally {
    await client.release();
    await pool.end();
  }
}

resolveConflicts();
