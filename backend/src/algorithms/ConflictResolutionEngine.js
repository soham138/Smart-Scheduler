/**
 * Enhanced Conflict Resolution Engine
 * Handles all 12 types of scheduling conflicts with resolution strategies
 * 
 * Conflict Types:
 * 1. Missing subjects/labs
 * 2. Same subject timing conflicts
 * 3. Professor double-booking
 * 4. Batch clashes
 * 5. Cross-branch conflicts
 * 6. Lab distribution
 * 7. Time gap issues
 * 8. Load imbalance
 * 9. Uneven subject distribution
 * 10. Lab capacity overflow
 * 11. Break/Library conflicts
 * 12. Batch alternation violations
 */

class ConflictResolutionEngine {
  constructor(timeSlots, globalSchedule = {}) {
    this.timeSlots = timeSlots;
    this.globalSchedule = globalSchedule;
    this.conflicts = [];
    this.resolutions = [];
    this.swapHistory = [];
  }

  /**
   * Comprehensive conflict detection
   */
  detectAllConflicts(schedule, subjects, allBranches = {}) {
    this.conflicts = [];

    // Type 1 & 2: Missing subjects and incomplete coverage
    this.detectMissingSubjects(schedule, subjects);

    // Type 3: Professor conflicts
    this.detectProfessorConflicts(schedule);

    // Type 4: Batch clashes
    this.detectBatchClashes(schedule);

    // Type 5: Cross-branch conflicts
    this.detectCrossBranchConflicts(schedule, allBranches);

    // Type 6: Lab distribution issues
    this.detectLabDistributionIssues(schedule);

    // Type 7: Time gap issues
    this.detectTimeGaps(schedule);

    // Type 8: Load imbalance
    this.detectLoadImbalance(schedule);

    // Type 9: Uneven subject distribution
    this.detectUnevenDistribution(schedule);

    // Type 10: Lab capacity
    this.detectCapacityViolations(schedule, 20);

    // Type 11: Break scheduling
    this.detectBreakConflicts(schedule);

    // Type 12: Batch rotation
    this.detectBatchRotationViolations(schedule);

    return {
      totalConflicts: this.conflicts.length,
      conflicts: this.conflicts,
      severity: this.calculateSeverity()
    };
  }

  /**
   * Type 1-2: Detect missing subjects and incomplete labs
   */
  detectMissingSubjects(schedule, subjects) {
    for (const subject of subjects) {
      const subjectSchedules = Object.values(schedule).filter(
        s => s.subject_id === subject.subject_id
      );

      // Check theory coverage
      if (subject.type !== 'LAB') {
        const theoryCount = subjectSchedules.filter(s => s.type === 'THEORY').length;
        const required = Math.min(subject.weekly_lecture_count || 2, 3);
        
        if (theoryCount < required) {
          this.conflicts.push({
            type: 'MISSING_THEORY',
            subject: subject.code,
            scheduled: theoryCount,
            required,
            gap: required - theoryCount,
            severity: required - theoryCount >= 2 ? 'critical' : 'high'
          });
        }
      }

      // Check lab coverage
      if (subject.type !== 'THEORY') {
        const labCount = subjectSchedules.filter(s => s.type === 'LAB').length;
        const required = Math.min(subject.weekly_lab_count || 2, 2);
        
        if (labCount < required) {
          this.conflicts.push({
            type: 'MISSING_LAB',
            subject: subject.code,
            scheduled: labCount,
            required,
            gap: required - labCount,
            severity: 'critical' // Labs are always critical
          });
        }
      }
    }
  }

