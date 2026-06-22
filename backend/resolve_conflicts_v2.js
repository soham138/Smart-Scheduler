const pool = require('./src/config/db');

/**
 * PROFESSOR CONFLICT RESOLVER V2
 * Improved constraint-based reassignment
 */

function timeOverlaps(start1, end1, start2, end2) {
  return start1 < end2 && end1 > start2;
}

function getAssignmentPriority(row) {
  let priority = 0;
  if (row.slot_type === 'LAB') priority += 100;
  else if (row.slot_type === 'THEORY') priority += 50;
  priority += (row.semester || 0) * 2;
  return priority;
}

async function resolveConflicts() {
  const client = await pool.connect();
  
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║    PROFESSOR CONFLICT RESOLVER V2 - SEQUENTIAL APPROACH    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Load all assignments
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
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end,
        t.slot_type
      FROM timetable t
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.professor_id IS NOT NULL
        AND t.slot_type IN ('THEORY', 'LAB')
      ORDER BY t.professor_id, t.day_of_week, t.time_slot_start
    `;
    
    const allAssignments = (await client.query(assignmentsQuery)).rows;
    console.log(`[✓] Loaded ${allAssignments.length} professor assignments\n`);

    // Find all conflicts
    console.log('[STEP 2] Finding all conflicts...\n');
    
    const allConflicts = [];
    for (let i = 0; i < allAssignments.length; i++) {
      for (let j = i + 1; j < allAssignments.length; j++) {
        const a1 = allAssignments[i];
        const a2 = allAssignments[j];
        
        if (a1.professor_id !== a2.professor_id) continue;
        if (a1.day_of_week !== a2.day_of_week) continue;
        if (!timeOverlaps(a1.time_slot_start, a1.time_slot_end, a2.time_slot_start, a2.time_slot_end)) continue;
        if (a1.branch_id === a2.branch_id) continue;
        
        allConflicts.push({
          prof_id: a1.professor_id,
          prof_name: a1.professor_name,
          day: a1.day_of_week,
          time_start: a1.time_slot_start,
          time_end: a1.time_slot_end,
          a1: { ...a1, priority: getAssignmentPriority(a1) },
          a2: { ...a2, priority: getAssignmentPriority(a2) }
        });
        
        console.log(`[🔴] ${a1.professor_name}`);
        console.log(`     ${a1.day_of_week} ${a1.time_slot_start}: ${a1.subject_name} (${a1.branch_name}) vs ${a2.subject_name} (${a2.branch_name})`);
      }
    }
    
    console.log(`\n[✓] Found ${allConflicts.length} conflicts\n`);

    if (allConflicts.length === 0) {
      console.log('✅ No conflicts!\n');
      return;
    }

    // Resolve each conflict
    console.log('[STEP 3] Resolving conflicts (moving lowest priority)...\n');
    
    const timeslots = [
      { day: 'MON', times: ['09:00', '11:15', '14:00', '16:00'] },
      { day: 'TUE', times: ['09:00', '11:15', '14:00', '16:00'] },
      { day: 'WED', times: ['09:00', '11:15', '14:00', '16:00'] },
      { day: 'THU', times: ['09:00', '11:15', '14:00', '16:00'] },
      { day: 'FRI', times: ['09:00', '11:15', '14:00', '16:00'] }
    ];
    
    const updates = [];
    
    for (const conflict of allConflicts) {
      const toMove = conflict.a1.priority <= conflict.a2.priority ? conflict.a1 : conflict.a2;
      const toKeep = conflict.a1.priority <= conflict.a2.priority ? conflict.a2 : conflict.a1;
      
      console.log(`[→] Moving: ${toMove.subject_name} (${toMove.branch_name}) from ${toMove.day_of_week} ${toMove.time_slot_start}`);
      
      // Find a slot for this assignment that doesn't conflict with toKeep
      let found = false;
      
      for (const slot of timeslots) {
        for (const time of slot.times) {
          // Skip the conflicting slot
          if (slot.day === toMove.day_of_week && time === toMove.time_slot_start.substring(0, 5)) continue;
          
          // Check if professor is already assigned
          const profCheck = await client.query(`
            SELECT COUNT(*) as cnt FROM timetable
            WHERE professor_id = $1 AND day_of_week = $2 AND time_slot_start = $3 AND timetable_id != $4
          `, [toMove.professor_id, slot.day, time, toMove.timetable_id]);
          
          if (parseInt(profCheck.rows[0].cnt) > 0) continue;
          
          // Check lab capacity if this is a lab
          if (toMove.slot_type === 'LAB') {
            const labCheck = await client.query(`
              SELECT COUNT(*) as cnt FROM timetable
              WHERE day_of_week = $1 AND time_slot_start = $2 AND slot_type = 'LAB' AND timetable_id != $3
            `, [slot.day, time, toMove.timetable_id]);
            
            if (parseInt(labCheck.rows[0].cnt) >= 20) continue;
          }
          
          // Check batch conflicts
          if (toMove.batch_id) {
            const batchCheck = await client.query(`
              SELECT COUNT(*) as cnt FROM timetable
              WHERE batch_id = $1 AND day_of_week = $2 
                AND ((time_slot_start < $4 AND time_slot_end > $3) OR time_slot_start = $3)
                AND timetable_id != $5
            `, [toMove.batch_id, slot.day, time, time, toMove.timetable_id]);
            
            if (parseInt(batchCheck.rows[0].cnt) > 0) continue;
          }
          
          // ✓ Valid slot found
          console.log(`    ✓ Moving to: ${slot.day} ${time}`);
          
          const endTime = String(parseInt(time.replace(':', '')) + 115).padStart(4, '0');
          const end = endTime.substring(0, 2) + ':' + endTime.substring(2);
          
          updates.push({
            timetable_id: toMove.timetable_id,
            prof: toMove.professor_name,
            subj: toMove.subject_name,
            from_day: toMove.day_of_week,
            from_time: toMove.time_slot_start,
            to_day: slot.day,
            to_time: time,
            to_end: end
          });
          
          found = true;
          break;
        }
        if (found) break;
      }
      
      if (!found) {
        console.log(`    ✗ NO VALID SLOT FOUND!`);
      }
      console.log('');
    }

    // Apply updates
    console.log(`[STEP 4] Applying ${updates.length} updates...\n`);
    
    for (const upd of updates) {
      await client.query(`
        UPDATE timetable SET day_of_week = $1, time_slot_start = $2, time_slot_end = $3
        WHERE timetable_id = $4
      `, [upd.to_day, upd.to_time, upd.to_end, upd.timetable_id]);
      
      console.log(`[✓] ${upd.prof} - ${upd.subj}: ${upd.from_day} ${upd.from_time} → ${upd.to_day} ${upd.to_time}`);
    }

    // Verify
    console.log('\n[STEP 5] Verifying solution...\n');
    
    const verifyRes = await client.query(`
      WITH prof_slots AS (
        SELECT professor_id, day_of_week, time_slot_start, branch_id, COUNT(*) cnt
        FROM timetable
        WHERE professor_id IS NOT NULL AND slot_type IN ('THEORY', 'LAB')
        GROUP BY professor_id, day_of_week, time_slot_start, branch_id
      )
      SELECT DISTINCT p1.professor_id, pr.name, p1.day_of_week, p1.time_slot_start
      FROM prof_slots p1
      JOIN prof_slots p2 ON p1.professor_id = p2.professor_id 
        AND p1.day_of_week = p2.day_of_week 
        AND p1.time_slot_start = p2.time_slot_start 
        AND p1.branch_id != p2.branch_id
      JOIN professors pr ON p1.professor_id = pr.professor_id
    `);
    
    if (verifyRes.rows.length === 0) {
      console.log('✅ SUCCESS! All conflicts resolved!\n');
    } else {
      console.log(`⚠️ ${verifyRes.rows.length} conflicts remain:\n`);
      for (const row of verifyRes.rows) {
        console.log(`  ${row.name}: ${row.day_of_week} ${row.time_slot_start}`);
      }
    }

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    SUMMARY                                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`Original Conflicts:  ${allConflicts.length}`);
    console.log(`Updates Applied:     ${updates.length}`);
    console.log(`Remaining Conflicts: ${verifyRes.rows.length}`);
    console.log(`Success Rate:        ${updates.length > 0 ? ((updates.length - verifyRes.rows.length) / allConflicts.length * 100).toFixed(1) + '%' : 'N/A'}\n`);

  } catch (err) {
    console.error('[ERROR]', err.message);
  } finally {
    await client.release();
    await pool.end();
  }
}

resolveConflicts();
