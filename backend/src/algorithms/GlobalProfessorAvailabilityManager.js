/**
 * GLOBAL PROFESSOR AVAILABILITY MANAGER
 * =============================================
 * Maintains SINGLE GLOBAL occupancy structure tracking ALL professors
 * across ALL branches, semesters, days, and time slots.
 * 
 * CRITICAL RULE: Before assigning ANY class, MUST check global availability.
 * If unavailable, REJECT immediately. Update occupancy after SUCCESSFUL assignment.
 * 
 * Purpose: Prevent professor double-booking across branches and semesters
 */

class GlobalProfessorAvailabilityManager {
  constructor() {
    // Map structure: profId -> Map<day -> Map<timeSlot -> assignmentDetails>>
    // Example: prof_123 -> { MON -> { "09:00-10:00" -> { branch, semester, subject } } }
    this.globalOccupancy = new Map();
    
    // Flat list for quick lookups: profId -> Array of assignments
    // Used for historical queries and conflict resolution
    this.assignmentHistory = new Map();
    
    // Savepoint for backtracking
    this.savepoints = [];
    
    // Time utilities
    this.timeUtil = {
      toMinutes: (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
      },
      fromMinutes: (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      },
      overlaps: (start1Str, end1Str, start2Str, end2Str) => {
        const start1 = this.timeUtil.toMinutes(start1Str);
        const end1 = this.timeUtil.toMinutes(end1Str);
        const start2 = this.timeUtil.toMinutes(start2Str);
        const end2 = this.timeUtil.toMinutes(end2Str);
        return start1 < end2 && start2 < end1; // Overlap if NOT (end before start OR start after end)
      }
    };
  }

  /**
   * STEP 1: Load ALL existing assignments from database (all branches, all semesters)
   * Called once at the start of ENTIRE generation cycle (not per-semester)
   */
  async loadFromDatabase(pool) {
    try {
      console.log(`[GLOBAL-MGR] Loading all existing professor assignments from database...`);
      
      const query = `
        SELECT 
          professor_id,
          day_of_week,
          time_slot_start,
          time_slot_end,
          branch_id,
          semester,
          subject_id,
          slot_type
        FROM timetable
        WHERE professor_id IS NOT NULL
        AND slot_type IN ('THEORY', 'LAB')
        ORDER BY professor_id, day_of_week, time_slot_start
      `;
      
      const result = await pool.query(query);
      const loadedCount = result.rows.length;
      
      // Populate occupancy map
      result.rows.forEach(row => {
        this.addAssignment(
          row.professor_id,
          row.day_of_week,
          row.time_slot_start,
          row.time_slot_end,
          {
            branch: row.branch_id,
            semester: row.semester,
            subject: row.subject_id,
            type: row.slot_type,
            source: 'DATABASE'
          }
        );
      });
      
      console.log(`[GLOBAL-MGR] ✅ Loaded ${loadedCount} existing assignments`);
      console.log(`[GLOBAL-MGR] Tracking ${this.globalOccupancy.size} professors with active assignments`);
      
      return loadedCount;
    } catch (error) {
      console.error(`[GLOBAL-MGR] ❌ Failed to load from database:`, error.message);
      throw error;
    }
  }

  /**
   * STEP 2: Check if professor is available at specific day/time
   * BEFORE assignment - returns true/false only
   * 
   * Returns: { available: boolean, conflict: conflictDetails|null }
   */
  isAvailable(professorId, day, startTime, endTime) {
    if (!professorId) {
      return { available: true, conflict: null }; // No professor = no conflict possible
    }
    
    const profOccupancy = this.globalOccupancy.get(professorId);
    if (!profOccupancy) {
      return { available: true, conflict: null }; // Professor has no assignments yet
    }
    
    const daySchedule = profOccupancy.get(day);
    if (!daySchedule) {
      return { available: true, conflict: null }; // Professor free this day
    }
    
    // Check each existing assignment for time overlap
    for (const [slotKey, assignment] of daySchedule.entries()) {
      const existingStart = assignment.start;
      const existingEnd = assignment.end;
      
      const hasOverlap = this.timeUtil.overlaps(startTime, endTime, existingStart, existingEnd);
      
      if (hasOverlap) {
        return {
          available: false,
          conflict: {
            day,
            existingSlot: `${existingStart}-${existingEnd}`,
            requestedSlot: `${startTime}-${endTime}`,
            branch: assignment.branch,
            semester: assignment.semester,
            subject: assignment.subject,
            type: assignment.type,
            message: `Professor already assigned in Branch ${assignment.branch} Semester ${assignment.semester} at ${day} ${existingStart}-${existingEnd}`
          }
        };
      }
    }
    
    return { available: true, conflict: null };
  }