  /**
   * Type 3: Detect professor double-booking
   */
  detectProfessorConflicts(schedule) {
    const professorSchedule = new Map();

    for (const [key, slot] of Object.entries(schedule)) {
      if (!slot.professor_id) continue;

      const profId = slot.professor_id;
      if (!professorSchedule.has(profId)) {
        professorSchedule.set(profId, []);
      }
      professorSchedule.get(profId).push(slot);
    }

    for (const [profId, slots] of professorSchedule) {
      // Check for same-time scheduling
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const slot1 = slots[i];
          const slot2 = slots[j];

          if (slot1.day === slot2.day && this.timesOverlap(slot1, slot2)) {
            this.conflicts.push({
              type: 'PROFESSOR_CONFLICT',
              professor_id: profId,
              subject1: slot1.subject_code,
              subject2: slot2.subject_code,
              time: `${slot1.day} ${slot1.start}-${slot1.end}`,
              severity: 'critical'
            });
          }
        }
      }
    }
  }

  /**
   * Type 4: Detect batch clashes
   */
  detectBatchClashes(schedule) {
    const batchSchedule = new Map(); // "Sem-Batch" -> slots

    for (const [key, slot] of Object.entries(schedule)) {
      if (!slot.batch_number) continue;

      const batchKey = `SEM${slot.semester}-${slot.batch_number}`;
      if (!batchSchedule.has(batchKey)) {
        batchSchedule.set(batchKey, []);
      }
      batchSchedule.get(batchKey).push(slot);
    }

    for (const [batchKey, slots] of batchSchedule) {
      // Check for same-time assignment to same batch
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const slot1 = slots[i];
          const slot2 = slots[j];

          if (slot1.day === slot2.day && this.timesOverlap(slot1, slot2)) {
            this.conflicts.push({
              type: 'BATCH_CLASH',
              batch: batchKey,
              subject1: slot1.subject_code,
              subject2: slot2.subject_code,
              time: `${slot1.day} ${slot1.start}`,
              severity: 'critical'
            });
          }
        }
      }
    }
  }

  /**
   * Type 5: Detect cross-branch subject timing conflicts
   */
  detectCrossBranchConflicts(schedule, allBranches) {
    // This would require cross-branch schedule data
    // For now, log potential conflicts based on same subjects
    const subjectTimings = new Map();

    for (const [key, slot] of Object.entries(schedule)) {
      if (!slot.subject_code) continue;
      
      const subjectKey = slot.subject_code;
      if (!subjectTimings.has(subjectKey)) {
        subjectTimings.set(subjectKey, []);
      }
      subjectTimings.get(subjectKey).push(slot);
    }

    for (const [subject, slots] of subjectTimings) {
      const branches = new Set(slots.map(s => s.branch_id));
      
      // If same subject in different branches
      if (branches.size > 1) {
        for (let i = 0; i < slots.length; i++) {
          for (let j = i + 1; j < slots.length; j++) {
            if (slots[i].branch_id !== slots[j].branch_id && 
                slots[i].day === slots[j].day && 
                this.timesOverlap(slots[i], slots[j])) {
              
              this.conflicts.push({
                type: 'CROSS_BRANCH_CONFLICT',
                subject: subject,
                branch1: slots[i].branch_id,
                branch2: slots[j].branch_id,
                time: `${slots[i].day} ${slots[i].start}`,
                message: 'Same subject in different branches at same time - requires different professor or time'
              });
            }
          }
        }
      }
    }
  }

  /**
   * Type 6: Detect lab distribution issues
   */
  detectLabDistributionIssues(schedule) {
    // Group labs by day
    const labsByDay = {};
    const daysOfWeek = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

    for (const day of daysOfWeek) {
      labsByDay[day] = [];
    }

    for (const [key, slot] of Object.entries(schedule)) {
      if (slot.type === 'LAB') {
        labsByDay[slot.day] = labsByDay[slot.day] || [];
        labsByDay[slot.day].push(slot);
      }
    }

    // Check max 1 lab per day per semester per batch
    for (const day in labsByDay) {
      const dayLabs = labsByDay[day];
      const groupedBySubject = new Map();

      for (const lab of dayLabs) {
        const groupKey = `${lab.semester}-${lab.batch_number}`;
        if (!groupedBySubject.has(groupKey)) {
          groupedBySubject.set(groupKey, []);
        }
        groupedBySubject.get(groupKey).push(lab);
      }

      for (const [groupKey, labs] of groupedBySubject) {
        if (labs.length > 1) {
          this.conflicts.push({
            type: 'TOO_MANY_LABS_PER_DAY',
            day,
            batch: groupKey,
            count: labs.length,
            subjects: labs.map(l => l.subject_code).join(', '),
            severity: 'high'
          });
        }
      }
    }

    // Check labs evenly distributed
    const labDistribution = Object.values(labsByDay).map(d => d.length);
    const avgLabs = labDistribution.reduce((a, b) => a + b, 0) / 5;
    const maxDeviation = Math.max(...labDistribution) - avgLabs;

    if (maxDeviation > 2) {
      this.conflicts.push({
        type: 'UNEVEN_LAB_DISTRIBUTION',
        distribution: labDistribution,
        average: avgLabs,
        maxDeviation,
        severity: 'medium'
      });
    }
  }

  /**
   * Type 7: Detect large time gaps
   */
  detectTimeGaps(schedule) {
    // Group slots by day
    const slotsByDay = {};

    for (const [key, slot] of Object.entries(schedule)) {
      if (!slotsByDay[slot.day]) {
        slotsByDay[slot.day] = [];
      }
      slotsByDay[slot.day].push(slot);
    }

    // Check gaps within each day
    for (const day in slotsByDay) {
      const daySlots = slotsByDay[day].sort((a, b) => {
        const aStart = parseInt(a.start.replace(':', ''));
        const bStart = parseInt(b.start.replace(':', ''));
        return aStart - bStart;
      });

      for (let i = 0; i < daySlots.length - 1; i++) {
        const endMinutes = this.timeToMinutes(daySlots[i].end);
        const nextStart = this.timeToMinutes(daySlots[i + 1].start);
        const gapMinutes = nextStart - endMinutes;

        if (gapMinutes > 60) { // Gap > 1 hour
          this.conflicts.push({
            type: 'LARGE_TIME_GAP',
            day,
            between: `${daySlots[i].subject_code} and ${daySlots[i + 1].subject_code}`,
            gapMinutes,
            severity: 'low'
          });
        }
      }
    }
  }

  /**
   * Type 8: Detect load imbalance
   */
  detectLoadImbalance(schedule) {
    const dailyLoad = {};
    const daysOfWeek = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

    for (const day of daysOfWeek) {
      dailyLoad[day] = 0;
    }

    for (const [key, slot] of Object.entries(schedule)) {
      const duration = this.calculateDuration(slot.start, slot.end);
      dailyLoad[slot.day] = (dailyLoad[slot.day] || 0) + duration;
    }

    const loads = Object.values(dailyLoad);
    const avgLoad = loads.reduce((a, b) => a + b, 0) / 5;
    const maxLoad = Math.max(...loads);
    const minLoad = Math.min(...loads);

    if (maxLoad - minLoad > 120) { // > 2 hour difference
      this.conflicts.push({
        type: 'LOAD_IMBALANCE',
        dailyLoads: dailyLoad,
        average: avgLoad,
        maxLoad,
        minLoad,
        difference: maxLoad - minLoad,
        severity: 'medium'
      });
    }
  }

  /**
   * Type 9: Detect uneven subject distribution across week
   */
  detectUnevenDistribution(schedule) {
    const subjectDayMap = new Map();

    for (const [key, slot] of Object.entries(schedule)) {
      if (!subjectDayMap.has(slot.subject_id)) {
        subjectDayMap.set(slot.subject_id, new Set());
      }
      subjectDayMap.get(slot.subject_id).add(slot.day);
    }

    for (const [subjectId, days] of subjectDayMap) {
      if (days.size === 1) {
        this.conflicts.push({
          type: 'SUBJECT_CLUSTERED',
          subjectId,
          daysScheduled: Array.from(days),
          message: 'Subject should be spread across multiple days'
        });
      }
    }
  }

  /**
   * Type 10: Detect lab capacity violations
   */
  detectCapacityViolations(schedule, maxCapacity = 20) {
    const slotCapacity = new Map();

    for (const [key, slot] of Object.entries(schedule)) {
      if (slot.type !== 'LAB') continue;

      const slotKey = `${slot.day}-${slot.start}-${slot.end}`;
      if (!slotCapacity.has(slotKey)) {
        slotCapacity.set(slotKey, 0);
      }
      slotCapacity.set(slotKey, slotCapacity.get(slotKey) + 1);
    }

    for (const [slotKey, count] of slotCapacity) {
      if (count > maxCapacity) {
        this.conflicts.push({
          type: 'CAPACITY_VIOLATION',
          slot: slotKey,
          labsScheduled: count,
          maxCapacity,
          severity: 'high'
        });
      }
    }
  }

  /**
   * Type 11: Detect break/library conflicts
   */
  detectBreakConflicts(schedule) {
    const breakTimes = [
      { day: 'ANY', start: '11:00', end: '11:15', name: 'Tea Break' },
      { day: 'ANY', start: '13:15', end: '14:00', name: 'Recess' }
    ];

    for (const [key, slot] of Object.entries(schedule)) {
      // Check if schedule overlaps with breaks
      for (const breakTime of breakTimes) {
        if (this.timesOverlapTime(slot.start, slot.end, breakTime.start, breakTime.end)) {
          this.conflicts.push({
            type: 'BREAK_CONFLICT',
            subject: slot.subject_code,
            slot: `${slot.day} ${slot.start}-${slot.end}`,
            breakName: breakTime.name,
            severity: 'high'
          });
        }
      }
    }
  }

  /**
   * Type 12: Detect batch rotation violations
   */
  detectBatchRotationViolations(schedule) {
    // Track batch A/B rotation pattern
    const labsByBatch = { A: [], B: [] };

    for (const [key, slot] of Object.entries(schedule)) {
      if (slot.type !== 'LAB' || !slot.batch_number) continue;
      labsByBatch[slot.batch_number]?.push(slot);
    }

    // Check if A and B have similar distribution
    if (labsByBatch.A.length !== labsByBatch.B.length) {
      this.conflicts.push({
        type: 'BATCH_IMBALANCE',
        batchA: labsByBatch.A.length,
        batchB: labsByBatch.B.length,
        message: 'Batch A and B should have equal number of lab sessions'
      });
    }
  }

  /**
   * Helper: Check if times overlap
   */
  timesOverlap(slot1, slot2) {
    return this.timesOverlapTime(slot1.start, slot1.end, slot2.start, slot2.end);
  }

  timesOverlapTime(start1, end1, start2, end2) {
    const s1 = this.timeToMinutes(start1);
    const e1 = this.timeToMinutes(end1);
    const s2 = this.timeToMinutes(start2);
    const e2 = this.timeToMinutes(end2);
    return !(e1 <= s2 || e2 <= s1);
  }

  /**
   * Helper: Convert time to minutes
   */
  timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  }

  /**
   * Helper: Calculate duration between times
   */
  calculateDuration(start, end) {
    return this.timeToMinutes(end) - this.timeToMinutes(start);
  }

  /**
   * Calculate overall severity
   */
  calculateSeverity() {
    let critical = this.conflicts.filter(c => c.severity === 'critical').length;
    let high = this.conflicts.filter(c => c.severity === 'high').length;
    let medium = this.conflicts.filter(c => c.severity === 'medium').length;

    if (critical > 0) return 'CRITICAL';
    if (high > 3) return 'HIGH';
    if (medium > 5) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Generate resolution suggestions
   */
  generateResolutions() {
    const resolutions = [];

    for (const conflict of this.conflicts) {
      const resolution = this.suggestResolution(conflict);
      if (resolution) {
        resolutions.push(resolution);
      }
    }

    return resolutions;
  }

  /**
   * Suggest resolution for specific conflict
   */
  suggestResolution(conflict) {
    switch (conflict.type) {
      case 'MISSING_THEORY':
        return {
          conflict: conflict.type,
          suggestion: `Add ${conflict.gap} more theory slots for ${conflict.subject}`,
          action: 'SCHEDULE_THEORY'
        };

      case 'PROFESSOR_CONFLICT':
        return {
          conflict: conflict.type,
          suggestion: `Reschedule ${conflict.subject2} to different time`,
          action: 'SWAP_SLOTS'
        };

      case 'BATCH_CLASH':
        return {
          conflict: conflict.type,
          suggestion: `Move ${conflict.subject2} to different batch`,
          action: 'SWAP_BATCHES'
        };

      case 'LARGE_TIME_GAP':
        return {
          conflict: conflict.type,
          suggestion: `Shift classes to reduce ${conflict.gapMinutes} minute gap on ${conflict.day}`,
          action: 'CONSOLIDATE_TIME'
        };

      case 'UNEVEN_LAB_DISTRIBUTION':
        return {
          conflict: conflict.type,
          suggestion: `Redistribute labs: ${JSON.stringify(conflict.distribution)}`,
          action: 'REBALANCE_LABS'
        };

      default:
        return {
          conflict: conflict.type,
          suggestion: `Review and resolve ${conflict.type}`,
          action: 'MANUAL_REVIEW'
        };
    }
  }
}

module.exports = ConflictResolutionEngine;
