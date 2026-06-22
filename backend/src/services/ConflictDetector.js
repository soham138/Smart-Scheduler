/**
 * Timetable Conflict Detection Service
 * 
 * Checks for:
 * 1. Time overlaps (same slot, same batch/professor)
 * 2. Batch clashes (both batches scheduled at same time for same subject)
 * 3. Professor clashes (professor teaching 2 classes at same time)
 * 4. Room/Lab conflicts (same room booked for multiple classes)
 * 5. Duplicate subject slots (same subject scheduled twice in same week)
 * 6. Unused time gaps (available slots with no classes)
 */

const pool = require('../config/db');

class ConflictDetector {
  constructor(branchId, semester) {
    this.branchId = branchId;
    this.semester = semester;
    this.conflicts = [];
    this.warnings = [];
    this.gaps = [];
  }

  async detectAll() {
    try {
      // Get all timetable entries
      console.log(`[ConflictDetector] Fetching timetable for Branch: ${this.branchId}, Semester: ${this.semester}`);
      
      const ttRes = await pool.query(`
        SELECT 
          t.timetable_id,
          t.day_of_week,
          t.time_slot_start,
          t.time_slot_end,
          t.slot_type,
          t.subject_id,
          s.code as subject_code,
          s.name as subject_name,
          t.batch_id,
          b.batch_number,
          t.professor_id,
          p.name as professor_name,
          t.room_id,
          t.lab_id
        FROM timetable t
        LEFT JOIN subjects s ON t.subject_id = s.subject_id
        LEFT JOIN batches b ON t.batch_id = b.batch_id
        LEFT JOIN professors p ON t.professor_id = p.professor_id
        WHERE t.branch_id = $1 AND t.semester = $2
        ORDER BY t.day_of_week, t.time_slot_start
      `, [this.branchId, this.semester]);

      console.log(`[ConflictDetector] Found ${ttRes.rows.length} timetable entries`);

      // Deduplicate timetable entries by timetable_id to avoid comparing same slot against itself
      const seenIds = new Set();
      const timetable = ttRes.rows.filter(row => {
        if (seenIds.has(row.timetable_id)) {
          return false;
        }
        seenIds.add(row.timetable_id);
        return true;
      });

      console.log(`[ConflictDetector] After deduplication: ${timetable.length} unique entries`);

      if (timetable.length === 0) {
        return {
          success: false,
          message: 'No timetable found for this branch-semester',
          conflicts: [],
          warnings: [],
          gaps: []
        };
      }

      // Run all checks
      this.checkTimeOverlaps(timetable);
      this.checkBatchClashes(timetable);
      this.checkProfessorClashes(timetable);
      this.checkRoomLabConflicts(timetable);
      this.checkDuplicateSubjects(timetable);
      await this.checkUnusedTimeGaps(timetable);

      // Deduplicate conflicts: show each unique conflict type only once per resource
      const uniqueConflicts = [];
      const conflictKeys = new Set();
      
      for (const conflict of this.conflicts) {
        // Create unique key: type + severity + resource ID + time
        let key = `${conflict.type}_${conflict.severity}`;
        if (conflict.professor) key += `_${conflict.professor}`;
        if (conflict.batch) key += `_${conflict.batch}`;
        if (conflict.time) key += `_${conflict.time}`;
        
        if (!conflictKeys.has(key)) {
          conflictKeys.add(key);
          uniqueConflicts.push(conflict);
        }
      }

      this.conflicts = uniqueConflicts;

      const hasConflicts = this.conflicts.length > 0;
      const hasWarnings = this.warnings.length > 0;
      const hasGaps = this.gaps.length > 0;

      return {
        success: !hasConflicts,
        message: hasConflicts ? `Found ${this.conflicts.length} critical conflicts` : 'Timetable is valid',
        conflictCount: this.conflicts.length,
        warningCount: this.warnings.length,
        gapCount: this.gaps.length,
        conflicts: this.conflicts,
        warnings: this.warnings,
        gaps: this.gaps,
        summary: {
          totalClasses: timetable.filter(t => t.slot_type === 'LAB' || t.slot_type === 'THEORY').length,
          totalBreaks: timetable.filter(t => ['BREAK', 'RECESS', 'LIBRARY', 'PROJECT'].includes(t.slot_type)).length,
          uniqueSubjects: new Set(timetable.filter(t => t.subject_id).map(t => t.subject_code)).size
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        conflicts: [],
        warnings: [],
        gaps: []
      };
    }
  }

  /**
   * Check 1: Time Overlaps
   * Same professor/batch in overlapping time slots
   */
  checkTimeOverlaps(timetable) {
    const timeRegex = /(\d{2}):(\d{2})/;

    for (let i = 0; i < timetable.length; i++) {
      for (let j = i + 1; j < timetable.length; j++) {
        const slot1 = timetable[i];
        const slot2 = timetable[j];

        // Skip non-class slots
        if (!['LAB', 'THEORY'].includes(slot1.slot_type) || !['LAB', 'THEORY'].includes(slot2.slot_type)) {
          continue;
        }

        // Same day required
        if (slot1.day_of_week !== slot2.day_of_week) continue;

        // Check time overlap
        const s1Start = this.timeToMinutes(slot1.time_slot_start);
        const s1End = this.timeToMinutes(slot1.time_slot_end);
        const s2Start = this.timeToMinutes(slot2.time_slot_start);
        const s2End = this.timeToMinutes(slot2.time_slot_end);

        const hasOverlap = !(s1End <= s2Start || s2End <= s1Start);

        if (!hasOverlap) continue;

        // ⭐ NEW CHECK: THEORY-LAB CONFLICT
        // If THEORY (for all students, NO batch) overlaps with LAB (for specific batch), students can't attend both
        // BUT ONLY FOR THE SAME SUBJECT - different subjects don't conflict
        const isTheoryLabConflict = 
          (slot1.slot_type === 'THEORY' && slot2.slot_type === 'LAB' && !slot1.batch_id && slot2.batch_id && slot1.subject_id === slot2.subject_id) ||
          (slot2.slot_type === 'THEORY' && slot1.slot_type === 'LAB' && !slot2.batch_id && slot1.batch_id && slot1.subject_id === slot2.subject_id);
        
        if (isTheoryLabConflict) {
          const theorySlot = slot1.slot_type === 'THEORY' ? slot1 : slot2;
          const labSlot = slot1.slot_type === 'LAB' ? slot1 : slot2;
          
          this.conflicts.push({
            type: 'THEORY_LAB_CONFLICT',
            severity: 'CRITICAL',
            subject: theorySlot.subject_code,
            day: theorySlot.day_of_week,
            time: `${theorySlot.time_slot_start}-${theorySlot.time_slot_end}`,
            class1: `${theorySlot.subject_code} THEORY (${theorySlot.time_slot_start}-${theorySlot.time_slot_end}) - All students`,
            class2: `${labSlot.subject_code} LAB (${labSlot.time_slot_start}-${labSlot.time_slot_end}) - Batch ${labSlot.batch_number}`,
            reason: `CRITICAL: THEORY lecture for all students conflicts with LAB session - Batch ${labSlot.batch_number} students cannot attend the lecture`
          });
        }

        // Check for professor conflict
        if (slot1.professor_id && slot2.professor_id && slot1.professor_id === slot2.professor_id) {
          this.conflicts.push({
            type: 'PROFESSOR_CLASH',
            severity: 'CRITICAL',
            professor: slot1.professor_name,
            class1: `${slot1.subject_code || 'Unknown'} (${slot1.slot_type}) - ${slot1.day_of_week} ${slot1.time_slot_start}`,
            class2: `${slot2.subject_code || 'Unknown'} (${slot2.slot_type}) - ${slot2.day_of_week} ${slot2.time_slot_start}`,
            reason: `Professor ${slot1.professor_name} scheduled for 2 classes at overlapping times`
          });
        }

        // Check for batch conflict (same batch in overlapping slots)
        if (slot1.batch_id && slot2.batch_id && slot1.batch_id === slot2.batch_id) {
          this.conflicts.push({
            type: 'BATCH_OVERLAP',
            severity: 'CRITICAL',
            batch: `Batch ${slot1.batch_number}`,
            class1: `${slot1.subject_code || 'Unknown'} (${slot1.slot_type}) - ${slot1.day_of_week} ${slot1.time_slot_start}`,
            class2: `${slot2.subject_code || 'Unknown'} (${slot2.slot_type}) - ${slot2.day_of_week} ${slot2.time_slot_start}`,
            reason: `Batch ${slot1.batch_number} double-booked for overlapping sessions`
          });
        }
      }
    }
  }

  /**
   * Check 2: Batch Clashes
   * Both Batch A and B scheduled for same subject at same time
   */
  checkBatchClashes(timetable) {
    const classMap = {};

    for (const slot of timetable) {
      if (!['LAB', 'THEORY'].includes(slot.slot_type) || !slot.subject_id) continue;

      const key = `${slot.subject_code}_${slot.slot_type}_${slot.day_of_week}_${slot.time_slot_start}`;
      if (!classMap[key]) classMap[key] = [];
      classMap[key].push(slot);
    }

    for (const [key, slots] of Object.entries(classMap)) {
      if (slots.length > 1) {
        const batches = [...new Set(slots.map(s => s.batch_number).filter(b => b))];
        if (batches.length > 1 && batches.includes(1) && batches.includes(2)) {
          this.warnings.push({
            type: 'BATCH_SAME_TIME',
            severity: 'WARNING',
            subject: slots[0].subject_code,
            time: `${slots[0].day_of_week} ${slots[0].time_slot_start}`,
            reason: `Both Batch A and Batch B scheduled for same class at same time - may cause resource conflict`
          });
        }
      }
    }
  }

  /**
   * Check 3: Professor Clashes
   * Professor scheduled for multiple classes on same day/time
   */
  checkProfessorClashes(timetable) {
    const profMap = {};

    for (const slot of timetable) {
      if (!['LAB', 'THEORY'].includes(slot.slot_type) || !slot.professor_id) continue;

      const key = `${slot.professor_id}_${slot.day_of_week}`;
      if (!profMap[key]) profMap[key] = [];
      profMap[key].push(slot);
    }

    for (const [key, slots] of Object.entries(profMap)) {
      // Check for overlaps within same professor's day
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const s1 = slots[i];
          const s2 = slots[j];

          const s1Start = this.timeToMinutes(s1.time_slot_start);
          const s1End = this.timeToMinutes(s1.time_slot_end);
          const s2Start = this.timeToMinutes(s2.time_slot_start);
          const s2End = this.timeToMinutes(s2.time_slot_end);

          const overlap = !(s1End <= s2Start || s2End <= s1Start);
          if (overlap) {
            // CRITICAL: Professor cannot be in two places at once
            const conflictKey = `PROF_${s1.professor_id}_${s1.day_of_week}_${s1.time_slot_start}_${s1.time_slot_end}`;
            const isDuplicate = this.conflicts.some(c => 
              c.type === 'PROFESSOR_OVERLAP' && 
              c.professor === s1.professor_name && 
              c.class1?.includes(s1.time_slot_start)
            );
            
            if (!isDuplicate) {
              this.conflicts.push({
                type: 'PROFESSOR_OVERLAP',
                severity: 'CRITICAL',
                professor: s1.professor_name,
                professori_id: s1.professor_id,
                day: s1.day_of_week,
                time: `${s1.time_slot_start}-${s1.time_slot_end}`,
                class1: `${s1.subject_code} (${s1.slot_type}) (${s1.time_slot_start}-${s1.time_slot_end})`,
                class2: `${s2.subject_code} (${s2.slot_type}) (${s2.time_slot_start}-${s2.time_slot_end})`,
                reason: `CRITICAL: Professor ${s1.professor_name} has ${slots.length} simultaneous classes on ${s1.day_of_week} ${s1.time_slot_start}`
              });
            }
          }
        }
      }
    }
  }

  /**
   * Check 4: Room/Lab Conflicts
   * Same room or lab booked multiple times in overlapping slots
   */
  checkRoomLabConflicts(timetable) {
    const roomMap = {};
    const labMap = {};

    for (const slot of timetable) {
      if (slot.room_id) {
        if (!roomMap[slot.room_id]) roomMap[slot.room_id] = [];
        roomMap[slot.room_id].push(slot);
      }
      if (slot.lab_id) {
        if (!labMap[slot.lab_id]) labMap[slot.lab_id] = [];
        labMap[slot.lab_id].push(slot);
      }
    }

    // Check room conflicts
    for (const [roomId, slots] of Object.entries(roomMap)) {
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const s1 = slots[i];
          const s2 = slots[j];

          if (s1.day_of_week !== s2.day_of_week) continue;

          const s1Start = this.timeToMinutes(s1.time_slot_start);
          const s1End = this.timeToMinutes(s1.time_slot_end);
          const s2Start = this.timeToMinutes(s2.time_slot_start);
          const s2End = this.timeToMinutes(s2.time_slot_end);

          const overlap = !(s1End <= s2Start || s2End <= s1Start);
          if (overlap) {
            this.conflicts.push({
              type: 'ROOM_CONFLICT',
              severity: 'CRITICAL',
              room: roomId,
              class1: `${s1.subject_code || 'Class'} (${s1.time_slot_start}-${s1.time_slot_end})`,
              class2: `${s2.subject_code || 'Class'} (${s2.time_slot_start}-${s2.time_slot_end})`,
              reason: `Room ${roomId} double-booked for overlapping times`
            });
          }
        }
      }
    }

    // Check lab conflicts
    for (const [labId, slots] of Object.entries(labMap)) {
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const s1 = slots[i];
          const s2 = slots[j];

          if (s1.day_of_week !== s2.day_of_week) continue;

          const s1Start = this.timeToMinutes(s1.time_slot_start);
          const s1End = this.timeToMinutes(s1.time_slot_end);
          const s2Start = this.timeToMinutes(s2.time_slot_start);
          const s2End = this.timeToMinutes(s2.time_slot_end);

          const overlap = !(s1End <= s2Start || s2End <= s1Start);
          if (overlap) {
            this.conflicts.push({
              type: 'LAB_CONFLICT',
              severity: 'CRITICAL',
              lab: labId,
              class1: `${s1.subject_code || 'Class'} (${s1.time_slot_start}-${s1.time_slot_end})`,
              class2: `${s2.subject_code || 'Class'} (${s2.time_slot_start}-${s2.time_slot_end})`,
              reason: `Lab ${labId} double-booked for overlapping times`
            });
          }
        }
      }
    }
  }

  /**
   * Check 5: Duplicate Subject Slots
   * Same subject scheduled more than defined times per week
   */
  checkDuplicateSubjects(timetable) {
    const subjectSlots = {};

    for (const slot of timetable) {
      if (!['LAB', 'THEORY'].includes(slot.slot_type) || !slot.subject_id) continue;

      const key = `${slot.subject_id}_${slot.slot_type}_${slot.batch_id || 'all'}`;
      if (!subjectSlots[key]) subjectSlots[key] = [];
      subjectSlots[key].push(slot);
    }

    // Get subject requirements
    for (const [key, slots] of Object.entries(subjectSlots)) {
      if (slots.length > 3) { // More than 3 per week is suspicious
        const subj = slots[0];
        this.warnings.push({
          type: 'EXCESSIVE_SLOTS',
          severity: 'WARNING',
          subject: subj.subject_code,
          type_: subj.slot_type,
          count: slots.length,
          reason: `${subj.subject_code} has ${slots.length} ${subj.slot_type} slots - verify this is intentional`
        });
      }
    }
  }

  /**
   * Check 6: Unused Time Gaps
   */
  async checkUnusedTimeGaps(timetable) {
    const definedSlots = [
      { start: '09:00', end: '11:00', duration: 120 },
      { start: '11:00', end: '11:15', duration: 15 },
      { start: '11:15', end: '12:15', duration: 60 },
      { start: '12:15', end: '13:15', duration: 60 },
      { start: '13:15', end: '14:00', duration: 45 },
      { start: '14:00', end: '16:00', duration: 120 },
      { start: '16:00', end: '17:00', duration: 60 }
    ];

    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    const occupiedSlots = new Set();

    for (const slot of timetable) {
      const slotKey = `${slot.day_of_week}_${slot.time_slot_start}-${slot.time_slot_end}`;
      occupiedSlots.add(slotKey);
    }

    let emptySlots = 0;
    for (const day of days) {
      for (const slot of definedSlots) {
        const slotKey = `${day}_${slot.start}-${slot.end}`;
        if (!occupiedSlots.has(slotKey)) {
          // Skip tea break and recess
          if (!['11:00-11:15', '13:15-14:00'].includes(`${slot.start}-${slot.end}`)) {
            this.gaps.push({
              type: 'UNUSED_SLOT',
              severity: 'INFO',
              day,
              time: `${slot.start}-${slot.end}`,
              duration: slot.duration,
              reason: `Available slot not being used (could fit additional class or allow schedule flexibility)`
            });
            emptySlots++;
          }
        }
      }
    }

    // DEDUPLICATED WARNINGS: Show low utilization warning only ONCE per semester per branch
    // Instead of 25+ repeated warnings, show a single consolidated warning
    if (emptySlots > 7) {
      const utilizationPercent = Math.round(emptySlots / 35 * 100);
      
      // Only add warning if it's significant (>40% waste)
      if (utilizationPercent > 40) {
        this.warnings.push({
          type: 'LOW_UTILIZATION_CRITICAL',
          severity: 'WARNING',
          emptySlots,
          utilizationPercent,
          reason: `⚠️ LOW UTILIZATION: ${emptySlots}/${35} slots unused (${utilizationPercent}% waste). Consider adding more subjects or scheduling optimization.`
        });
        console.log(`[ConflictDetector] LOW_UTILIZATION_CRITICAL: ${utilizationPercent}% waste (${emptySlots} slots)`);
      } else if (utilizationPercent > 20) {
        // Moderate warning
        this.warnings.push({
          type: 'LOW_UTILIZATION',
          severity: 'INFO',
          emptySlots,
          utilizationPercent,
          reason: `ℹ️ Moderate utilization: ${emptySlots}/${35} slots unused (${utilizationPercent}% waste)`
        });
      }
      // REMOVED: The repetitive per-slot warnings that were filling up the array
      // Instead we're showing consolidated view per semester
    }
  }

  timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

module.exports = ConflictDetector;