  /**
   * STEP 3: Assign professor at specific day/time
   * ONLY call after isAvailable() returns true
   * 
   * Immediately updates occupancy - next check will see this assignment
   */
  assign(professorId, day, startTime, endTime, assignmentContext) {
    if (!professorId) return true;
    
    // Double-check availability (defensive programming)
    const check = this.isAvailable(professorId, day, startTime, endTime);
    if (!check.available) {
      console.warn(`[GLOBAL-MGR] WARNING: Attempting to assign despite conflict:`, check.conflict.message);
      return false; // Reject if somehow conflicted
    }
    
    // Add to global occupancy immediately
    this.addAssignment(professorId, day, startTime, endTime, {
      ...assignmentContext,
      source: 'CURRENT_GENERATION'
    });
    
    return true;
  }

  /**
   * Internal: Add assignment to occupancy structure
   */
  addAssignment(professorId, day, startTime, endTime, context) {
    // Initialize professor entry if needed
    if (!this.globalOccupancy.has(professorId)) {
      this.globalOccupancy.set(professorId, new Map());
    }
    
    // Initialize day entry if needed
    const profOccupancy = this.globalOccupancy.get(professorId);
    if (!profOccupancy.has(day)) {
      profOccupancy.set(day, new Map());
    }
    
    // Create unique slot key
    const slotKey = `${startTime}-${endTime}`;
    const daySchedule = profOccupancy.get(day);
    
    // Store assignment
    daySchedule.set(slotKey, {
      start: startTime,
      end: endTime,
      ...context
    });
    
    // Also track in history for reporting
    if (!this.assignmentHistory.has(professorId)) {
      this.assignmentHistory.set(professorId, []);
    }
    this.assignmentHistory.get(professorId).push({
      day,
      start: startTime,
      end: endTime,
      ...context
    });
  }

  /**
   * STEP 4: Find next available slot for professor in week
   * Useful for backtracking/retry logic
   * 
   * Returns: Array of available slots sorted by preference
   */
  findAvailableSlots(professorId, day, duration = 60, availableSlots = []) {
    if (!professorId) return availableSlots; // No professor = all slots available
    
    const profOccupancy = this.globalOccupancy.get(professorId);
    if (!profOccupancy) return availableSlots; // No occupancy = all slots available
    
    const daySchedule = profOccupancy.get(day);
    if (!daySchedule) return availableSlots; // No day occupancy = all day slots available
    
    // Filter slots that don't overlap with existing assignments
    const available = availableSlots.filter(slot => {
      for (const [, assignment] of daySchedule.entries()) {
        const hasOverlap = this.timeUtil.overlaps(slot.start, slot.end, assignment.start, assignment.end);
        if (hasOverlap) return false; // Overlaps - not available
      }
      return true; // No overlaps - available
    });
    
    return available;
  }

  /**
   * STEP 5: Get summary of professor's weekly schedule
   * For monitoring and debugging
   */
  getProfessorWeeklySchedule(professorId) {
    if (!this.globalOccupancy.has(professorId)) {
      return null;
    }
    
    const schedule = {};
    const profOccupancy = this.globalOccupancy.get(professorId);
    
    for (const [day, daySchedule] of profOccupancy.entries()) {
      schedule[day] = [];
      for (const [, assignment] of daySchedule.entries()) {
        schedule[day].push({
          time: `${assignment.start}-${assignment.end}`,
          branch: assignment.branch,
          semester: assignment.semester,
          subject: assignment.subject,
          type: assignment.type
        });
      }
    }
    
    return schedule;
  }

  /**
   * STEP 6: Get all professors and their occupancy stats
   * For load balancing and monitoring
   */
  getOccupancyStatistics() {
    const stats = {
      totalProfessors: this.globalOccupancy.size,
      assignmentsByDay: {},
      assignmentsByBranch: {},
      averageLoadPerProf: 0,
      mostBusyProfessor: null,
      leastBusyProfessor: null
    };
    
    let totalAssignments = 0;
    let maxLoad = 0;
    let minLoad = Infinity;
    let busiest = null;
    let least = null;
    
    for (const [profId, dayMap] of this.globalOccupancy.entries()) {
      let profLoad = 0;
      for (const [day, slotMap] of dayMap.entries()) {
        const dayCount = slotMap.size;
        profLoad += dayCount;
        stats.assignmentsByDay[day] = (stats.assignmentsByDay[day] || 0) + dayCount;
      }
      
      totalAssignments += profLoad;
      
      if (profLoad > maxLoad) {
        maxLoad = profLoad;
        busiest = profId;
      }
      if (profLoad < minLoad) {
        minLoad = profLoad;
        least = profId;
      }
    }
    
    stats.totalAssignments = totalAssignments;
    stats.averageLoadPerProf = this.globalOccupancy.size > 0 
      ? Math.round(totalAssignments / this.globalOccupancy.size * 100) / 100 
      : 0;
    stats.mostBusyProfessor = { id: busiest, load: maxLoad };
    stats.leastBusyProfessor = { id: least, load: minLoad };
    
    return stats;
  }

  /**
   * STEP 7: Create savepoint for backtracking
   * If assignment fails, can restore to this point
   */
  createSavepoint() {
    const savepoint = {
      timestamp: Date.now(),
      occupancy: this.deepCloneOccupancy(),
      history: JSON.parse(JSON.stringify(Array.from(this.assignmentHistory.entries())))
    };
    this.savepoints.push(savepoint);
    return savepoint;
  }

