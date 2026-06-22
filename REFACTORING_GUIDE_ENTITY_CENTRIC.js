/**
 * CRITICAL: Current Algorithm Flaw vs Entity-Centric Solution
 * ===========================================================
 * 
 * PROBLEM IDENTIFICATION
 * ======================
 */

// CURRENT BEHAVIOR: Subject-Centric (treating subjects as atomic units)
// =====================================================================

/*
Example Flow:
  
  Branch: AI, Semester 3
  Subjects: ENG1 (12 lectures), MIN3 (6 labs), DIS3 (9 lectures)
  
  Current Algorithm:
  1. Gets 3 subjects as LIST items
  2. Iterates through subjects ONE BY ONE
  3. For each subject, tries to fit ALL weekly slots into timetable
  
  Problem: Treats MIN3 as ONE THING
  - Question: Are LABs and THEORY separated in code?
  - Question: Are Batch A and Batch B separated?
  
  Code does:
  for subject in subjects:
    scheduleWeeklySlots(subject)  // Puts EVERYTHING for MIN3 in timetable
    // But does it create separate slots for:
    //   - 6 LAB slots for Batch A?
    //   - 6 LAB slots for Batch B?
    //   - Both at different times?
  
  Likely result: LAB and THEORY get mixed, or batches share times
*/

// RECOMMENDED BEHAVIOR: Entity-Centric (treating each slot as independent)
// =======================================================================

/*
Each scheduling "INSTANCE" is tracked separately:

Instances to schedule for AI Sem 3 MIN3:
  1. MIN3-LAB-BATCH_A (6 slots needed, 120 min each)
  2. MIN3-LAB-BATCH_B (6 slots needed, 120 min each)
  3. MIN3-THEORY (12 slots needed, 60 min each)

For each INSTANCE:
  - Independently find time slots
  - Check PROFESSOR constraint (globally)
  - Check LAB constraint (availability)
  - Check BATCH constraint (no overlap with other subjects)
  - Mark slot as USED
  - Move to next instance

Result: All 3 instances scheduled properly with zero conflicts
*/

/**
 * STEP 1: Identify what the current code stores for each subject
 */

// Check scheduleLabs() function - how does it handle batches?
// Lines 928+ in TimetableAlgorithm.js

// Hypothesis: Current code might have:
//   this.schedule[dayTime] = {
//     subject_id: 123,
//     professor_id: 45,
//     batch: 'A',  // Or does it track both batches together?
//     type: 'LAB'
//   }
//
// Question: Are LABs for Batch A and Batch B scheduled in separate time slots?
// Or does it combine them into a single slot?

/**
 * STEP 2: Trace through actual scheduling logic
 */

/*
Current code structure (from TimetableAlgorithm.js):

1. scheduleLabs() - lines 928+
2. scheduleTheory() - lines 561+
3. scheduleOthers() - for breaks, library, etc

So there IS separation between LABs and THEORY. ✓

But the questions remain:
  - Within LABs, are Batch A and Batch B treated as SEPARATE instances?
  - Or does the code somehow combine them?
  
To answer this, need to see:
  - How many "slots" does it create for a subject?
  - Example: For MIN3 (weekly_lab_count=1), does it create:
    - 2 slots (1 for Batch A, 1 for Batch B)? ✓ CORRECT
    - 1 slot (shared by both batches)? ✗ WRONG
*/

/**
 * FIX: Explicit Instance Creation and Tracking
 * =============================================
 */

// In TimetableAlgorithm.js, create new method:

class TimetableAlgorithmImproved {
  
