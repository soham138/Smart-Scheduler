/**
 * Constraint-Aware Timetable Assignment Manager
 * =============================================
 * Provides safe methods for assigning subjects while respecting professor constraints
 * 
 * This wraps the ProfessorConstraintEngine and provides business logic for:
 * - Pre-checking professor availability
 * - Finding alternative slots when needed
 * - Backtracking on failures
 * - Balancing loads across professors
 */

const ProfessorConstraintEngine = require('./ProfessorConstraintEngine');

class SafeAssignmentManager {
  constructor() {
    this.engine = new ProfessorConstraintEngine();
    this.assignmentLog = [];
    this.failureLog = [];
  }

  /**
   * Initialize with professors before making assignments
   * @param {Array} professors - List of {professor_id, name, subjects: [...]}
   */
  initializeWithProfessors(professors) {
    const profIds = professors.map(p => p.professor_id);
    this.engine.initializeProfessors(profIds);
    this.professors = new Map(professors.map(p => [p.professor_id, p]));
    console.log(`✅ Initialized with ${profIds.length} professors`);
  }

  /**
   * SAFE assignment for theory class
   * Pre-checks availability, then assigns
   * Returns {success, message, slot}
   */
  async assignTheoryClass(params) {
    const { professorId, subjectId, day, timeSlot, duration = 60 } = params;

    // STEP 1: Validate professor exists
    if (!this.professors.has(professorId)) {
      return {
        success: false,
        message: `Professor ${professorId} not found`,
        slot: null
      };
    }

    // STEP 2: Check availability BEFORE assignment
    if (!this.engine.isAvailable(professorId, day, timeSlot, duration)) {
      this.failureLog.push({
        type: 'THEORY_CONFLICT',
        professor: professorId,
        subject: subjectId,
        requestedSlot: `${day} ${timeSlot}`,
        reason: 'Professor already scheduled'
      });

      return {
        success: false,
        message: `Prof ${professorId} not available at ${day} ${timeSlot}`,
        slot: null
      };
    }

    // STEP 3: Assign ONLY after validation passes
    const assigned = this.engine.assignProfessor(
      professorId,
      subjectId,
      day,
      timeSlot,
      duration
    );

    if (assigned) {
      this.assignmentLog.push({
        type: 'THEORY',
        professor: professorId,
        subject: subjectId,
        day,
        timeSlot,
        duration
      });

      return {
        success: true,
        message: `Assigned Prof ${professorId} to ${subjectId}`,
        slot: { day, timeSlot }
      };
    }

    return {
      success: false,
      message: 'Assignment failed (unknown error)',
      slot: null
    };
  }

  /**
   * SAFE assignment for lab class (2-hour block)
   * Ensures continuous availability
   */
  async assignLabClass(params) {
    const { professorId, subjectId, day, startTime, duration = 120 } = params;

    // STEP 1: Validate
    if (!this.professors.has(professorId)) {
      return {
        success: false,
        message: `Professor ${professorId} not found`,
        slot: null
      };
    }

    // STEP 2: Create time slot
    const endTime = this.engine.addMinutesToTime(startTime, duration);
    const timeSlot = `${startTime}-${endTime}`;

    // STEP 3: Check entire 2-hour block is available
    if (!this.engine.isAvailable(professorId, day, timeSlot, duration)) {
      this.failureLog.push({
        type: 'LAB_CONFLICT',
        professor: professorId,
        subject: subjectId,
        requestedSlot: `${day} ${timeSlot}`,
        reason: 'Lab 2-hour block interrupted or occupied'
      });

      return {
        success: false,
        message: `Prof ${professorId} not available for 2-hour block: ${day} ${timeSlot}`,
        slot: null
      };
    }

    // STEP 4: Assign ONLY after full block is validated
    const assigned = this.engine.assignLabBlock(
      professorId,
      subjectId,
      day,
      startTime,
      duration
    );

    if (assigned) {
      this.assignmentLog.push({
        type: 'LAB',
        professor: professorId,
        subject: subjectId,
        day,
        startTime,
        endTime,
        duration
      });

      return {
        success: true,
        message: `Assigned Prof ${professorId} to lab ${subjectId} (${duration} mins)`,
        slot: { day, timeSlot }
      };
    }

    return {
      success: false,
      message: 'Lab assignment failed (unknown error)',
      slot: null
    };
  }

  /**
   * Smart assignment: Tries primary slot, finds alternative if needed
   * @returns {object} {success, slot}
   */
  async smartAssignTheoryClass(params) {
    const { professorId, subjectId, day, primarySlot, alternativeSlots = [] } = params;

    // Try primary slot
    let result = await this.assignTheoryClass({
      professorId,
      subjectId,
      day,
      timeSlot: primarySlot,
      duration: 60
    });

    if (result.success) {
      return result;
    }

    // Try alternatives
    for (const altSlot of alternativeSlots) {
      const { day: altDay, timeSlot: altTimeSlot } = altSlot;

      result = await this.assignTheoryClass({
        professorId,
        subjectId,
        day: altDay,
        timeSlot: altTimeSlot,
        duration: 60
      });

      if (result.success) {
        console.log(`✅ Used alternative slot: ${altDay} ${altTimeSlot}`);
        return result;
      }
    }

    console.warn(`⚠️  No slots available for Prof ${professorId}`);
    return {
      success: false,
      message: 'No available slots found',
      slot: null
    };
  }

