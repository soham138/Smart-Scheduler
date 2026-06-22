/**
 * Professor Constraint Engine
 * ===========================
 * Enforces professor availability as a HARD CONSTRAINT during timetable generation
 * 
 * Features:
 * 1. Pre-assignment validation: Check BEFORE assigning, never after
 * 2. Professor occupancy tracking: Real-time tracking of all professor slots
 * 3. Continuous block detection: Ensures 2-hour lab slots are uninterrupted
 * 4. Backtracking support: Automatic adjustment when conflicts detected
 * 5. Conflict resolution: Smart algorithm to find alternative slots
 */

class ProfessorConstraintEngine {
  constructor() {
    // Track professor occupancy: { professorId: { day: { timeSlot: subjectId } } }
    this.professorOccupancy = new Map();
    
    // Track which professors are assigned which subjects
    // { subjectId: professorId }
    this.subjectProfessorMap = new Map();
    
    // Track lab assignments to ensure continuous blocks
    // { labKey: { professorId, day, startTime, endTime, duration } }
    this.labAssignments = new Map();
    
    // Backup state for backtracking
    this.stateHistory = [];
  }

  /**
   * Initialize occupancy matrix for a set of professors
   * @param {Array} professors - List of professor IDs
   */
  initializeProfessors(professors) {
    professors.forEach(profId => {
      if (!this.professorOccupancy.has(profId)) {
        this.professorOccupancy.set(profId, {
          MON: {},
          TUE: {},
          WED: {},
          THU: {},
          FRI: {}
        });
      }
    });
  }

  /**
   * BEFORE assignment: Check if professor is available for a time slot
   * This is the HARD CONSTRAINT check - must pass before any assignment
   * 
   * @param {string} professorId - Professor to check
   * @param {string} day - Day of week (MON, TUE, etc)
   * @param {string} timeSlot - Time slot (e.g., "09:00-10:00")
   * @param {number} duration - Duration in minutes (60 for theory, 120 for lab)
   * @returns {boolean} - true if available, false if conflict
   */
  isAvailable(professorId, day, timeSlot, duration = 60) {
    // Ensure professor exists in occupancy map
    if (!this.professorOccupancy.has(professorId)) {
      return true;
    }

    const daySchedule = this.professorOccupancy.get(professorId)[day];
    if (!daySchedule) {
      return true;
    }

    // Check if any part of the requested time slot is occupied
    const [startTime, endTime] = timeSlot.split('-');
    const requestedStart = this.timeToMinutes(startTime);
    const requestedEnd = requestedStart + duration;

    // Check all existing assignments for overlap
    for (const [existingSlot, classId] of Object.entries(daySchedule)) {
      if (classId) {
        const [existingStart, existingEnd] = existingSlot.split('-');
        const existingStartMin = this.timeToMinutes(existingStart);
        const existingEndMin = this.timeToMinutes(existingEnd);

        // Check for overlap
        if (this.hasTimeOverlap(requestedStart, requestedEnd, existingStartMin, existingEndMin)) {
          console.log(`❌ CONFLICT: Prof ${professorId} already scheduled at ${day} ${timeSlot}`);
          return false;
        }
      }
    }

    console.log(`✅ Available: Prof ${professorId} can teach at ${day} ${timeSlot}`);
    return true;
  }

  /**
   * Assign a professor to a class and update occupancy
   * IMPORTANT: Only call this after isAvailable() returns true
   * 
   * @param {string} professorId - Professor to assign
   * @param {string} subjectId - Subject being taught
   * @param {string} day - Day of week
   * @param {string} timeSlot - Time slot
   * @param {number} duration - Duration in minutes
   * @returns {boolean} - true if assignment successful
   */
  assignProfessor(professorId, subjectId, day, timeSlot, duration = 60) {
    // HARD CONSTRAINT: Must check availability first
    if (!this.isAvailable(professorId, day, timeSlot, duration)) {
      console.error(`❌ CANNOT ASSIGN: Prof ${professorId} not available at ${day} ${timeSlot}`);
      return false;
    }

    // Save state before assignment (for backtracking)
    this.saveState();

    // Update occupancy
    const daySchedule = this.professorOccupancy.get(professorId);
    if (!daySchedule[day]) {
      daySchedule[day] = {};
    }
    daySchedule[day][timeSlot] = subjectId;

    // Update subject-professor map
    this.subjectProfessorMap.set(subjectId, professorId);

    console.log(`✅ ASSIGNED: Prof ${professorId} → Subject ${subjectId} at ${day} ${timeSlot}`);
    return true;
  }