  /**
   * STEP 8: Restore to previous savepoint
   */
  restoreToSavepoint(index = -1) {
    if (this.savepoints.length === 0) {
      console.warn(`[GLOBAL-MGR] No savepoints available for restoration`);
      return false;
    }
    
    const targetIndex = index === -1 ? this.savepoints.length - 1 : index;
    if (targetIndex < 0 || targetIndex >= this.savepoints.length) {
      console.error(`[GLOBAL-MGR] Invalid savepoint index: ${targetIndex}`);
      return false;
    }
    
    const savepoint = this.savepoints[targetIndex];
    this.globalOccupancy = this.deepCloneOccupancy(savepoint.occupancy);
    this.assignmentHistory = new Map(savepoint.history);
    
    // Remove savepoints after this one (can't redo)
    this.savepoints = this.savepoints.slice(0, targetIndex);
    
    console.log(`[GLOBAL-MGR] ✅ Restored to savepoint from ${new Date(savepoint.timestamp).toISOString()}`);
    return true;
  }

  /**
   * Deep clone occupancy structure (for savepoints)
   */
  deepCloneOccupancy(source = this.globalOccupancy) {
    const cloned = new Map();
    for (const [profId, dayMap] of source.entries()) {
      const clonedDayMap = new Map();
      for (const [day, slotMap] of dayMap.entries()) {
        const clonedSlotMap = new Map(slotMap);
        clonedDayMap.set(day, clonedSlotMap);
      }
      cloned.set(profId, clonedDayMap);
    }
    return cloned;
  }

  /**
   * Generate conflict report for analysis
   */
  generateConflictReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalAssignments: this.getTotalAssignmentCount(),
      assignmentsByType: this.getAssignmentsByType(),
      professorLoads: this.getProfessorLoads(),
      dayDistribution: this.getDayDistribution()
    };
    return report;
  }

  /**
   * Get total assignment count across all professors
   */
  getTotalAssignmentCount() {
    let count = 0;
    for (const [, dayMap] of this.globalOccupancy.entries()) {
      for (const [, slotMap] of dayMap.entries()) {
        count += slotMap.size;
      }
    }
    return count;
  }

  /**
   * Group assignments by type (THEORY/LAB)
   */
  getAssignmentsByType() {
    const byType = { THEORY: 0, LAB: 0, UNKNOWN: 0 };
    for (const assignments of this.assignmentHistory.values()) {
      for (const assignment of assignments) {
        const type = assignment.type || 'UNKNOWN';
        byType[type] = (byType[type] || 0) + 1;
      }
    }
    return byType;
  }

  /**
   * Get load per professor
   */
  getProfessorLoads() {
    const loads = {};
    for (const [profId, dayMap] of this.globalOccupancy.entries()) {
      let count = 0;
      for (const [, slotMap] of dayMap.entries()) {
        count += slotMap.size;
      }
      loads[profId] = count;
    }
    return loads;
  }

  /**
   * Get distribution by day
   */
  getDayDistribution() {
    const distribution = {};
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    for (const day of days) {
      distribution[day] = 0;
    }
    
    for (const [, dayMap] of this.globalOccupancy.entries()) {
      for (const [day, slotMap] of dayMap.entries()) {
        if (distribution[day] !== undefined) {
          distribution[day] += slotMap.size;
        }
      }
    }
    
    return distribution;
  }

  /**
   * Clear all occupancy (for testing/reset)
   */
  reset() {
    this.globalOccupancy.clear();
    this.assignmentHistory.clear();
    this.savepoints = [];
    console.log(`[GLOBAL-MGR] ✅ Occupancy cleared`);
  }

  /**
   * Print human-readable summary
   */
  printSummary() {
    console.log(`\n[GLOBAL-MGR] ════════════════════════════════════════════`);
    console.log(`[GLOBAL-MGR] GLOBAL PROFESSOR AVAILABILITY SUMMARY`);
    console.log(`[GLOBAL-MGR] ════════════════════════════════════════════`);
    
    const stats = this.getOccupancyStatistics();
    console.log(`Professors tracked: ${stats.totalProfessors}`);
    console.log(`Total assignments: ${stats.totalAssignments}`);
    console.log(`Average load/professor: ${stats.averageLoadPerProf} slots`);
    console.log(`Most busy: Prof ${stats.mostBusyProfessor.id?.substring(0, 8)}... (${stats.mostBusyProfessor.load} slots)`);
    console.log(`Least busy: Prof ${stats.leastBusyProfessor.id?.substring(0, 8)}... (${stats.leastBusyProfessor.load} slots)`);
    
    console.log(`\nAssignments by day:`);
    for (const [day, count] of Object.entries(stats.assignmentsByDay)) {
      console.log(`  ${day}: ${count}`);
    }
    
    console.log(`[GLOBAL-MGR] ════════════════════════════════════════════\n`);
  }
}

module.exports = GlobalProfessorAvailabilityManager;
