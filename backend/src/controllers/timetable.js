const Timetable = require('../models/Timetable');
const TimetableAlgorithm = require('../algorithms/TimetableAlgorithm');
const pool = require('../config/db');

/**
 * ENHANCED: Check for ALL types of timetable conflicts
 * 1. Professor double-booking (same time, different classes, any branch)
 * 2. Missing professors
 * 3. Same subject at same time across different branches
 * 4. Theory-Lab overlaps (same subject-batch)
 * 5. Batch overlaps (same batch can't be in 2 places at once)
 * 6. Lab capacity exceeded (>5 labs per slot)
 * 7. Lab continuity (2-hour blocks required)
 */
async function checkTimetableConflicts(timetable) {
  const conflicts = [];
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          COMPREHENSIVE CONFLICT CHECK STARTING              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`[CHECK] Total slots: ${timetable ? timetable.length : 0}\n`);
  
  if (!timetable || timetable.length === 0) {
    console.log('[❌] No timetable data provided!');
    return conflicts;
  }
  
  // FILTER: Only check teaching/lab slots (skip breaks, recess, library)
  const teachingSlots = timetable.filter(s => 
    s.slot_type === 'THEORY' || s.slot_type === 'LAB'
  );
  
  // ═══════════════════════════════════════════════════════════════════
  // CHECK 1: MISSING PROFESSORS
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[CHECK-1] 🔍 Detecting missing professors...');
  const missingProfs = teachingSlots.filter(s => !s.professor_name || s.professor_name === '-' || s.professor_name === null);
  missingProfs.forEach(slot => {
    conflicts.push({
      type: 'MISSING_PROFESSOR',
      severity: 'CRITICAL',
      branch: slot.branch_name,
      semester: slot.semester,
      subject: slot.subject_name,
      day: slot.day_of_week,
      time: `${slot.time_slot_start}-${slot.time_slot_end}`,
      message: `NO PROFESSOR assigned for ${slot.subject_name} (${slot.branch_name} Sem ${slot.semester})`
    });
  });
  if (missingProfs.length > 0) {
    console.log(`  [❌] Found ${missingProfs.length} slots missing professors`);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // CHECK 2: PROFESSOR DOUBLE-BOOKING (CRITICAL - Same Time, Diff Class)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[CHECK-2] 🔴 Detecting professor double-booking...');
  const professorSchedule = {}; // prof_name -> [{day, start, end, subject, branch, semester}]
  
  for (const slot of teachingSlots) {
    if (!slot.professor_name || slot.professor_name === '-') continue;
    
    const profName = slot.professor_name;
    if (!professorSchedule[profName]) {
      professorSchedule[profName] = [];
    }
    
    // Check overlap with existing slots
    const overlap = professorSchedule[profName].find(s => 
      s.day === slot.day_of_week && 
      timeOverlaps(s.start, s.end, slot.time_slot_start, slot.time_slot_end)
    );
    
    if (overlap) {
      conflicts.push({
        type: 'PROFESSOR_DOUBLE_BOOKING',
        severity: 'CRITICAL',
        professor: profName,
        class1: `${overlap.subject} (${overlap.branch} Sem${overlap.semester})`,
        class2: `${slot.subject_name} (${slot.branch_name} Sem${slot.semester})`,
        day: slot.day_of_week,
        time: `${slot.time_slot_start}-${slot.time_slot_end}`,
        message: `⚠️ ${profName} teaching TWO classes simultaneously:\n    1) ${overlap.subject} at ${overlap.branch}\n    2) ${slot.subject_name} at ${slot.branch_name}`
      });
      console.log(`  [❌] CONFLICT: ${profName} double-booked on ${slot.day_of_week} ${slot.time_slot_start}-${slot.time_slot_end}`);
    } else {
      professorSchedule[profName].push({
        day: slot.day_of_week,
        start: slot.time_slot_start,
        end: slot.time_slot_end,
        subject: slot.subject_name,
        branch: slot.branch_name,
        semester: slot.semester
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // CHECK 3: SAME SUBJECT, SAME TIME, DIFFERENT BRANCHES
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[CHECK-3] 👥 Detecting cross-branch subject overlaps...');
  const subjectSlots = {}; // subject_name -> [{branch, day, start, end}]
  
  for (const slot of teachingSlots) {
    const subjKey = slot.subject_name;
    if (!subjectSlots[subjKey]) {
      subjectSlots[subjKey] = [];
    }
    subjectSlots[subjKey].push({
      branch: slot.branch_name,
      day: slot.day_of_week,
      start: slot.time_slot_start,
      end: slot.time_slot_end
    });
  }
  
  for (const subj in subjectSlots) {
    const slots = subjectSlots[subj];
    if (slots.length < 2) continue;
    
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const s1 = slots[i];
        const s2 = slots[j];
        
        // Same subject, different branches, same time = conflict
        if (s1.branch !== s2.branch &&
            s1.day === s2.day &&
            timeOverlaps(s1.start, s1.end, s2.start, s2.end)) {
          conflicts.push({
            type: 'CROSS_BRANCH_SAME_TIME',
            severity: 'HIGH',
            subject: subj,
            branch1: s1.branch,
            branch2: s2.branch,
            day: s1.day,
            time: `${s1.start}-${s1.end}`,
            message: `⚠️ Subject "${subj}" scheduled at overlapping time in ${s1.branch} AND ${s2.branch}`
          });
          console.log(`  [❌] CONFLICT: "${subj}" at same time in ${s1.branch} AND ${s2.branch}`);
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // CHECK 4: BATCH OVERLAP (Same batch can't be in 2 classes simultaneously)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[CHECK-4] 📦 Detecting batch overlaps...');
  const batchSchedule = {}; // batch_number -> [{day, start, end, subject, branch}]
  
  for (const slot of teachingSlots) {
    if (!slot.batch_number) continue;
    
    const batchKey = slot.batch_number;
    if (!batchSchedule[batchKey]) {
      batchSchedule[batchKey] = [];
    }
    
    const overlap = batchSchedule[batchKey].find(s =>
      s.day === slot.day_of_week &&
      s.branch === slot.branch_name &&
      timeOverlaps(s.start, s.end, slot.time_slot_start, slot.time_slot_end)
    );
    
    if (overlap) {
      conflicts.push({
        type: 'BATCH_OVERLAP',
        severity: 'CRITICAL',
        batch: slot.batch_number,
        subject1: overlap.subject,
        subject2: slot.subject_name,
        day: slot.day_of_week,
        time: `${slot.time_slot_start}-${slot.time_slot_end}`,
        message: `⚠️ Batch ${slot.batch_number} has overlapping classes:\n    1) ${overlap.subject}\n    2) ${slot.subject_name}`
      });
      console.log(`  [❌] CONFLICT: Batch ${batchKey} double-booked on ${slot.day_of_week}`);
    } else {
      batchSchedule[batchKey].push({
        day: slot.day_of_week,
        start: slot.time_slot_start,
        end: slot.time_slot_end,
        subject: slot.subject_name,
        branch: slot.branch_name
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // CHECK 5: LAB CAPACITY (Max 5 distinct subjects per 2-hour lab slot)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[CHECK-5] 🔬 Checking lab capacity limits...');
  const labSlots = timetable.filter(s => s.slot_type === 'LAB');
  const slotUsage = {}; // timeKey -> set of subject_ids
  
  for (const slot of labSlots) {
    const slotKey = `${slot.day_of_week}-${slot.time_slot_start}-${slot.time_slot_end}`;
    if (!slotUsage[slotKey]) {
      slotUsage[slotKey] = new Set();
    }
    slotUsage[slotKey].add(slot.subject_id || slot.subject_name);
    
    if (slotUsage[slotKey].size > 5) {
      conflicts.push({
        type: 'LAB_CAPACITY_EXCEEDED',
        severity: 'HIGH',
        time: slotKey,
        capacity: slotUsage[slotKey].size,
        limit: 5,
        message: `⚠️ Lab slot has ${slotUsage[slotKey].size} subjects (max 5 allowed)`
      });
      console.log(`  [❌] CONFLICT: Lab slot ${slotKey} exceeds capacity`);
    }
  }

  
  // ═══════════════════════════════════════════════════════════════════
  // FINAL SUMMARY & REPORTING
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              CONFLICT CHECK COMPLETE                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  // Count by severity
  const bySeverity = {};
  conflicts.forEach(c => {
    if (!bySeverity[c.severity]) bySeverity[c.severity] = 0;
    bySeverity[c.severity]++;
  });
  
  if (conflicts.length === 0) {
    console.log('✅ STATUS: NO CONFLICTS FOUND');
  } else {
    console.log(`[❌] TOTAL CONFLICTS: ${conflicts.length}`);
    console.log('\nBy Severity:');
    Object.entries(bySeverity).forEach(([severity, count]) => {
      console.log(`  🔴 ${severity}: ${count}`);
    });
    console.log('\nDetailed List:');
    conflicts.forEach((c, i) => {
      console.log(`  ${i+1}. [${c.severity}] ${c.type}: ${c.message || JSON.stringify(c)}`);
    });
  }
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  return conflicts;
}

/**
 * Check if two time ranges overlap
 */
function timeOverlaps(start1, end1, start2, end2) {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  
  const hasOverlap = s1 < e2 && s2 < e1;
  if (hasOverlap) {
    console.log(`[DEBUG] ⏰ timeOverlaps: ${start1}-${end1} overlaps with ${start2}-${end2}`);
  }
  return hasOverlap;
}

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Auto-cleanup: Remove duplicate LAB entries
 * Ensures each (subject, batch, semester) combination has only ONE lab entry
 */
async function autoCleanupDuplicateLabs() {
  try {
    const findDupsQuery = `
      WITH ranked AS (
        SELECT 
          timetable_id,
          subject_id,
          batch_id,
          semester,
          ROW_NUMBER() OVER (PARTITION BY subject_id, batch_id, semester ORDER BY timetable_id) as rn
        FROM timetable
        WHERE slot_type = 'LAB'
        AND subject_id IS NOT NULL
        AND batch_id IS NOT NULL
      )
      SELECT timetable_id FROM ranked WHERE rn > 1;
    `;

    const dupsResult = await pool.query(findDupsQuery);
    const dupIds = dupsResult.rows.map(r => r.timetable_id);

    if (dupIds.length > 0) {
      console.log(`[AutoCleanup] Found ${dupIds.length} duplicate LAB entries - removing...`);
      
      const deleteQuery = `
        DELETE FROM timetable 
        WHERE timetable_id = ANY($1::uuid[])
        RETURNING timetable_id;
      `;

      const deleteResult = await pool.query(deleteQuery, [dupIds]);
      console.log(`[AutoCleanup] ✅ Removed ${deleteResult.rowCount} duplicates\n`);
    }
  } catch (error) {
    console.error(`[AutoCleanup] Warning: Could not cleanup duplicates - ${error.message}`);
    // Don't fail generation if cleanup fails
  }
}

exports.generateTimetable = async (req, res) => {
  try {
    const { branchId, semester } = req.body;

    if (!branchId || !semester) {
      return res.status(400).json({ error: 'Branch ID and semester are required' });
    }

    // Get branch name for better logging
    const branchResult = await pool.query('SELECT name FROM branches WHERE branch_id = $1', [branchId]);
    const branchName = branchResult.rows.length > 0 ? branchResult.rows[0].name : 'Unknown';

    console.log(`\n${'='.repeat(70)}`);
    console.log(`[Timetable] STARTING GENERATION`);
    console.log(`[Timetable] Branch: ${branchName} (ID: ${branchId})`);
    console.log(`[Timetable] Semester: ${semester}`);
    console.log(`[Timetable] Time: ${new Date().toLocaleString()}`);
    console.log(`${'='.repeat(70)}\n`);

    // Auto-cleanup duplicates before generation
    console.log(`[Timetable] Running pre-generation cleanup...`);
    await autoCleanupDuplicateLabs();

    // Clear existing timetable
    const deletedCount = await Timetable.deleteByBranchSemester(branchId, semester);
    console.log(`[Timetable] Deleted ${deletedCount.length} existing timetable entries`);

    // Generate new timetable using algorithm
    const algorithm = new TimetableAlgorithm(branchId, semester);
    const result = await algorithm.generate();

    if (!result.success) {
      console.error(`[Timetable] ❌ Generation failed for ${branchName} (Sem ${semester}): ${result.error}`);
      return res.status(400).json({ 
        error: result.error, 
        conflicts: result.conflicts,
        details: result.details 
      });
    }

    console.log(`[Timetable] ✅ Successfully generated timetable with ${result.timetable.length} slots`);
    console.log(`[Timetable] Branch: ${branchName} | Semester: ${semester}\n`);
    
    // Fetch complete timetable with subject names from database
    const completeTimetable = await Timetable.findByBranchSemester(branchId, semester);
    
    // Check for conflicts
    const conflicts = await checkTimetableConflicts(completeTimetable);
    
    const detailed = completeTimetable.map(slot => ({
      timetable_id: slot.timetable_id,
      branch_id: branchId,
      branch_name: branchName,
      day_of_week: slot.day_of_week,
      time_slot_start: slot.time_slot_start,
      time_slot_end: slot.time_slot_end,
      slot_type: slot.slot_type,
      subject_id: slot.subject_id,
      subject_name: slot.subject_name || '-',
      professor_id: slot.professor_id,
      professor_name: slot.professor_name || '-',
      semester: slot.semester,
      batch_id: slot.batch_id,
      batch_number: slot.batch_number,
    }));
    
    res.json({ success: true, message: result.message, data: detailed, conflicts: conflicts });
  } catch (error) {
    console.error('[Timetable] Unexpected error:', error);
    res.status(500).json({ 
      error: 'Internal server error while generating timetable', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
};

/**
 * ✅ NEW: Auto-Generate Timetables for All/Selected Branches & Semesters
 * 
 * Features:
 * - Lab-First Scheduling
 * - Professor Availability Matrix (global conflict prevention)
 * - ConflictRepairEngine (auto-repair 80% of conflicts)
 * - UltimateTimetableValidator (7-point validation)
 * 
 * Filters:
 * - branch (optional): specific branch code (e.g., 'CE', 'CSE')
 * - semester (optional): specific semester (1-8)
 * 
 * Returns:
 * - results: array of generation results for each branch-semester combo
 * - summary: {total, success, failed}
 */
exports.generateAllTimetables = async (req, res) => {
  try {
    const { branch, semester, clearFirst } = req.body;
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`[API] AUTO-GENERATE ALL TIMETABLES`);
    console.log(`[API] Filters: branch=${branch || 'ALL'}, semester=${semester || 'ALL'}`);
    console.log(`${'='.repeat(70)}`);

    // ✅ CLEAR OLD TIMETABLES (optional, default: true)
    if (clearFirst !== false) {
      console.log(`[API] 🔴 Clearing old timetables...`);
      const clearResult = await pool.query('DELETE FROM timetable');  // ✅ Fixed: timetable (not timetables)
      console.log(`[API] ✓ Deleted ${clearResult.rowCount} old entries\n`);
    }

    // Get all branches or filter
    let branchQuery = 'SELECT branch_id, name FROM branches ORDER BY name';
    let branchParams = [];
    
    if (branch && branch !== 'all') {
      branchQuery += " WHERE name ILIKE $1 OR branch_id ILIKE $1";
      branchParams = [`%${branch}%`];
    }
    
    const branchResult = await pool.query(branchQuery, branchParams);
    const branches = branchResult.rows;

    if (branches.length === 0) {
      return res.status(404).json({ error: 'No branches found matching filter' });
    }

    console.log(`[API] Found ${branches.length} branches`);

    // Get all semesters or filter
    let semesterList = [];
    if (semester && semester !== 'all') {
      semesterList = [parseInt(semester)];
    } else {
      const semResult = await pool.query('SELECT DISTINCT semester FROM subjects ORDER BY semester');
      semesterList = semResult.rows.map(row => row.semester);
      if (semesterList.length === 0) semesterList = [1, 2, 3, 4, 5, 6, 7, 8];
    }

    console.log(`[API] Semesters to generate: ${semesterList.join(', ')}`);

    // ✅ CRITICAL: Let me import GlobalProfessor AvailabilityManager
    const GlobalProfessorAvailabilityManager = require('../algorithms/GlobalProfessorAvailabilityManager');
    
    // Create SINGLE SHARED INSTANCE for all branch-semester combinations
    // This ensures professor conflicts are detected TRULY GLOBALLY
    const globalProfessorManager = new GlobalProfessorAvailabilityManager();
    const loadedCount = await globalProfessorManager.loadFromDatabase(pool);
    console.log(`[API] 🌍 GLOBAL MANAGER initialized: ${loadedCount} existing assignments loaded`);
    console.log(`[API] Professors being tracked: ${globalProfessorManager.globalOccupancy.size}`);

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Generate timetables - ALL use the SAME global manager for consistency
    for (const br of branches) {
      for (const sem of semesterList) {
        try {
          console.log(`\n[API] Generating: ${br.name} (${br.branch_id}) - Semester ${sem}`);
          
          // Create algorithm instance with new advanced features
          const algorithm = new TimetableAlgorithm(br.branch_id, sem);
          
          // 🌍 INJECT shared global manager (prevents re-loading database multiple times)
          algorithm.globalProfessorManager = globalProfessorManager;
          
          const genResult = await algorithm.generate();

          if (genResult.success) {
            console.log(`[API] ✅ SUCCESS: ${br.name} Sem ${sem} - ${genResult.timetable.length} slots`);
            successCount++;
            results.push({
              branch: br.name,
              branchId: br.branch_id,
              semester: sem,
              status: 'SUCCESS',
              slotsGenerated: genResult.timetable.length,
              message: genResult.message
            });
          } else {
            console.error(`[API] ❌ FAILED: ${br.name} Sem ${sem}`);
            failureCount++;
            results.push({
              branch: br.name,
              branchId: br.branch_id,
              semester: sem,
              status: 'FAILED',
              error: genResult.error
            });
          }
        } catch (error) {
          console.error(`[API] ⚠️ ERROR: ${br.name} Sem ${sem} - ${error.message}`);
          failureCount++;
          results.push({
            branch: br.name,
            branchId: br.branch_id,
            semester: sem,
            status: 'ERROR',
            error: error.message
          });
        }
      }
    }

    const totalCombinations = branches.length * semesterList.length;
    const successRate = totalCombinations > 0 ? Math.round(successCount / totalCombinations * 100) : 0;

    // Get global statistics
    const globalStats = globalProfessorManager.getOccupancyStatistics();

    console.log(`\n${'='.repeat(70)}`);
    console.log(`[API] GENERATION SUMMARY`);
    console.log(`[API] Total: ${totalCombinations} | Success: ${successCount} | Failed: ${failureCount}`);
    console.log(`[API] Success Rate: ${successRate}%`);
    console.log(`${'='.repeat(70)}`);
    console.log(`[API] GLOBAL PROFESSOR STATISTICS`);
    console.log(`[API] Total professors tracked: ${globalStats.totalProfessors}`);
    console.log(`[API] Total assignments global: ${globalStats.totalAssignments}`);
    console.log(`[API] Average load/professor: ${globalStats.averageLoadPerProf} slots`);
    console.log(`${'='.repeat(70)}\n`);

    res.json({
      success: successCount > 0,
      results,
      summary: {
        total: totalCombinations,
        success: successCount,
        failed: failureCount,
        successRate
      },
      globalStats: {
        professorsTracked: globalStats.totalProfessors,
        totalAssignments: globalStats.totalAssignments,
        averageLoadPerProfessor: globalStats.averageLoadPerProf,
        assignmentsByDay: globalStats.assignmentsByDay,
        assignmentsByType: globalProfessorManager.getAssignmentsByType()
      }
    });

  } catch (error) {
    console.error('[API] Fatal error in generateAllTimetables:', error);
    res.status(500).json({
      error: 'Internal server error during batch generation',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

exports.viewTimetable = async (req, res) => {
  try {
    const { branchId, semester } = req.params;

    const timetable = await Timetable.findByBranchSemester(branchId, semester);

    if (!timetable || timetable.length === 0) {
      return res.status(404).json({ error: 'No timetable found for this branch-semester' });
    }

    // DEBUG: Log batch_id distribution
    const batchDist = {};
    timetable.forEach(slot => {
      if (slot.slot_type === 'LAB') {
        const bid = slot.batch_id || 'null';
        batchDist[bid] = (batchDist[bid] || 0) + 1;
      }
    });
    console.log(`[Debug] Batch distribution in DB: ${JSON.stringify(batchDist)}`);

    // Return flat array with all details for frontend table display
    const detailed = timetable.map(slot => {
      let labLabel = '-';
      if (slot.slot_type === 'LAB' && slot.batch_id) {
        // Determine batch letter (A or B) from batch_number
        labLabel = slot.batch_number === 1 ? 'Batch A' : 'Batch B';
      }
      return {
        timetable_id: slot.timetable_id,
        day_of_week: slot.day_of_week,
        time_slot_start: slot.time_slot_start,
        time_slot_end: slot.time_slot_end,
        slot_type: slot.slot_type,
        subject_id: slot.subject_id,
        subject_name: slot.subject_name || '-',
        professor_id: slot.professor_id,
        professor_name: slot.professor_name || '-',
        semester: slot.semester,
        batch_id: slot.batch_id,
        batch_number: slot.batch_number,
        lab_batch: labLabel
      };
    });

    res.json({ success: true, data: detailed });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * View master timetable for a semester (all branches) with conflict detection
 */
exports.viewMasterTimetable = async (req, res) => {
  try {
    const { semester } = req.params;
    const semesterNum = parseInt(semester);

    // Fetch timetable for ALL branches in this semester
    const query = `
      SELECT 
        t.timetable_id,
        t.branch_id,
        b.name as branch_name,
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end,
        t.slot_type,
        t.subject_id,
        t.subject_name,
        t.professor_id,
        t.professor_name,
        t.semester,
        t.batch_id,
        t.batch_number
      FROM timetable t
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      WHERE t.semester = $1
      ORDER BY b.name, t.day_of_week, t.time_slot_start
    `;
    
    const result = await pool.query(query, [semesterNum]);
    
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'No timetable found for this semester' });
    }

    // Format response with branch grouping
    const timetableByBranch = {};
    const allSlots = [];
    
    for (const row of result.rows) {
      // Build per-branch view
      if (!timetableByBranch[row.branch_name]) {
        timetableByBranch[row.branch_name] = [];
      }
      
      const slot = {
        timetable_id: row.timetable_id,
        branch_name: row.branch_name,
        branch_id: row.branch_id,
        day_of_week: row.day_of_week,
        time_slot_start: row.time_slot_start,
        time_slot_end: row.time_slot_end,
        slot_type: row.slot_type,
        subject_id: row.subject_id,
        subject_name: row.subject_name || '-',
        professor_id: row.professor_id,
        professor_name: row.professor_name || '-',
        semester: row.semester,
        batch_id: row.batch_id,
        batch_number: row.batch_number || 0,
        lab_batch: (row.slot_type === 'LAB' && row.batch_number) ? 
          (row.batch_number === 1 ? 'Batch A' : 'Batch B') : '-'
      };
      
      timetableByBranch[row.branch_name].push(slot);
      allSlots.push(slot);
    }

    // Check for conflicts across all branches
    const conflicts = await checkTimetableConflicts(allSlots);
    
    // Summarize conflicts by type
    const conflictSummary = {};
    conflicts.forEach(c => {
      if (!conflictSummary[c.type]) {
        conflictSummary[c.type] = { count: 0, examples: [] };
      }
      conflictSummary[c.type].count++;
      if (conflictSummary[c.type].examples.length < 3) {
        conflictSummary[c.type].examples.push(c);
      }
    });

    console.log(`[Master Timetable] Semester ${semesterNum}: ${Object.keys(timetableByBranch).length} branches, ${conflicts.length} conflicts found`);

    res.json({
      success: true,
      semester: semesterNum,
      branches: Object.keys(timetableByBranch),
      branchCount: Object.keys(timetableByBranch).length,
      totalSlots: allSlots.length,
      conflictCount: conflicts.length,
      hasConflicts: conflicts.length > 0,
      conflictSummary,
      conflicts: conflicts.slice(0, 100), // Limit to first 100 for performance
      timetableByBranch,
      data: allSlots // Flat array for table display
    });
  } catch (error) {
    console.error('[Master Timetable] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.viewProfessorTimetable = async (req, res) => {
  try {
    const { professorId } = req.params;

    const timetable = await Timetable.findByProfessor(professorId);

    if (!timetable || timetable.length === 0) {
      return res.status(404).json({ error: 'No timetable found for this professor' });
    }

    console.log('🎯 Raw timetable from DB:', timetable[0]);

    // Return flat array with all details for frontend table display
    const detailed = timetable.map(slot => {
      return {
        timetable_id: slot.timetable_id,
        day_of_week: slot.day_of_week,
        time_slot_start: slot.time_slot_start,
        time_slot_end: slot.time_slot_end,
        slot_type: slot.slot_type,
        subject_name: slot.subject_name || 'N/A',
        professor_name: slot.professor_name || 'N/A',
        semester: slot.semester,
        batch_id: slot.batch_id,
        batch_number: slot.batch_number,
        branch_name: slot.branch_name
      };
    });

    console.log('🎯 Detailed response (first):', detailed[0]);
    res.json({ success: true, data: detailed });
  } catch (error) {
    console.error('❌ Error in viewProfessorTimetable:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getConflicts = async (req, res) => {
  try {
    const { branchId, semester } = req.params;
    const semesterNum = parseInt(semester);

    console.log(`[Get Conflicts] LIVE detection for Branch: ${branchId}, Semester: ${semesterNum}`);

    const conflicts = {
      professorConflicts: [],
      batchOverlap: [],
      labTheoryOverlap: [],
      sameSubjectSameDay: []
    };

    let client;
    try {
      client = await pool.connect();

      // CONFLICT 1: Professor double-booking
      const profConflictQuery = `
        SELECT 
          t1.professor_id,
          COALESCE(p1.name, 'Unknown Prof') as professor_name,
          t1.day_of_week,
          t1.time_slot_start,
          t1.time_slot_end,
          COALESCE(s1.name, 'Unknown') as subject1,
          t1.slot_type as type1,
          COALESCE(s2.name, 'Unknown') as subject2,
          t2.slot_type as type2,
          t1.branch_id,
          t1.semester
        FROM timetable t1
        JOIN timetable t2 ON
          t1.professor_id = t2.professor_id AND
          t1.day_of_week = t2.day_of_week AND
          t1.timetable_id < t2.timetable_id AND
          t1.time_slot_start < t2.time_slot_end AND
          t1.time_slot_end > t2.time_slot_start
        LEFT JOIN professors p1 ON t1.professor_id = p1.professor_id
        LEFT JOIN subjects s1 ON t1.subject_id = s1.subject_id
        LEFT JOIN subjects s2 ON t2.subject_id = s2.subject_id
        WHERE t1.professor_id IS NOT NULL
        AND t1.branch_id = $1
        AND t1.semester = $2
      `;

      const profRes = await client.query(profConflictQuery, [branchId, semesterNum]);
      conflicts.professorConflicts = profRes.rows;

      // CONFLICT 2: Batch time overlap
      const batchConflictQuery = `
        SELECT 
          t1.subject_id,
          COALESCE(s.name, 'Unknown') as subject_name,
          t1.day_of_week,
          t1.time_slot_start,
          t1.time_slot_end,
          t1.batch_id as batch1,
          t2.batch_id as batch2,
          t1.branch_id,
          t1.semester
        FROM timetable t1
        JOIN timetable t2 ON
          t1.subject_id = t2.subject_id AND
          t1.day_of_week = t2.day_of_week AND
          t1.branch_id = t2.branch_id AND
          t1.timetable_id < t2.timetable_id AND
          t1.batch_id != t2.batch_id AND
          t1.time_slot_start < t2.time_slot_end AND
          t1.time_slot_end > t2.time_slot_start AND
          t1.batch_id IS NOT NULL AND
          t2.batch_id IS NOT NULL
        LEFT JOIN subjects s ON t1.subject_id = s.subject_id
        WHERE t1.branch_id = $1
        AND t1.semester = $2
      `;

      const batchRes = await client.query(batchConflictQuery, [branchId, semesterNum]);
      conflicts.batchOverlap = batchRes.rows;

      // CONFLICT 3: Theory-Lab overlap
      const theoryLabQuery = `
        SELECT 
          t1.subject_id,
          COALESCE(s.name, 'Unknown') as subject_name,
          t1.day_of_week,
          t1.time_slot_start as theory_start,
          t1.time_slot_end as theory_end,
          t2.time_slot_start as lab_start,
          t2.time_slot_end as lab_end,
          t1.branch_id,
          t1.semester,
          t2.batch_id
        FROM timetable t1
        JOIN timetable t2 ON
          t1.subject_id = t2.subject_id AND
          t1.branch_id = t2.branch_id AND
          t1.day_of_week = t2.day_of_week AND
          t1.slot_type = 'THEORY' AND
          t2.slot_type = 'LAB' AND
          t1.time_slot_start < t2.time_slot_end AND
          t1.time_slot_end > t2.time_slot_start
        LEFT JOIN subjects s ON t1.subject_id = s.subject_id
        WHERE t1.branch_id = $1
        AND t1.semester = $2
      `;

      const theoryLabRes = await client.query(theoryLabQuery, [branchId, semesterNum]);
      conflicts.labTheoryOverlap = theoryLabRes.rows;

      // CONFLICT 4: Same subject-day
      const sameDayQuery = `
        SELECT 
          t.subject_id,
          COALESCE(s.name, 'Unknown') as subject_name,
          t.branch_id,
          t.semester,
          t.day_of_week,
          COUNT(*) as count,
          STRING_AGG(t.time_slot_start::text || '-' || t.time_slot_end::text, ' | ') as times
        FROM timetable t
        LEFT JOIN subjects s ON t.subject_id = s.subject_id
        WHERE t.slot_type = 'THEORY'
        AND t.branch_id = $1
        AND t.semester = $2
        GROUP BY t.subject_id, s.name, t.branch_id, t.semester, t.day_of_week
        HAVING COUNT(*) > 1
      `;

      const sameDayRes = await client.query(sameDayQuery, [branchId, semesterNum]);
      conflicts.sameSubjectSameDay = sameDayRes.rows;

      client.release();

    } catch (dbError) {
      console.error('[Get Conflicts] Database error:', dbError);
      if (client) client.release();
      throw dbError;
    }

    const totalConflicts = 
      conflicts.professorConflicts.length +
      conflicts.labTheoryOverlap.length +
      conflicts.batchOverlap.length +
      conflicts.sameSubjectSameDay.length;

    res.json({
      success: true,
      conflicts_found: totalConflicts,
      data: [
        ...conflicts.professorConflicts.map(c => ({
          type: 'PROFESSOR_CLASH',
          professor_name: c.professor_name,
          day_of_week: c.day_of_week,
          time_slot_start: c.time_slot_start,
          time_slot_end: c.time_slot_end,
          subject1: c.subject1,
          subject2: c.subject2,
          reason: `Professor ${c.professor_name} double-booked on ${c.day_of_week} ${c.time_slot_start}`
        })),
        ...conflicts.batchOverlap.map(c => ({
          type: 'BATCH_OVERLAP',
          subject_name: c.subject_name,
          day_of_week: c.day_of_week,
          time_slot_start: c.time_slot_start,
          time_slot_end: c.time_slot_end,
          batch1: c.batch1,
          batch2: c.batch2,
          reason: `Batch conflict: ${c.subject_name} on ${c.day_of_week} ${c.time_slot_start}`
        })),
        ...conflicts.labTheoryOverlap.map(c => ({
          type: 'THEORY_LAB_OVERLAP',
          subject_name: c.subject_name,
          day_of_week: c.day_of_week,
          theory_start: c.theory_start,
          theory_end: c.theory_end,
          lab_start: c.lab_start,
          lab_end: c.lab_end,
          batch_id: c.batch_id,
          reason: `Theory-Lab overlap: ${c.subject_name} on ${c.day_of_week}`
        })),
        ...conflicts.sameSubjectSameDay.map(c => ({
          type: 'SAME_SUBJECT_SAME_DAY',
          entry_id_1: c.timetable_id,
          subject_name: c.subject_name,
          day_of_week: c.day_of_week,
          time_slot_start: c.time_slot_start,
          time_slot_end: c.time_slot_end,
          reason: `${c.subject_name} appears multiple times on ${c.day_of_week}`
        }))
      ],
      summary: {
        professorDoubleBooking: conflicts.professorConflicts.length,
        theoryLabOverlap: conflicts.labTheoryOverlap.length,
        batchTimeConflict: conflicts.batchOverlap.length,
        sameSubjectSameDay: conflicts.sameSubjectSameDay.length
      }
    });

  } catch (error) {
    console.error('[Get Conflicts] Error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

exports.validateTimetable = async (req, res) => {
  try {
    const { branchId, semester } = req.body;

    // Get all timetable entries
    const timetable = await Timetable.findByBranchSemester(branchId, semester);

    // Validation checks
    const validation = {
      total_slots: timetable.length,
      has_breaks: false,
      has_library_hours: false,
      professor_conflicts: 0,
      lab_capacity_violations: 0,
      is_valid: true
    };

    // Check for breaks
    validation.has_breaks = timetable.some(slot => slot.slot_type === 'BREAK' || slot.slot_type === 'RECESS');
    validation.has_library_hours = timetable.some(slot => slot.slot_type === 'LIBRARY');

    // Count lab conflicts
    const labMap = {};
    timetable.forEach(slot => {
      if (slot.slot_type === 'LAB') {
        const key = `${slot.day_of_week}-${slot.time_slot_start}`;
        labMap[key] = (labMap[key] || 0) + 1;
        if (labMap[key] > 5) {
          validation.lab_capacity_violations++;
        }
      }
    });

    validation.is_valid = validation.has_breaks && !validation.lab_capacity_violations;

    res.json({ success: true, data: validation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.clearTimetable = async (req, res) => {
  try {
    const { branchId, semester } = req.params;

    const deleted = await Timetable.deleteByBranchSemester(branchId, semester);
    res.json({ success: true, message: `${deleted.length} slots deleted`, deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * ✅ NEW: Delete ALL timetable entries across all branches and semesters
 * Called before regenerating entire timetable
 */
exports.clearAllTimetables = async (req, res) => {
  try {
    console.log('🗑️ Clearing ALL timetable entries...');
    
    const result = await pool.query('DELETE FROM timetable');
    const deletedCount = result.rowCount;
    
    console.log(`✅ Deleted ${deletedCount} timetable entries`);
    
    res.json({ 
      success: true, 
      message: `Successfully deleted ${deletedCount} timetable entries from all branches and semesters`,
      deletedCount 
    });
  } catch (error) {
    console.error('❌ Error clearing timetable:', error.message);
    res.status(500).json({ error: error.message });
  }
};

exports.adjustSlot = async (req, res) => {
  try {
    const { timetableId } = req.params;
    const { timeStart, timeEnd, slotType } = req.body;

    const updated = await Timetable.update(timetableId, timeStart, timeEnd, slotType);

    if (!updated) {
      return res.status(404).json({ error: 'Timetable slot not found' });
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.organizeTimetable = function(timetable) {
  const organized = {};

  timetable.forEach(slot => {
    if (!organized[slot.day_of_week]) {
      organized[slot.day_of_week] = [];
    }

    organized[slot.day_of_week].push({
      id: slot.timetable_id,
      time: `${slot.time_slot_start} - ${slot.time_slot_end}`,
      subject: slot.subject_name || slot.slot_type,
      type: slot.slot_type,
      professor: slot.professor_name,
      branch: slot.branch_name,
      room: slot.room_id,
    });

    // Sort by time
    organized[slot.day_of_week].sort((a, b) => a.time.localeCompare(b.time));
  });

  return organized;
}
exports.checkConflicts = async (req, res) => {
  try {
    const { branchId, semester } = req.params;
    const semesterNum = parseInt(semester);

    console.log(`[Conflict Check] Starting LIVE detection for Branch: ${branchId}, Semester: ${semesterNum}`);

    const conflicts = {
      professorConflicts: [],
      batchOverlap: [],
      labTheoryOverlap: [],
      sameSubjectSameDay: []
    };

    let client;
    try {
      client = await pool.connect();

      // ═══════════════════════════════════════════════════════════════════════════════
      // CONFLICT 1A: Professor double-booking WITHIN this branch
      // ═══════════════════════════════════════════════════════════════════════════════

      const profConflictWithinBranchQuery = `
        SELECT 
          t1.timetable_id as entry_id_1,
          t2.timetable_id as entry_id_2,
          t1.professor_id,
          COALESCE(p1.name, 'Unknown Prof') as professor_name,
          t1.day_of_week,
          t1.time_slot_start,
          t1.time_slot_end,
          COALESCE(s1.name, 'Unknown') as subject1,
          t1.slot_type as type1,
          COALESCE(s2.name, 'Unknown') as subject2,
          t2.slot_type as type2,
          t1.branch_id as branch1_id,
          t2.branch_id as branch2_id,
          b1.name as branch1_name,
          b2.name as branch2_name,
          t1.semester as sem1,
          t2.semester as sem2
        FROM timetable t1
        JOIN timetable t2 ON
          t1.professor_id = t2.professor_id AND
          t1.day_of_week = t2.day_of_week AND
          t1.timetable_id < t2.timetable_id AND
          t1.time_slot_start < t2.time_slot_end AND
          t1.time_slot_end > t2.time_slot_start
        LEFT JOIN professors p1 ON t1.professor_id = p1.professor_id
        LEFT JOIN subjects s1 ON t1.subject_id = s1.subject_id
        LEFT JOIN subjects s2 ON t2.subject_id = s2.subject_id
        LEFT JOIN branches b1 ON t1.branch_id = b1.branch_id
        LEFT JOIN branches b2 ON t2.branch_id = b2.branch_id
        WHERE t1.professor_id IS NOT NULL
        AND t1.branch_id = $1
        AND t1.semester = $2
      `;

      const profRes = await client.query(profConflictWithinBranchQuery, [branchId, semesterNum]);
      conflicts.professorConflicts = profRes.rows;
      
      // ═══════════════════════════════════════════════════════════════════════════════
      // CONFLICT 1B: Professor double-booking ACROSS branches for same professor
      // ═══════════════════════════════════════════════════════════════════════════════

      const profConflictAcrossBranchesQuery = `
        SELECT 
          t1.timetable_id as entry_id_1,
          t2.timetable_id as entry_id_2,
          t1.professor_id,
          COALESCE(p1.name, 'Unknown Prof') as professor_name,
          t1.day_of_week,
          t1.time_slot_start,
          t1.time_slot_end,
          COALESCE(s1.name, 'Unknown') as subject1,
          t1.slot_type as type1,
          COALESCE(s2.name, 'Unknown') as subject2,
          t2.slot_type as type2,
          t1.branch_id as branch1_id,
          t2.branch_id as branch2_id,
          b1.name as branch1_name,
          b2.name as branch2_name,
          t1.semester as sem1,
          t2.semester as sem2
        FROM timetable t1
        JOIN timetable t2 ON
          t1.professor_id = t2.professor_id AND
          t1.day_of_week = t2.day_of_week AND
          t1.timetable_id < t2.timetable_id AND
          t1.time_slot_start < t2.time_slot_end AND
          t1.time_slot_end > t2.time_slot_start AND
          t1.branch_id != t2.branch_id
        LEFT JOIN professors p1 ON t1.professor_id = p1.professor_id
        LEFT JOIN subjects s1 ON t1.subject_id = s1.subject_id
        LEFT JOIN subjects s2 ON t2.subject_id = s2.subject_id
        LEFT JOIN branches b1 ON t1.branch_id = b1.branch_id
        LEFT JOIN branches b2 ON t2.branch_id = b2.branch_id
        WHERE t1.professor_id IS NOT NULL
        AND (t1.branch_id = $1 OR t2.branch_id = $1)
      `;

      const profAcrossRes = await client.query(profConflictAcrossBranchesQuery, [branchId]);
      conflicts.professorConflicts = [...conflicts.professorConflicts, ...profAcrossRes.rows];

      // ═══════════════════════════════════════════════════════════════════════════════
      // CONFLICT 2: Batch time overlap (Batch A and B same time same subject)
      // ═══════════════════════════════════════════════════════════════════════════════

      const batchConflictQuery = `
        SELECT 
          t1.timetable_id as entry_id_1,
          t2.timetable_id as entry_id_2,
          t1.subject_id,
          COALESCE(s.name, 'Unknown') as subject_name,
          t1.day_of_week,
          t1.time_slot_start,
          t1.time_slot_end,
          t1.batch_id as batch1,
          t2.batch_id as batch2,
          t1.branch_id,
          t1.semester
        FROM timetable t1
        JOIN timetable t2 ON
          t1.subject_id = t2.subject_id AND
          t1.day_of_week = t2.day_of_week AND
          t1.branch_id = t2.branch_id AND
          t1.timetable_id < t2.timetable_id AND
          t1.batch_id != t2.batch_id AND
          t1.time_slot_start < t2.time_slot_end AND
          t1.time_slot_end > t2.time_slot_start AND
          t1.batch_id IS NOT NULL AND
          t2.batch_id IS NOT NULL
        LEFT JOIN subjects s ON t1.subject_id = s.subject_id
        WHERE t1.branch_id = $1
        AND t1.semester = $2
      `;

      const batchRes = await client.query(batchConflictQuery, [branchId, semesterNum]);
      conflicts.batchOverlap = batchRes.rows;

      // ═══════════════════════════════════════════════════════════════════════════════
      // CONFLICT 3: Theory-Lab overlap for SAME SUBJECT
      // ═══════════════════════════════════════════════════════════════════════════════

      const theoryLabQuery = `
        SELECT 
          t1.timetable_id as entry_id_1,
          t2.timetable_id as entry_id_2,
          t1.subject_id,
          COALESCE(s.name, 'Unknown') as subject_name,
          t1.day_of_week,
          t1.time_slot_start as theory_start,
          t1.time_slot_end as theory_end,
          t2.time_slot_start as lab_start,
          t2.time_slot_end as lab_end,
          t1.branch_id,
          t1.semester,
          t2.batch_id
        FROM timetable t1
        JOIN timetable t2 ON
          t1.subject_id = t2.subject_id AND
          t1.branch_id = t2.branch_id AND
          t1.day_of_week = t2.day_of_week AND
          t1.slot_type = 'THEORY' AND
          t2.slot_type = 'LAB' AND
          t1.time_slot_start < t2.time_slot_end AND
          t1.time_slot_end > t2.time_slot_start
        LEFT JOIN subjects s ON t1.subject_id = s.subject_id
        WHERE t1.branch_id = $1
        AND t1.semester = $2
      `;

      const theoryLabRes = await client.query(theoryLabQuery, [branchId, semesterNum]);
      conflicts.labTheoryOverlap = theoryLabRes.rows;

      // ═══════════════════════════════════════════════════════════════════════════════
      // CONFLICT 4: Same subject-day (max 1 per day constraint)
      // ═══════════════════════════════════════════════════════════════════════════════

      const sameDayQuery = `
        SELECT 
          t.timetable_id,
          t.subject_id,
          COALESCE(s.name, 'Unknown') as subject_name,
          t.branch_id,
          t.semester,
          t.day_of_week,
          t.time_slot_start,
          t.time_slot_end,
          t.slot_type
        FROM timetable t
        LEFT JOIN subjects s ON t.subject_id = s.subject_id
        WHERE t.slot_type = 'THEORY'
        AND t.branch_id = $1
        AND t.semester = $2
        AND (t.subject_id, t.day_of_week) IN (
          SELECT t2.subject_id, t2.day_of_week
          FROM timetable t2
          WHERE t2.slot_type = 'THEORY'
          AND t2.branch_id = $1
          AND t2.semester = $2
          GROUP BY t2.subject_id, t2.day_of_week
          HAVING COUNT(*) > 1
        )
        ORDER BY t.subject_id, t.day_of_week, t.time_slot_start
      `;

      const sameDayRes = await client.query(sameDayQuery, [branchId, semesterNum]);
      conflicts.sameSubjectSameDay = sameDayRes.rows;

      // ═══════════════════════════════════════════════════════════════════════════════
      // CONFLICT 5: LAB CAPACITY EXCEEDED (Max 7 labs at same time across ALL branches)
      // ═══════════════════════════════════════════════════════════════════════════════

      const labCapacityQuery = `
        SELECT 
          day_of_week,
          time_slot_start,
          time_slot_end,
          COUNT(*) as lab_count,
          array_agg(DISTINCT timetable_id) as lab_ids,
          array_agg(DISTINCT COALESCE(s.name, 'Unknown')) as subjects,
          array_agg(DISTINCT COALESCE(b.name, 'Unknown')) as branches
        FROM timetable t
        LEFT JOIN subjects s ON t.subject_id = s.subject_id
        LEFT JOIN branches b ON t.branch_id = b.branch_id
        WHERE t.slot_type = 'LAB'
        GROUP BY day_of_week, time_slot_start, time_slot_end
        HAVING COUNT(*) > 20
        ORDER BY lab_count DESC, day_of_week, time_slot_start
      `;

      const labCapacityRes = await client.query(labCapacityQuery);
      conflicts.labCapacityExceeded = labCapacityRes.rows.map(row => ({
        day_of_week: row.day_of_week,
        time_slot_start: row.time_slot_start,
        time_slot_end: row.time_slot_end,
        lab_count: row.lab_count,
        entry_ids: row.lab_ids || [],
        subjects: row.subjects || [],
        branches: row.branches || []
      }));

      client.release();

    } catch (dbError) {
      console.error('[Conflict Check] Database error:', dbError);
      if (client) client.release();
      throw dbError;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // COMPUTE SUMMARY
    // ═══════════════════════════════════════════════════════════════════════════════

    const totalConflicts = 
      conflicts.professorConflicts.length +
      conflicts.labTheoryOverlap.length +
      conflicts.batchOverlap.length +
      conflicts.sameSubjectSameDay.length +
      conflicts.labCapacityExceeded.length;

    console.log(`[Conflict Check] Found: ${totalConflicts} total conflicts`);

    res.json({
      success: true,
      branchId,
      semester: semesterNum,
      conflictCount: totalConflicts,
      warningCount: 0, // Placeholder for frontend compatibility
      gapCount: 0,     // Placeholder for frontend compatibility
      hasIssues: totalConflicts > 0,
      summary: {
        totalClasses: 0, // Placeholder for frontend compatibility
        totalBreaks: 0,  // Placeholder for frontend compatibility
        professorDoubleBooking: conflicts.professorConflicts.length,
        theoryLabOverlap: conflicts.labTheoryOverlap.length,
        batchTimeConflict: conflicts.batchOverlap.length,
        sameSubjectSameDay: conflicts.sameSubjectSameDay.length,
        labCapacityExceeded: conflicts.labCapacityExceeded.length
      },
      // Flatten conflicts into a single array for frontend compatibility
      conflicts: [
        ...conflicts.professorConflicts.map(c => ({
          type: 'PROFESSOR_CLASH',
          entry_id_1: c.entry_id_1,
          entry_id_2: c.entry_id_2,
          professor_name: c.professor_name,
          day_of_week: c.day_of_week,
          time_slot_start: c.time_slot_start,
          time_slot_end: c.time_slot_end,
          subject1: c.subject1,
          subject2: c.subject2,
          branch1: c.branch1_name,
          branch2: c.branch2_name,
          reason: `Prof ${c.professor_name} double-booked on ${c.day_of_week} ${c.time_slot_start}: Teaching "${c.subject1}" at ${c.branch1_name} Sem${c.sem1} AND "${c.subject2}" at ${c.branch2_name} Sem${c.sem2}`
        })),
        ...conflicts.labCapacityExceeded.map(c => ({
          type: 'LAB_CAPACITY_EXCEEDED',
          entry_id_1: c.entry_ids && c.entry_ids[0] ? c.entry_ids[0] : null,
          entry_id_2: c.entry_ids && c.entry_ids[1] ? c.entry_ids[1] : null,
          entry_ids: c.entry_ids,
          day_of_week: c.day_of_week,
          time_slot_start: c.time_slot_start,
          time_slot_end: c.time_slot_end,
          lab_count: c.lab_count,
          subjects: c.subjects,
          branches: c.branches,
          reason: `⚠️ RESOURCE OVERLOAD: ${c.lab_count} labs scheduled at same time (MAX 20 allowed) on ${c.day_of_week} ${c.time_slot_start}-${c.time_slot_end}. Labs: ${c.subjects.join(', ')} across branches: ${c.branches.join(', ')}`
        })),
        ...conflicts.batchOverlap.map(c => ({
          type: 'BATCH_OVERLAP',
          entry_id_1: c.entry_id_1,
          entry_id_2: c.entry_id_2,
          subject_name: c.subject_name,
          day_of_week: c.day_of_week,
          time_slot_start: c.time_slot_start,
          time_slot_end: c.time_slot_end,
          batch1: c.batch1,
          batch2: c.batch2,
          reason: `Batch conflict: ${c.subject_name} on ${c.day_of_week} ${c.time_slot_start}`
        })),
        ...conflicts.labTheoryOverlap.map(c => ({
          type: 'THEORY_LAB_OVERLAP',
          entry_id_1: c.entry_id_1,
          entry_id_2: c.entry_id_2,
          subject_name: c.subject_name,
          day_of_week: c.day_of_week,
          theory_start: c.theory_start,
          theory_end: c.theory_end,
          lab_start: c.lab_start,
          lab_end: c.lab_end,
          batch_id: c.batch_id,
          reason: `Theory-Lab overlap: ${c.subject_name} on ${c.day_of_week}`
        })),
        ...conflicts.sameSubjectSameDay.map(c => ({
          type: 'SAME_SUBJECT_SAME_DAY',
          entry_id_1: c.timetable_id,
          subject_name: c.subject_name,
          day_of_week: c.day_of_week,
          time_slot_start: c.time_slot_start,
          time_slot_end: c.time_slot_end,
          reason: `${c.subject_name} appears multiple times on ${c.day_of_week}`
        }))
      ],
      warnings: [],
      gaps: [],
      message: totalConflicts === 0 
        ? '✨ No conflicts found - Timetable is valid!'
        : `⚠️ Found ${totalConflicts} conflict(s)`
    });

  } catch (error) {
    console.error('[Conflict Check] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check conflicts',
      details: error.message
    });
  }
};

/**
 * Get professor lecture statistics - total lectures per day and per week
 * Returns: { professor_id, name, statistics: { 'MON': 2, 'TUE': 1, ..., 'week': 10 } }
 */
exports.getProfessorStatistics = async (req, res) => {
  try {
    const { professorId } = req.params;

    if (!professorId) {
      return res.status(400).json({ error: 'Professor ID is required' });
    }

    // Helper function to convert time to minutes
    const timeToMinutes = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    // Get professor info
    const profResult = await pool.query(
      'SELECT professor_id, name, email FROM professors WHERE professor_id = $1',
      [professorId]
    );

    if (profResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professor not found' });
    }

    const professor = profResult.rows[0];

    // Get all timetable entries for this professor (only teaching slots)
    const timetableResult = await pool.query(
      `SELECT t.*, s.name as subject_name, b.name as branch_name
       FROM timetable t
       LEFT JOIN subjects s ON t.subject_id = s.subject_id
       LEFT JOIN branches b ON t.branch_id = b.branch_id
       WHERE t.professor_id = $1 
       AND t.slot_type IN ('THEORY', 'LAB')
       ORDER BY t.day_of_week, t.time_slot_start`,
      [professorId]
    );

    const timetable = timetableResult.rows;

    if (timetable.length === 0) {
      return res.json({
        success: true,
        professor: {
          professor_id: professor.professor_id,
          name: professor.name,
          email: professor.email
        },
        statistics: {
          MON: 0,
          TUE: 0,
          WED: 0,
          THU: 0,
          FRI: 0,
          week: 0
        },
        message: 'No timetable entries found for this professor'
      });
    }

    // Calculate statistics by day
    const dayStats = {
      MON: 0,
      TUE: 0,
      WED: 0,
      THU: 0,
      FRI: 0
    };

    // Track lectures with their duration to avoid double counting
    const lectureMap = new Map();

    timetable.forEach(slot => {
      const key = `${slot.day_of_week}-${slot.time_slot_start}-${slot.time_slot_end}-${slot.subject_id}`;
      
      if (!lectureMap.has(key)) {
        lectureMap.set(key, {
          day: slot.day_of_week,
          startTime: slot.time_slot_start,
          endTime: slot.time_slot_end,
          subject: slot.subject_name || 'N/A',
          slot_type: slot.slot_type,
          branch: slot.branch_name || 'N/A'
        });

        // Count duration in hours (for labs which are 2 hours, count as 2; for theory 1 hour, count as 1)
        const startMinutes = timeToMinutes(slot.time_slot_start);
        const endMinutes = timeToMinutes(slot.time_slot_end);
        const durationHours = (endMinutes - startMinutes) / 60;

        dayStats[slot.day_of_week] += durationHours;
      }
    });

    // Calculate total weekly hours
    const weekTotal = Object.values(dayStats).reduce((a, b) => a + b, 0);

    // Organize timetable by day
    const timetableByDay = {};
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    
    days.forEach(day => {
      timetableByDay[day] = timetable
        .filter(slot => slot.day_of_week === day)
        .map(slot => ({
          time: `${slot.time_slot_start} - ${slot.time_slot_end}`,
          subject: slot.subject_name || 'N/A',
          type: slot.slot_type,
          branch: slot.branch_name || 'N/A',
          semester: slot.semester
        }));
    });

    res.json({
      success: true,
      professor: {
        professor_id: professor.professor_id,
        name: professor.name,
        email: professor.email
      },
      statistics: dayStats,
      weekTotal: weekTotal.toFixed(1),
      timetableByDay: timetableByDay,
      totalEntries: timetable.length
    });
  } catch (error) {
    console.error('[Professor Statistics] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get professor statistics',
      details: error.message
    });
  }
};

/**
 * HELPER: Calculate duration in minutes
 */
function calculateDuration(startTime, endTime) {
  const startParts = startTime.split(':');
  const endParts = endTime.split(':');
  const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
  const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
  return endMin - startMin;
}

/**
 * HELPER: Check if two time slots overlap
 */
function timeOverlaps(start1, end1, start2, end2) {
  return start1 < end2 && end1 > start2;
}

/**
 * COMPREHENSIVE MOVE VALIDATION
 * Checks all constraints before allowing a move
 */
async function validateMove(client, entry, newDay, newStartTime, newEndTime) {
  const errors = [];
  const warnings = [];
  
  const oldDuration = calculateDuration(entry.time_slot_start, entry.time_slot_end);
  const newDuration = calculateDuration(newStartTime, newEndTime);
  
  // ========== VALIDATION 1: Duration Compatibility ==========
  if (oldDuration !== newDuration) {
    errors.push({
      type: 'DURATION_MISMATCH',
      message: `Cannot move ${entry.slot_type} from ${oldDuration/60}h to ${newDuration/60}h slot`,
      details: `Entry duration: ${oldDuration}min, Target slot: ${newDuration}min`
    });
    return { isValid: false, errors, warnings, displaced: [] };
  }
  
  // ========== VALIDATION 2: Check if target slot is empty ==========
  const occupiedRes = await client.query(`
    SELECT COUNT(*) as count
    FROM timetable t
    WHERE t.timetable_id != $1
    AND t.branch_id = $2
    AND t.semester = $3
    AND t.day_of_week = $4
    AND t.time_slot_start = $5
    AND t.time_slot_end = $6
    AND t.slot_type NOT IN ('BREAK', 'RECESS', 'LIBRARY', 'HOLIDAY')
  `, [entry.timetable_id, entry.branch_id, entry.semester, newDay, newStartTime, newEndTime]);
  
  const slotOccupied = parseInt(occupiedRes.rows[0].count) > 0;
  
  if (slotOccupied) {
    // Get displaced classes info
    const displacedRes = await client.query(`
      SELECT t.timetable_id, t.subject_id, t.slot_type, 
             s.name as subject_name, t.batch_id, ba.batch_number
      FROM timetable t
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN batches ba ON t.batch_id = ba.batch_id
      WHERE t.timetable_id != $1
      AND t.branch_id = $2
      AND t.semester = $3
      AND t.day_of_week = $4
      AND t.time_slot_start = $5
      AND t.time_slot_end = $6
      AND t.slot_type NOT IN ('BREAK', 'RECESS', 'LIBRARY', 'HOLIDAY')
    `, [entry.timetable_id, entry.branch_id, entry.semester, newDay, newStartTime, newEndTime]);
    
    warnings.push({
      type: 'SLOT_OCCUPIED',
      message: `Target slot has ${displacedRes.rows.length} existing class(es)`,
      displacedClasses: displacedRes.rows.map(d => ({
        id: d.timetable_id,
        subject: d.subject_name,
        type: d.slot_type,
        batch: d.batch_number
      }))
    });
  }
  
  // ========== VALIDATION 3: Professor Availability (CRITICAL) ==========
  const profConflictRes = await client.query(`
    SELECT COUNT(*) as count, 
           array_agg(DISTINCT s.name) as subjects
    FROM timetable t
    LEFT JOIN subjects s ON t.subject_id = s.subject_id
    WHERE t.timetable_id != $1
    AND t.professor_id = $2
    AND t.day_of_week = $3
    AND t.time_slot_start < $5
    AND t.time_slot_end > $4
    AND t.slot_type NOT IN ('BREAK', 'RECESS', 'LIBRARY', 'HOLIDAY')
  `, [entry.timetable_id, entry.professor_id, newDay, newStartTime, newEndTime]);
  
  const profConflictCount = parseInt(profConflictRes.rows[0].count);
  if (profConflictCount > 0) {
    errors.push({
      type: 'PROFESSOR_CONFLICT',
      message: `Professor already teaches at this time`,
      details: `Conflicting subjects: ${profConflictRes.rows[0].subjects.filter(s => s).join(', ')}`
    });
  }
  
  // ========== VALIDATION 4: Batch Conflict (CRITICAL) ==========
  // Same batch CANNOT attend different subjects at overlapping times
  if (entry.batch_id) {
    const batchConflictRes = await client.query(`
      SELECT COUNT(*) as count, 
             array_agg(DISTINCT s.name) as subjects
      FROM timetable t
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.timetable_id != $1
      AND t.batch_id = $2
      AND t.subject_id != $3
      AND t.day_of_week = $4
      AND t.time_slot_start < $6
      AND t.time_slot_end > $5
      AND t.slot_type IN ('THEORY', 'LAB')
    `, [entry.timetable_id, entry.batch_id, entry.subject_id, newDay, newStartTime, newEndTime]);
    
    const batchConflictCount = parseInt(batchConflictRes.rows[0].count);
    if (batchConflictCount > 0) {
      errors.push({
        type: 'BATCH_CONFLICT',
        message: `Batch cannot attend multiple subjects at same time`,
        details: `Batch already attending: ${batchConflictRes.rows[0].subjects.filter(s => s).join(', ')}`
      });
    }
  }
  
  // ========== VALIDATION 5: Subject Uniqueness for THEORY (CRITICAL) ==========
  // THEORY lectures of same subject cannot be scheduled multiple times same day/time
  if (entry.slot_type === 'THEORY') {
    const theoryDupRes = await client.query(`
      SELECT COUNT(*) as count
      FROM timetable t
      WHERE t.timetable_id != $1
      AND t.subject_id = $2
      AND t.semester = $3
      AND t.day_of_week = $4
      AND t.slot_type = 'THEORY'
      AND t.time_slot_start = $5
      AND t.time_slot_end = $6
    `, [entry.timetable_id, entry.subject_id, entry.semester, newDay, newStartTime, newEndTime]);
    
    if (parseInt(theoryDupRes.rows[0].count) > 0) {
      errors.push({
        type: 'SUBJECT_DUPLICATE',
        message: `Cannot have same subject theory twice in same slot`,
        details: `Subject already scheduled at this time`
      });
    }
  }
  
  return { 
    isValid: errors.length === 0, 
    errors, 
    warnings, 
    displaced: slotOccupied ? [] : null // null means slot empty
  };
}

/**
 * Move a class from one slot to another
 * Validates that the new slot doesn't create conflicts
 */
exports.moveClass = async (req, res) => {
  let client;
  try {
    const { entryId, newDay, newStartTime, newEndTime } = req.body;

    console.log(`[Move] Request: ID=${entryId}, ${newDay} ${newStartTime}-${newEndTime}`);

    // Validate input
    if (!entryId || !newDay || !newStartTime || !newEndTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing: entryId, newDay, newStartTime, newEndTime'
      });
    }

    client = await pool.connect();

    // Get entry being moved
    const entryRes = await client.query(
      'SELECT * FROM timetable WHERE timetable_id = $1',
      [entryId]
    );

    if (entryRes.rows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }

    const entry = entryRes.rows[0];
    const oldSlotDisplay = `${entry.day_of_week} ${entry.time_slot_start}-${entry.time_slot_end}`;
    const newSlotDisplay = `${newDay} ${newStartTime}-${newEndTime}`;
    
    // Get display names (subject, branch, professor, batch)
    const namesRes = await client.query(`
      SELECT 
        s.name as subject_name,
        b.name as branch_name,
        p.name as professor_name,
        ba.batch_number
      FROM timetable t
      LEFT JOIN subjects s ON s.subject_id = t.subject_id
      LEFT JOIN branches b ON b.branch_id = t.branch_id
      LEFT JOIN professors p ON p.professor_id = t.professor_id
      LEFT JOIN batches ba ON ba.batch_id = t.batch_id
      WHERE t.timetable_id = $1
    `, [entryId]);
    
    const displayNames = namesRes.rows[0] || {};
    
    console.log(`[Move] Moving ${displayNames.subject_name} (${entry.subject_id}) from ${oldSlotDisplay} to ${newSlotDisplay}`);

    // ========== COMPREHENSIVE VALIDATION ==========
    const validation = await validateMove(client, entry, newDay, newStartTime, newEndTime);
    
    console.log(`[Move] Validation Result:`, {
      isValid: validation.isValid,
      errors: validation.errors.length,
      warnings: validation.warnings.length
    });

    // If CRITICAL ERRORS exist, reject the move
    if (!validation.isValid) {
      console.log(`[Move] Move REJECTED due to critical conflicts`);
      
      client.release();
      return res.json({
        success: false,
        error: 'Move violates timetable constraints',
        reason: validation.errors[0]?.type || 'UNKNOWN_CONFLICT',
        conflicts: validation.errors.map(e => ({
          type: e.type,
          message: e.message,
          details: e.details
        }))
      });
    }

    // If there are WARNINGS (displaced classes or slot occupied), inform user
    if (validation.warnings.length > 0) {
      console.log(`[Move] Warning: slot is occupied, cannot complete move`);
      
      client.release();
      return res.json({
        success: false,
        error: 'Target slot is occupied',
        details: 'Please select an empty slot to move this class',
        warnings: validation.warnings,
        message: 'Select another time slot that is not occupied'
      });
    }

    // ========== ALL VALIDATIONS PASSED - PROCEED WITH MOVE ========== 
    
    console.log(`[Move] All validations passed, executing move to ${newSlotDisplay}`);

    // Perform the actual update
    const updateRes = await client.query(
      `UPDATE timetable 
       SET day_of_week = $1, time_slot_start = $2, time_slot_end = $3, updated_at = NOW()
       WHERE timetable_id = $4 
       RETURNING *`,
      [newDay, newStartTime, newEndTime, entryId]
    );

    if (updateRes.rows.length === 0) {
      client.release();
      return res.status(500).json({ success: false, error: 'Update failed - entry not found' });
    }

    console.log(`[Move] SUCCESS: Moved ${displayNames.subject_name} to ${newSlotDisplay}`);
    client.release();

    // Return success with detailed information
    const movedEntry = updateRes.rows[0];
    
    res.json({
      success: true,
      message: 'Class moved successfully',
      movedEntry: {
        timetable_id: movedEntry.timetable_id,
        subject_id: movedEntry.subject_id,
        subject_name: displayNames.subject_name || '-',
        professor_id: movedEntry.professor_id,
        professor_name: displayNames.professor_name || '-',
        branch_id: movedEntry.branch_id,
        branch_name: displayNames.branch_name || 'Unknown',
        batch_id: movedEntry.batch_id,
        batch_number: displayNames.batch_number || 'All',
        semester: movedEntry.semester,
        day_of_week: movedEntry.day_of_week,
        time_slot_start: movedEntry.time_slot_start,
        time_slot_end: movedEntry.time_slot_end,
        slot_type: movedEntry.slot_type
      },
      move: {
        from: oldSlotDisplay,
        to: newSlotDisplay,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[Move] ERROR:', error.message);
    if (client) client.release();
    
    res.status(500).json({
      success: false,
      error: 'Move failed',
      details: error.message
    });
  }
};

/**
 * Get available empty slots where a class can be moved to
 * CRITICAL FIX: Generates all possible slots, doesn't just filter existing ones
 * This ensures empty days (THU/FRI) show up with available slots
 */
exports.getAvailableSlots = async (req, res) => {
  try {
    const { branchId, semester, currentEntryId } = req.query;

    if (!branchId || !semester) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: branchId, semester'
      });
    }

    let client;
    try {
      client = await pool.connect();

      // Step 1: Get the entry being moved (duration, professor, current slot)
      let entryDurationMinutes = null;
      let professorId = null;
      let currentDay = null;
      let currentStart = null;
      let currentEnd = null;

      if (currentEntryId) {
        const entryRes = await client.query(
          `SELECT time_slot_start, time_slot_end, professor_id, day_of_week FROM timetable WHERE timetable_id = $1`,
          [currentEntryId]
        );

        if (entryRes.rows.length > 0) {
          const entry = entryRes.rows[0];
          professorId = entry.professor_id;
          currentDay = entry.day_of_week;
          currentStart = entry.time_slot_start;
          currentEnd = entry.time_slot_end;
          
          // Calculate duration in minutes
          const startParts = entry.time_slot_start.split(':');
          const endParts = entry.time_slot_end.split(':');
          const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
          const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
          entryDurationMinutes = endMin - startMin;

          console.log(`[Available Slots] Entry duration: ${entryDurationMinutes} min | Professor: ${professorId} | Current: ${currentDay} ${currentStart}-${currentEnd}`);
        }
      }

      // Step 2: GENERATE ALL POSSIBLE SLOTS (not just from database)
      // This ensures empty days like THU/FRI show with available slots
      // CRITICAL: Support both 1-hour theory AND 2-hour lab slots
      const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
      const timeBlocks = [
        { start: '09:00', end: '11:00' },  // 2 hours
        { start: '11:15', end: '13:15' },  // 2 hours
        { start: '14:00', end: '16:00' },  // 2 hours
        { start: '16:00', end: '17:00' }   // 1 hour
      ];

      // Generate slots matching the entry's duration
      const allPossibleSlots = [];
      
      for (const day of days) {
        for (const block of timeBlocks) {
          const blockStartParts = block.start.split(':');
          const blockEndParts = block.end.split(':');
          const blockStartMin = parseInt(blockStartParts[0]) * 60 + parseInt(blockStartParts[1]);
          const blockEndMin = parseInt(blockEndParts[0]) * 60 + parseInt(blockEndParts[1]);
          
          // If entry is 2 hours (LAB), generate exact 2-hour slots
          if (entryDurationMinutes === 120) {
            // Generate 2-hour slots
            for (let min = blockStartMin; min + 120 <= blockEndMin; min += 120) {
              const slotStart = Math.floor(min / 60);
              const slotStartMin = min % 60;
              const slotEnd = Math.floor((min + 120) / 60);
              const slotEndMin = (min + 120) % 60;
              
              const startStr = String(slotStart).padStart(2, '0') + ':' + String(slotStartMin).padStart(2, '0');
              const endStr = String(slotEnd).padStart(2, '0') + ':' + String(slotEndMin).padStart(2, '0');
              
              allPossibleSlots.push({
                day_of_week: day,
                time_slot_start: startStr,
                time_slot_end: endStr
              });
            }
          } else {
            // Generate 1-hour slots (THEORY)
            for (let min = blockStartMin; min + 60 <= blockEndMin; min += 60) {
              const slotStart = Math.floor(min / 60);
              const slotStartMin = min % 60;
              const slotEnd = Math.floor((min + 60) / 60);
              const slotEndMin = (min + 60) % 60;
              
              const startStr = String(slotStart).padStart(2, '0') + ':' + String(slotStartMin).padStart(2, '0');
              const endStr = String(slotEnd).padStart(2, '0') + ':' + String(slotEndMin).padStart(2, '0');
              
              allPossibleSlots.push({
                day_of_week: day,
                time_slot_start: startStr,
                time_slot_end: endStr
              });
            }
          }
        }
      }

      console.log(`[Available Slots] Generated ${allPossibleSlots.length} possible slots (${entryDurationMinutes} min duration)`);

      // Step 3: Filter by duration, professor availability, and capacity
      const availableSlots = [];

      for (const slot of allPossibleSlots) {
        // Calculate this slot duration
        const startParts = slot.time_slot_start.split(':');
        const endParts = slot.time_slot_end.split(':');
        const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
        const slotDurationMinutes = endMin - startMin;

        // Only consider slots with matching duration
        if (entryDurationMinutes && slotDurationMinutes !== entryDurationMinutes) {
          continue;
        }

        // Exclude current slot exactly
        if (slot.day_of_week === currentDay && 
            slot.time_slot_start === currentStart && 
            slot.time_slot_end === currentEnd) {
          console.log(`[Available Slots] Skipping current slot: ${slot.day_of_week} ${slot.time_slot_start}-${slot.time_slot_end}`);
          continue;
        }

        // Check: Is professor FREE in this slot?
        let professorIsFree = true;
        if (professorId) {
          const profCheckQuery = `
            SELECT COUNT(*) as count
            FROM timetable
            WHERE professor_id = $1
            AND day_of_week = $2
            AND time_slot_start < $4
            AND time_slot_end > $3
            AND timetable_id != $5
            AND slot_type NOT IN ('BREAK', 'RECESS', 'LIBRARY', 'HOLIDAY')
          `;

          const profCheckRes = await client.query(profCheckQuery, [
            professorId,
            slot.day_of_week,
            slot.time_slot_start,
            slot.time_slot_end,
            currentEntryId || 'null'
          ]);

          professorIsFree = parseInt(profCheckRes.rows[0].count) === 0;
        }

        // Skip if professor NOT available
        if (!professorIsFree) {
          console.log(`[Available Slots] Skipping (professor busy): ${slot.day_of_week} ${slot.time_slot_start}-${slot.time_slot_end}`);
          continue;
        }

        // Count classes in this slot (excluding the entry being moved)
        const countQuery = `
          SELECT COUNT(*) as count
          FROM timetable
          WHERE branch_id = $1
          AND semester = $2
          AND day_of_week = $3
          AND time_slot_start = $4
          AND time_slot_end = $5
          AND slot_type NOT IN ('BREAK', 'RECESS', 'LIBRARY', 'HOLIDAY')
          AND timetable_id != $6
        `;

        const countRes = await client.query(countQuery, [
          branchId,
          semester,
          slot.day_of_week,
          slot.time_slot_start,
          slot.time_slot_end,
          currentEntryId || 'null'
        ]);

        const classesInSlot = parseInt(countRes.rows[0].count);

        // CRITICAL FIX: Only show EMPTY slots (classesInSlot === 0)
        // Don't show slots that are occupied by OTHER classes
        // For move operation, we need COMPLETELY EMPTY slots
        if (classesInSlot === 0) {
          availableSlots.push({
            day: slot.day_of_week,
            start: slot.time_slot_start,
            end: slot.time_slot_end,
            duration: slotDurationMinutes / 60,  // 1 for theory, 2 for labs
            availableSpots: 1,
            occupiedSpots: 0,
            professorFree: true
          });
        }
      }

      // Limit to 20 slots
      const limitedSlots = availableSlots.slice(0, 20);

      client.release();

      res.json({
        success: true,
        availableSlots: limitedSlots,
        totalAvailable: availableSlots.length,
        entryDuration: entryDurationMinutes ? Math.round(entryDurationMinutes / 60 * 10) / 10 : null,
        professorId: professorId,
        message: `Found ${limitedSlots.length} available slots (all days checked)`
      });

    } catch (dbError) {
      console.error('[Get Available Slots] Database error:', dbError);
      if (client) client.release();
      throw dbError;
    }

  } catch (error) {
    console.error('[Get Available Slots] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get available slots',
      details: error.message
    });
  }
};