  /**
   * Batch assignment with automatic backtracking
   * Assigns multiple subjects, rolls back if any fail
   */
  async assignSubjectBatch(assignments) {
    console.log(`\n📦 Starting batch assignment of ${assignments.length} subjects...`);

    const results = [];
    const initialStateDepth = this.engine.stateHistory.length;

    for (const assignment of assignments) {
      const result = await this.assignTheoryClass(assignment);
      results.push(result);

      if (!result.success) {
        console.warn(`❌ Batch assignment failed at: ${assignment.subjectId}`);
        console.log('🔄 Rolling back all assignments in this batch...');

        // Rollback to state before batch
        while (this.engine.stateHistory.length > initialStateDepth) {
          this.engine.restorePreviousState();
        }

        return {
          success: false,
          message: `Failed at subject ${assignment.subjectId}`,
          assigned: results.filter(r => r.success).length,
          total: assignments.length
        };
      }
    }

    console.log(`✅ Batch assignment successful! ${assignments.length} subjects assigned.`);
    return {
      success: true,
      message: 'All assignments successful',
      assigned: assignments.length,
      total: assignments.length
    };
  }

  /**
   * Load balancing: Distribute classes among professors
   * Returns list of recommended professor for each subject
   */
  suggestOptimalProfessorsForSubjects(subjects) {
    console.log('\n📊 Analyzing optimal professor assignments...\n');

    const suggestions = [];

    for (const subject of subjects) {
      const availableProfessors = [];

      // Get professors who can teach this subject (already assigned)
      const possibleProfs = subject.assignedProfessors || [];

      for (const profId of possibleProfs) {
        const classCount = this.engine.getProfessorClassCount(profId);
        const prof = this.professors.get(profId);
        const subjectCount = prof?.subjects?.length || 1;

        // Calculate load: classes assigned / subjects they teach
        const load = classCount / subjectCount;

        availableProfessors.push({
          professorId: profId,
          name: prof?.name || 'Unknown',
          classCount,
          subjectCount,
          load,
          available: true
        });
      }

      // Sort by load (ascending - assign to least busy first)
      availableProfessors.sort((a, b) => a.load - b.load);

      suggestions.push({
        subjectId: subject.subject_id,
        subjectName: subject.name,
        recommendedProfessor: availableProfessors[0] || null,
        alternatives: availableProfessors.slice(1)
      });
    }

    return suggestions;
  }

  /**
   * Export assignment summary
   */
  getSummaryReport() {
    const report = {
      totalAssignments: this.assignmentLog.length,
      theoryAssignments: this.assignmentLog.filter(a => a.type === 'THEORY').length,
      labAssignments: this.assignmentLog.filter(a => a.type === 'LAB').length,
      failedAttempts: this.failureLog.length,
      professorSchedules: {}
    };

    // Get schedule for each professor
    for (const [profId, prof] of this.professors.entries()) {
      const schedule = this.engine.getProfessorWeeklySchedule(profId);
      const classCount = this.engine.getProfessorClassCount(profId);

      report.professorSchedules[profId] = {
        name: prof.name,
        classCount,
        subjectsTeaching: prof.subjects?.length || 0,
        daysScheduled: Object.keys(schedule).filter(
          day => Object.keys(schedule[day]).length > 0
        ).length,
        weeklySchedule: schedule
      };
    }

    return report;
  }

  /**
   * Print human-readable summary
   */
  printSummary() {
    const report = this.getSummaryReport();

    console.log('\n\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('          📋 ASSIGNMENT SUMMARY REPORT');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`Total Assignments: ${report.totalAssignments}`);
    console.log(`  ├─ Theory Classes: ${report.theoryAssignments}`);
    console.log(`  └─ Lab Classes: ${report.labAssignments}`);
    console.log(`\nFailed Attempts: ${report.failedAttempts}`);

    console.log('\n👨‍🏫 PROFESSOR SCHEDULES:');
    console.log('─────────────────────────────────');

    for (const [profId, stats] of Object.entries(report.professorSchedules)) {
      console.log(`\n${stats.name} (${profId})`);
      console.log(`  Classes: ${stats.classCount}/${stats.subjectsTeaching}`);
      console.log(`  Days: ${stats.daysScheduled}/5`);

      for (const [day, schedule] of Object.entries(stats.weeklySchedule)) {
        const classes = Object.values(schedule).filter(c => c);
        if (classes.length > 0) {
          console.log(`    ${day}: ${classes.length} class(es)`);
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════\n');
  }

  /**
   * Reset all assignments
   */
  reset() {
    this.engine.reset();
    this.assignmentLog = [];
    this.failureLog = [];
    console.log('🔄 All assignments reset');
  }

  /**
   * Export detailed conflict report
   */
  getDetailedConflictReport() {
    return this.engine.getConflictReport() + '\n\nFailed Attempts:\n' +
      this.failureLog.map(f =>
        `  ❌ ${f.type}: ${f.professor} → ${f.subject} at ${f.requestedSlot}`
      ).join('\n');
  }
}

module.exports = SafeAssignmentManager;