  async prepareSchedulingInstances() {
    /**
     * Convert flat subject list into explicit scheduling INSTANCES
     * 
     * Input: List of subjects for this branch-semester
     * Output: List of 300+ individual scheduling instances
     */
    
    const instances = [];
    
    const subjects = await this.getSubjectsForBranchSemester();
    
    for (const subject of subjects) {
      // Instance Type 1: LAB for Batch A
      if (subject.weekly_lab_count > 0) {
        instances.push({
          id: `${subject.subject_id}-LAB-A`,
          subject_id: subject.subject_id,
          subject_code: subject.code,
          subject_name: subject.name,
          type: 'LAB',
          batch: 'A',
          professor_id: subject.professor_id,
          branch_id: this.branchId,
          semester: this.semester,
          weekly_slots_needed: subject.weekly_lab_count,  // Typically 1 or 2
          slot_duration_minutes: 120,  // 2-hour lab
          priority: 1,  // Labs first
          status: 'UNSCHEDULED'
        });
      }
      
      // Instance Type 2: LAB for Batch B
      if (subject.weekly_lab_count > 0) {
        instances.push({
          id: `${subject.subject_id}-LAB-B`,
          subject_id: subject.subject_id,
          subject_code: subject.code,
          subject_name: subject.name,
          type: 'LAB',
          batch: 'B',
          professor_id: subject.professor_id,
          branch_id: this.branchId,
          semester: this.semester,
          weekly_slots_needed: subject.weekly_lab_count,
          slot_duration_minutes: 120,
          priority: 1,
          status: 'UNSCHEDULED'
        });
      }
      
      // Instance Type 3: THEORY (applies to whole semester, not per batch)
      if (subject.weekly_lecture_count > 0) {
        instances.push({
          id: `${subject.subject_id}-THEORY`,
          subject_id: subject.subject_id,
          subject_code: subject.code,
          subject_name: subject.name,
          type: 'THEORY',
          batch: null,  // Theory is for entire semester
          professor_id: subject.professor_id,
          branch_id: this.branchId,
          semester: this.semester,
          weekly_slots_needed: subject.weekly_lecture_count,
          slot_duration_minutes: 60,
          priority: 2,  // Theory second
          status: 'UNSCHEDULED'
        });
      }
    }
    
    console.log(`[Instances] Created ${instances.length} scheduling instances for ${this.branchName} Sem ${this.semester}`);
    instances.forEach(inst => {
      if (inst.status === 'UNSCHEDULED') {
        console.log(`  - ${inst.subject_code} (${inst.type}) Batch ${inst.batch || 'ALL'}: ${inst.weekly_slots_needed} × ${inst.slot_duration_minutes}min`);
      }
    });
    
    return instances;
  }
  
  async scheduleInstanceExplicitly(instance) {
    /**
     * Schedule ONE instance (e.g., "MIN3-LAB-BATCH_A")
     * Returns: { scheduled: true, day, time } or { scheduled: false, reason }
     */
    
    // Try every day, every time slot
    for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI']) {
      for (const timeSlot of this.timeSlots) {
        if (timeSlot.day !== day) continue;
        
        const slotKey = `${day}-${timeSlot.start}`;
        
        // Check if this time slot is available for instance
        const canUse = await this.canUseTimeSlot(instance, day, timeSlot);
        
        if (canUse.available) {
          // SCHEDULE IT
          const slot = {
            instance_id: instance.id,
            subject_id: instance.subject_id,
            subject_code: instance.subject_code,
            type: instance.type,
            batch: instance.batch,
            professor_id: instance.professor_id,
            branch_id: instance.branch_id,
            semester: instance.semester,
            day,
            start_time: timeSlot.start,
            end_time: timeSlot.end,
            room: this.assignRoom(instance, day, timeSlot)
          };
          
          // Save to timetable
          this.timetable[slotKey] = slot;
          
          // Update constraint tracking
          this.updateProfessorSchedule(instance.professor_id, day, timeSlot.start, timeSlot.end, instance.subject_code);
          this.updateLabUsage(day, timeSlot.start, timeSlot.end);
          this.updateBatchSchedule(instance.batch, instance.branch_id, day, timeSlot.start, timeSlot.end);
          this.updateBranchSemesterSchedule(instance.branch_id, instance.semester, day, timeSlot.start, timeSlot.end);
          
          instance.status = 'SCHEDULED';
          instance.scheduled_slot = slotKey;
          
          return { scheduled: true, day, time: timeSlot.start, room: slot.room };
        }
      }
    }
    
