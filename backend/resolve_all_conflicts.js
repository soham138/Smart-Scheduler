const pool = require('./src/config/db');

/**
 * COMPREHENSIVE PROFESSOR CONFLICT RESOLVER
 * Finds and resolves ALL cross-branch professor scheduling conflicts
 */

function timeOverlaps(start1, end1, start2, end2) {
  return start1 < end2 && end1 > start2;
}

function getPriority(row) {
  let p = 0;
  if (row.slot_type === 'LAB') p += 100;
  else if (row.slot_type === 'THEORY') p += 50;
  p += (row.semester || 0) * 2;
  return p;
}

async function resolveAllConflicts() {
  const client = await pool.connect();
  
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║    COMPREHENSIVE PROFESSOR CONFLICT RESOLVER                ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Load all assignments
    const query = `
      SELECT 
        t.timetable_id,
        t.branch_id,
        b.name as branch_name,
        t.semester,
        t.professor_id,
        p.name as professor_name,
        s.name as subject_name,
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end,
        t.slot_type,
        t.batch_id
      FROM timetable t
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.professor_id IS NOT NULL
        AND t.slot_type IN ('THEORY', 'LAB')
      ORDER BY t.professor_id, t.day_of_week, t.time_slot_start
    `;
    
    const allAssignments = (await client.query(query)).rows;
    console.log(`[✓] Loaded ${allAssignments.length} professor assignments\n`);

    // Detect all conflicts
    const conflictMap = {};
    for (let i = 0; i < allAssignments.length; i++) {
      for (let j = i + 1; j < allAssignments.length; j++) {
        const a1 = allAssignments[i];
        const a2 = allAssignments[j];
        
        // Same professor, same day, overlapping time, different branch
        if (a1.professor_id === a2.professor_id &&
            a1.day_of_week === a2.day_of_week &&
            timeOverlaps(a1.time_slot_start, a1.time_slot_end, a2.time_slot_start, a2.time_slot_end) &&
            a1.branch_id !== a2.branch_id) {
          
          const key = `${a1.professor_id}|${a1.day_of_week}|${a1.time_slot_start}`;
          if (!conflictMap[key]) {
            conflictMap[key] = [];
          }
          if (!conflictMap[key].find(x => x.timetable_id === a2.timetable_id)) {
            conflictMap[key].push(a2);
          }
        }
      }
    }

    const conflicts = Object.entries(conflictMap).map(([key, assignments]) => {
      const [profId, day, time] = key.split('|');
      const prof = allAssignments.find(a => a.professor_id === profId);
      return {
        prof_id: profId,
        prof_name: prof.professor_name,
        day,
        time,
        assignments: [prof, ...assignments].filter((a, i, arr) => 
          arr.findIndex(x => x.timetable_id === a.timetable_id) === i
        )
      };
    });

    console.log(`[DETECTED] ${conflicts.length} conflict slots:\n`);
    for (const conflict of conflicts) {
      console.log(`[🔴] ${conflict.prof_name} - ${conflict.day} ${conflict.time}`);
      for (const a of conflict.assignments) {
        console.log(`     • ${a.subject_name} at ${a.branch_name} Sem${a.semester} (${a.slot_type}, priority: ${getPriority(a)})`);
      }
      console.log('');
    }

    // Resolve by moving lowest priority assignments
    console.log('[STEP 1] Resolving conflicts (sequential approach)...\n');
    
    const timeSlots = [
      'MON 09:00', 'MON 11:15', 'MON 14:00', 'MON 16:00',
      'TUE 09:00', 'TUE 11:15', 'TUE 14:00', 'TUE 16:00',
      'WED 09:00', 'WED 11:15', 'WED 14:00', 'WED 16:00',
      'THU 09:00', 'THU 11:15', 'THU 14:00', 'THU 16:00',
      'FRI 09:00', 'FRI 11:15', 'FRI 14:00', 'FRI 16:00'
    ];
    
    const updated = [];
    
    for (const conflict of conflicts) {
      // Sort by priority (keep high priority, move low priority)
      const sorted = conflict.assignments.sort((a, b) => getPriority(b) - getPriority(a));
      const toKeep = sorted[0];
      const toMove = sorted.slice(1);
      
      for (const move of toMove) {
        let found = false;
        
        for (const slot of timeSlots) {
          const [day, time] = slot.split(' ');
          
          // Skip if same time
          if (day === move.day_of_week && time === move.time_slot_start.substring(0, 5)) continue;
          
          // Check professor available
          const profUsed = await client.query(`
            SELECT COUNT(*) as cnt FROM timetable
            WHERE professor_id = $1 AND day_of_week = $2 AND time_slot_start = $3 AND timetable_id != $4
          `, [move.professor_id, day, time, move.timetable_id]);
          
          if (parseInt(profUsed.rows[0].cnt) > 0) continue;
          
          // Check lab capacity
          if (move.slot_type === 'LAB') {
            const labUsed = await client.query(`
              SELECT COUNT(*) as cnt FROM timetable
              WHERE day_of_week = $1 AND time_slot_start = $2 AND slot_type = 'LAB' AND timetable_id != $3
            `, [day, time, move.timetable_id]);
            
            if (parseInt(labUsed.rows[0].cnt) >= 20) continue;
          }
          
          // Check batch conflicts
          if (move.batch_id) {
            const batchUsed = await client.query(`
              SELECT COUNT(*) as cnt FROM timetable
              WHERE batch_id = $1 AND day_of_week = $2 AND time_slot_start = $3 AND timetable_id != $4
            `, [move.batch_id, day, time, move.timetable_id]);
            
            if (parseInt(batchUsed.rows[0].cnt) > 0) continue;
          }
          
          // Valid slot!
          const startMins = parseInt(time.replace(':', ''));
          const endMins = startMins + 115;
          const endHour = Math.floor(endMins / 100);
          const endMin = endMins % 100;
          const endTime = String(endHour).padStart(2, '0') + ':' + String(endMin).padStart(2, '0');
          
          await client.query(`
            UPDATE timetable SET day_of_week = $1, time_slot_start = $2, time_slot_end = $3
            WHERE timetable_id = $4
          `, [day, time, endTime, move.timetable_id]);
          
          updated.push({
            prof: move.professor_name,
            subj: move.subject_name,
            from: `${move.day_of_week} ${move.time_slot_start}`,
            to: `${day} ${time}`
          });
          
          console.log(`[✓] ${move.professor_name} - ${move.subject_name}`);
          console.log(`    ${move.branch_name} Sem${move.semester}`);
          console.log(`    ${move.day_of_week} ${move.time_slot_start} → ${day} ${time}\n`);
          
          found = true;
          break;
        }
        
        if (!found) {
          console.log(`[✗] ${move.professor_name} - ${move.subject_name}`);
          console.log(`    NO VALID SLOT FOUND!\n`);
        }
      }
    }

    // Final verification
    console.log('[STEP 2] Final verification...\n');
    
    const verify = await client.query(`
      WITH prof_slots AS (
        SELECT professor_id, day_of_week, time_slot_start, branch_id
        FROM timetable
        WHERE professor_id IS NOT NULL AND slot_type IN ('THEORY', 'LAB')
      )
      SELECT DISTINCT p1.professor_id, pr.name, p1.day_of_week, p1.time_slot_start, COUNT(*) as cnt
      FROM prof_slots p1
      JOIN prof_slots p2 ON 
        p1.professor_id = p2.professor_id AND
        p1.day_of_week = p2.day_of_week AND
        p1.time_slot_start = p2.time_slot_start AND
        p1.branch_id != p2.branch_id
      JOIN professors pr ON p1.professor_id = pr.professor_id
      GROUP BY p1.professor_id, pr.name, p1.day_of_week, p1.time_slot_start,  p1.branch_id
    `);
    
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    FINAL REPORT                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    console.log(`Conflicts Found:     ${conflicts.length}`);
    console.log(`Assignments Moved:   ${updated.length}`);
    console.log(`Remaining Conflicts: ${verify.rows.length}\n`);
    
    if (verify.rows.length > 0) {
      console.log('Remaining Issues:');
      for (const row of verify.rows) {
        console.log(`  • ${row.name}: ${row.day_of_week} ${row.time_slot_start} (${row.cnt} branches)`);
      }
    } else {
      console.log('✅ SUCCESS! All professor conflicts resolved!\n');
    }

    await client.release();
    await pool.end();
  } catch (err) {
    console.error('[ERROR]', err.message);
    await client.release();
    await pool.end();
  }
}

resolveAllConflicts();