  /**
   * Assign a lab and ensure continuous 2-hour block
   * @param {string} professorId - Lab instructor
   * @param {string} subjectId - Subject code
   * @param {string} day - Day of week
   * @param {string} startTime - Start time (e.g., "14:00")
   * @param {number} durationMinutes - Lab duration (typically 120 for 2 hours)
   */
  assignLabBlock(professorId, subjectId, day, startTime, durationMinutes = 120) {
    const timeSlot = this.createTimeSlot(startTime, durationMinutes);
    
    // Check availability for the ENTIRE block
    if (!this.isAvailable(professorId, day, timeSlot, durationMinutes)) {
      console.error(`❌ Cannot assign lab: Prof ${professorId} has conflict in ${day} ${timeSlot}`);
      return false;
    }

    // Assign the lab
    const success = this.assignProfessor(professorId, subjectId, day, timeSlot, durationMinutes);
    
    if (success) {
      // Track lab assignment for future reference
      const labKey = `${subjectId}_${day}_${startTime}`;
      this.labAssignments.set(labKey, {
        professorId,
        day,
        startTime,
        endTime: this.addMinutesToTime(startTime, durationMinutes),
        duration: durationMinutes
      });
      
      console.log(`✅ LAB ASSIGNED: ${subjectId} with Prof ${professorId} at ${day} ${timeSlot}`);
    }

    return success;
  }

  /**
   * Find the next available slot for a professor in a given day range
   * @param {string} professorId - Professor ID
   * @param {number} durationMinutes - Required duration (60 or 120)
   * @param {Array} availableSlots - List of possible slots to check
   * @returns {object} - Next available slot {day, timeSlot} or null
   */
  findNextAvailableSlot(professorId, durationMinutes, availableSlots) {
    for (const slot of availableSlots) {
      const { day, timeSlot } = slot;
      
      if (this.isAvailable(professorId, day, timeSlot, durationMinutes)) {
        console.log(`📍 Found available slot: ${day} ${timeSlot} for Prof ${professorId}`);
        return slot;
      }
    }

    console.warn(`⚠️  No available slot found for Prof ${professorId}`);
    return null;
  }

  /**
   * Get professor's schedule for a specific day
   * @param {string} professorId - Professor ID
   * @param {string} day - Day (MON, TUE, etc)
   * @returns {object} - Schedule details
   */
  getProfessorDaySchedule(professorId, day) {
    if (!this.professorOccupancy.has(professorId)) {
      return {};
    }

    return this.professorOccupancy.get(professorId)[day] || {};
  }

  /**
   * Get professor's entire weekly schedule
   * @param {string} professorId - Professor ID
   * @returns {object} - Complete weekly schedule
   */
  getProfessorWeeklySchedule(professorId) {
    return this.professorOccupancy.get(professorId) || {};
  }

  /**
   * Count how many classes a professor has scheduled
   * @param {string} professorId - Professor ID
   * @returns {number} - Total class count
   */
  getProfessorClassCount(professorId) {
    let count = 0;
    const schedule = this.getProfessorWeeklySchedule(professorId);
    
    Object.values(schedule).forEach(daySchedule => {
      count += Object.keys(daySchedule).length;
    });

    return count;
  }

  /**
   * Unassign a professor from a slot (for backtracking)
   * @param {string} professorId - Professor ID
   * @param {string} subjectId - Subject ID
   * @param {string} day - Day
   * @param {string} timeSlot - Time slot
   */
  unassignProfessor(professorId, subjectId, day, timeSlot) {
    if (this.professorOccupancy.has(professorId)) {
      const daySchedule = this.professorOccupancy.get(professorId)[day];
      if (daySchedule && daySchedule[timeSlot]) {
        delete daySchedule[timeSlot];
        console.log(`🔄 Unassigned: Prof ${professorId} from ${day} ${timeSlot}`);
      }
    }

    // Remove from subject map
    if (this.subjectProfessorMap.get(subjectId) === professorId) {
      this.subjectProfessorMap.delete(subjectId);
    }
  }

