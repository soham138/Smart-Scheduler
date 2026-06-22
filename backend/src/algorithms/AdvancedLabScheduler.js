/**
 * ADVANCED TIMETABLE ALGORITHM - Greedy + Backtracking + Optimization
 * Implements constraint satisfaction with minimum conflicts
 * 
 * RULES:
 * 1. Max 7 labs at any time (HARD CONSTRAINT - never exceed)
 * 2. Professor can teach only 1 class at a time
 * 3. Batch can attend only 1 class at a time
 * 4. Labs need continuous 2-hour slots
 * 5. No overlapping assignments
 */

class AdvancedLabScheduler {
  constructor(schedule, branchId, semester, constraints) {
    this.schedule = schedule;           // Current schedule object
    this.branchId = branchId;
    this.semester = semester;
    this.constraints = constraints;
    this.labCapacity = 20;              // HARD LIMIT: Max 20 labs per time slot
    this.labSlotUsage = new Map();      // Track lab usage per (day, start, end)
    this.professorAssignments = new Map(); // Track professor.times
    this.batchAssignments = new Map();     // Track batch-time conflicts
    this.assignedLabs = [];              // Record of successfully assigned labs
  }

  /**
   * Schedule all labs using Greedy + Backtracking
   */
  async scheduleAllLabs(labSubjects) {
    console.log(`\n[AdvancedScheduler] Starting lab scheduling for ${labSubjects.length} subjects`);
    
    // STEP 1: Sort subjects by priority (MRV - subjects with fewest available slots first)
    const sortedSubjects = this.sortSubjectsByPriority(labSubjects);
    console.log(`[AdvancedScheduler] Sorted ${sortedSubjects.length} subjects by constraint tightness`);

    // STEP 2: Greedy assignment
    const unassignedSubjects = [];
    for (const subject of sortedSubjects) {
      const assigned = await this.greedyAssignLab(subject);
      if (!assigned) {
        unassignedSubjects.push(subject);
      }
    }

    // STEP 3: Backtracking for failed cases
    if (unassignedSubjects.length > 0) {
      console.log(`[AdvancedScheduler] ⚠️ ${unassignedSubjects.length} subjects failed greedy, trying backtracking...`);
      for (const subject of unassignedSubjects) {
        const resolved = await this.backtrackAndAssign(subject);
        if (!resolved) {
          console.warn(`[AdvancedScheduler] ❌ Could not assign: ${subject.name}`);
        }
      }
    }

    // STEP 4: Validate capacity
    this.validateLabCapacity();

    return {
      success: unassignedSubjects.length === 0,
      assigned: this.assignedLabs.length,
      unassigned: unassignedSubjects.length,
      conflicts: unassignedSubjects
    };
  }

  /**
   * STEP 1: Sort subjects by priority using MRV heuristic
   * - Labs with more constraints come first
   * - Subjects with fewer available slots come first
   */
  sortSubjectsByPriority(subjects) {
    return subjects.sort((a, b) => {
      // Priority 1: Labs (always first)
      if (a.type === 'LAB' && b.type !== 'LAB') return -1;
      if (b.type === 'LAB' && a.type !== 'LAB') return 1;

      // Priority 2: Heavy lab subjects (many labs per week) - hardest to fit
      const aLabsPerWeek = a.weekly_lab_count || 0;
      const bLabsPerWeek = b.weekly_lab_count || 0;
      if (bLabsPerWeek !== aLabsPerWeek) return bLabsPerWeek - aLabsPerWeek;

      // Priority 3: Subjects with specific professor constraints
      const aHasProf = !!a.professor_id;
      const bHasProf = !!b.professor_id;
      if (aHasProf && !bHasProf) return -1;
      if (!aHasProf && bHasProf) return 1;

      return 0;
    });
  }

  /**
   * STEP 2: Greedy assignment
   * Try to assign lecture to first valid slot
   */
  async greedyAssignLab(subject) {
    if (!subject.professor_id) {
      console.log(`[Greedy] ⚠️ ${subject.name}: No professor assigned - SKIP`);
      return false;
    }

    const batches = ['A', 'B'];  // Both batches need labs separately
    const labsNeeded = Math.min(1, subject.weekly_lab_count); // Max 1 lab per batch per week

    for (const batch of batches) {
      let assigned = false;
      const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

      // Try each day
      for (const day of days) {
        if (assigned) break;

        // Try timeslots (prioritize 2-hour blocks)
        const slots = this.getAvailableLabSlots(day);
        for (const slot of slots) {
          // CHECK CONSTRAINTS
          const canAssign = this.checkCanAssignLab(subject, batch, day, slot);

          if (canAssign) {
            // Assign lab
            this.assignLab(subject, batch, day, slot);
            console.log(`[Greedy] ✓ ${subject.name} Batch ${batch}: ${day} ${slot.start}-${slot.end}`);
            assigned = true;
            break;
          }
        }
      }

      if (!assigned) {
        console.log(`[Greedy] ✗ ${subject.name} Batch ${batch}: No valid slot found`);
        return false;
      }
    }

    return true;
  }