    // If we get here, instance couldn't be scheduled
    instance.status = 'UNSCHEDULED';
    return { scheduled: false, reason: 'No available time slot' };
  }
  
  async canUseTimeSlot(instance, day, timeSlot) {
    /**
     * Comprehensive constraint check before using time slot
     * Returns: { available: true/false, conflicts: [...] }
     */
    
    const slot = `${day}-${timeSlot.start}-${timeSlot.end}`;
    const conflicts = [];
    
    // 1. PROFESSOR CONSTRAINT (GLOBAL - across all branches)
    if (instance.professor_id) {
      const profOtherAssignments = this.globalProfessorSchedule.get(instance.professor_id) || [];
      for (const other of profOtherAssignments) {
        if (other.day === day && this.timeOverlaps(
          timeSlot.start, timeSlot.end,
          other.start, other.end
        )) {
          conflicts.push(`Professor ${instance.professor_id} busy: ${other.branch}-${other.semester} ${other.subject_code}`);
        }
      }
    }
    
    // 2. LAB CAPACITY CONSTRAINT
    if (instance.type === 'LAB') {
      const labsUsedInSlot = (this.labSlotUsage.get(slot) || 0);
      if (labsUsedInSlot >= this.MAX_LABS_PER_SLOT) {
        conflicts.push(`Lab capacity exceeded: ${labsUsedInSlot}/${this.MAX_LABS_PER_SLOT}`);
      }
    }
    
    // 3. BATCH CONSTRAINT (for LABs only - batches can't both be in class)
    if (instance.type === 'LAB' && instance.batch) {
      const batchKey = `${instance.branch_id}-${instance.batch}-${slot}`;
      if (this.batchSchedule.has(batchKey)) {
        conflicts.push(`Batch ${instance.batch} already assigned to ${this.batchSchedule.get(batchKey).subject_code}`);
      }
    }
    
    // 4. BRANCH-SEMESTER CONSTRAINT (can't have 2 different subjects for same batch in same time)
    // This prevents: Batch A of AI-Sem3 from having 2 different subjects at same time
    const branchBatchKey = `${instance.branch_id}-${instance.semester}-${instance.batch || 'ALL'}-${slot}`;
    if (this.branchSemesterBatchSchedule.has(branchBatchKey)) {
      const existing = this.branchSemesterBatchSchedule.get(branchBatchKey);
      if (existing.subject_id !== instance.subject_id) {
        conflicts.push(`Batch already has ${existing.subject_code} at this time`);
      }
    }
    
    return {
      available: conflicts.length === 0,
      conflicts
    };
  }
  
  async generateImproved() {
    /**
     * Main scheduling loop: Entity-centric approach
     */
    
    console.log(`\n[Scheduling] ${this.branchName}, Semester ${this.semester}`);
    console.log(`===============================================`);
    
    // Step 1: Create instances
    const instances = await this.prepareSchedulingInstances();
    
    // Step 2: Sort by priority (LABs first, then by professor workload)
    instances.sort((a, b) => a.priority - b.priority);
    
    // Step 3: Schedule each instance
    const scheduledCount = { success: 0, failed: 0 };
    
    for (const instance of instances) {
      const result = await this.scheduleInstanceExplicitly(instance);
      
      if (result.scheduled) {
        scheduledCount.success++;
        console.log(`✓ ${instance.subject_code} (${instance.type}) Batch ${instance.batch || 'ALL'} → ${result.day} ${result.time}`);
      } else {
        scheduledCount.failed++;
        console.log(`✗ ${instance.subject_code} (${instance.type}) Batch ${instance.batch || 'ALL'} - ${result.reason}`);
      }
    }
    
    // Step 4: Report
    console.log(`\n[Summary] ${this.branchName} Sem ${this.semester}: ${scheduledCount.success}/${instances.length} instances scheduled`);
    if (scheduledCount.failed > 0) {
      console.warn(`[Alert] ${scheduledCount.failed} instances could not be scheduled!`);
    }
    
    return scheduledCount.failed === 0;
  }
}

module.exports = { TimetableAlgorithmImproved };