  /**
   * Save current state for backtracking
   */
  saveState() {
    const state = {
      occupancy: new Map(
        Array.from(this.professorOccupancy.entries()).map(([key, val]) => [
          key,
          JSON.parse(JSON.stringify(val))
        ])
      ),
      subjectProfessor: new Map(this.subjectProfessorMap),
      labAssignments: new Map(this.labAssignments)
    };
    
    this.stateHistory.push(state);
  }

  /**
   * Restore to previous state (backtracking)
   * @returns {boolean} - true if restored, false if no history
   */
  restorePreviousState() {
    if (this.stateHistory.length === 0) {
      console.warn('⚠️  No previous state to restore');
      return false;
    }

    const previousState = this.stateHistory.pop();
    this.professorOccupancy = previousState.occupancy;
    this.subjectProfessorMap = previousState.subjectProfessor;
    this.labAssignments = previousState.labAssignments;

    console.log('🔄 Restored previous state for backtracking');
    return true;
  }

  /**
   * Clear all state (for new generation)
   */
  reset() {
    this.professorOccupancy.clear();
    this.subjectProfessorMap.clear();
    this.labAssignments.clear();
    this.stateHistory = [];
    console.log('🔄 Constraint engine reset');
  }

  // ============= HELPER METHODS =============

  /**
   * Convert time string to minutes since midnight
   * @param {string} time - Time in "HH:MM" format
   * @returns {number} - Minutes since midnight
   */
  timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Check if two time ranges overlap
   * @param {number} start1 - Start time in minutes
   * @param {number} end1 - End time in minutes
   * @param {number} start2 - Start time in minutes
   * @param {number} end2 - End time in minutes
   * @returns {boolean} - true if overlapping
   */
  hasTimeOverlap(start1, end1, start2, end2) {
    return start1 < end2 && start2 < end1;
  }

  /**
   * Create time slot string from start time and duration
   * @param {string} startTime - Start time "HH:MM"
   * @param {number} durationMinutes - Duration in minutes
   * @returns {string} - Time slot "HH:MM-HH:MM"
   */
  createTimeSlot(startTime, durationMinutes) {
    const endMinutes = this.timeToMinutes(startTime) + durationMinutes;
    const endTime = this.minutesToTime(endMinutes);
    return `${startTime}-${endTime}`;
  }

  /**
   * Convert minutes to time string
   * @param {number} minutes - Minutes since midnight
   * @returns {string} - Time in "HH:MM" format
   */
  minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  /**
   * Add minutes to a time string
   * @param {string} time - Start time "HH:MM"
   * @param {number} minutes - Minutes to add
   * @returns {string} - New time "HH:MM"
   */
  addMinutesToTime(time, minutes) {
    const totalMinutes = this.timeToMinutes(time) + minutes;
    return this.minutesToTime(totalMinutes);
  }

  /**
   * Get detailed conflict report
   * @returns {string} - Human-readable conflict analysis
   */
  getConflictReport() {
    let report = '📊 PROFESSOR AVAILABILITY REPORT\n';
    report += '================================\n\n';

    for (const [profId, weekSchedule] of this.professorOccupancy.entries()) {
      report += `👨‍🏫 Professor: ${profId}\n`;
      let profTotal = 0;

      for (const [day, daySchedule] of Object.entries(weekSchedule)) {
        const dayCount = Object.keys(daySchedule).filter(k => daySchedule[k]).length;
        if (dayCount > 0) {
          report += `  ${day}: ${dayCount} classes\n`;
          profTotal += dayCount;
        }
      }

      report += `  Weekly Total: ${profTotal} classes\n\n`;
    }

    return report;
  }
}

module.exports = ProfessorConstraintEngine;