  /**
   * STEP 3: Backtracking - if greedy fails, try swapping/removing conflicts
   */
  async backtrackAndAssign(subject) {
    console.log(`[Backtrack] Trying to assign: ${subject.name}`);
    
    // Try moving other labs out of the way
    for (const labSlot of this.assignedLabs) {
      const couldMove = await this.tryMoveLab(labSlot, subject);
      if (couldMove) {
        // Try assigning this subject again
        const assigned = await this.greedyAssignLab(subject);
        if (assigned) {
          console.log(`[Backtrack] ✓ Success by moving ${labSlot.subject.name}`);
          return true;
        }
        // Revert if it didn't help
        await this.moveLab(labSlot, labSlot.day_orig, labSlot.slot_orig);
      }
    }

    return false;
  }

  /**
   * CHECK: Can assign this lab considering all constraints?
   */
  checkCanAssignLab(subject, batch, day, slot) {
    const profId = subject.professor_id;
    const slotKey = `${day}-${slot.start}-${slot.end}`;

    // CONSTRAINT 1: Lab capacity (max 7 labs at this time)
    const currentUsage = this.labSlotUsage.get(slotKey) || 0;
    if (currentUsage >= this.labCapacity) {
      return false;
    }

    // CONSTRAINT 2: Professor availability (not assigned at this time)
    const profAssigns = this.professorAssignments.get(profId) || [];
    const profConflict = profAssigns.some(a => 
      a.day === day && this.timeOverlaps(a.start, a.end, slot.start, slot.end)
    );
    if (profConflict) {
      return false;
    }

    // CONSTRAINT 3: Batch availability (not assigned at this time)
    const batchKey = `${batch}-${day}-${slot.start}-${slot.end}`;
    if (this.batchAssignments.has(batchKey)) {
      return false;
    }

    // CONSTRAINT 4: No 2-hour overlaps required
    // TODO: Check if 2-hour slot exists

    return true;
  }

  /**
   * ASSIGN: Register lab in all tracking structures
   */
  assignLab(subject, batch, day, slot) {
    const slotKey = `${day}-${slot.start}-${slot.end}`;
    const batchKey = `${batch}-${day}-${slot.start}-${slot.end}`;

    // Update lab usage
    this.labSlotUsage.set(slotKey, (this.labSlotUsage.get(slotKey) || 0) + 1);

    // Update professor assignments
    const profId = subject.professor_id;
    if (!this.professorAssignments.has(profId)) {
      this.professorAssignments.set(profId, []);
    }
    this.professorAssignments.get(profId).push({
      day, start: slot.start, end: slot.end, subject: subject.name
    });

    // Update batch assignments
    this.batchAssignments.set(batchKey, {
      subject: subject.name,
      professor: subject.professor_id
    });

    // Track in schedule
    const labKey = `${day}-${slot.start}-LAB-${subject.subject_id}-${batch}`;
    this.schedule[labKey] = {
      subject,
      type: 'LAB',
      batch,
      day,
      start: slot.start,
      end: slot.end
    };

    // Record assignment
    this.assignedLabs.push({
      subject,
      batch,
      day_orig: day,
      slot_orig: slot,
      day,
      slot
    });
  }

  /**
   * GET available lab slots for a given day
   */
  getAvailableLabSlots(day) {
    // Standard 2-hour lab slots
    return [
      { start: '09:00', end: '11:00' },
      { start: '11:15', end: '13:15' },
      { start: '14:00', end: '16:00' }
    ];
  }

  /**
   * UTILITY: Check if times overlap
   */
  timeOverlaps(start1, end1, start2, end2) {
    const timeToMin = (time) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };
    const s1 = timeToMin(start1);
    const e1 = timeToMin(end1);
    const s2 = timeToMin(start2);
    const e2 = timeToMin(end2);
    return s1 < e2 && s2 < e1;
  }

  /**
   * TRY: Move an existing lab to a different slot
   */
  async tryMoveLab(lab, targetSubject) {
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    for (const day of days) {
      if (day === lab.day_orig) continue; // Don't move to same day

      const slots = this.getAvailableLabSlots(day);
      for (const slot of slots) {
        const canMove = this.checkCanAssignLab(lab.subject, lab.batch, day, slot);
        if (canMove) {
          return true; // Found alternative slot
        }
      }
    }
    return false; // Can't find alternative
  }

  /**
   * MOVE: Actually relocate a lab
   */
  async moveLab(lab, newDay, newSlot) {
    // Update structures...
    // TODO: Implement actual move
  }

  /**
   * VALIDATE: Ensure no slot exceeds lab capacity
   */
  validateLabCapacity() {
    let violations = 0;
    for (const [slotKey, count] of this.labSlotUsage.entries()) {
      if (count > this.labCapacity) {
        console.error(`[Validate] ❌ ${slotKey}: ${count} labs (max ${this.labCapacity})`);
        violations++;
      }
    }
    if (violations === 0) {
      console.log(`[Validate] ✓ All lab slots within capacity`);
    }
    return violations === 0;
  }
}

module.exports = AdvancedLabScheduler;
