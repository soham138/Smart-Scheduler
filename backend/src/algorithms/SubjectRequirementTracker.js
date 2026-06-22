/**
 * Subject Requirement Tracker
 * Validates and tracks requirements for all subjects to ensure complete coverage
 * 
 * Handles:
 * - Theory hour requirements (lectures)
 * - Lab hour requirements (practicals)
 * - Subject-to-professor mapping
 * - Batch splitting for labs
 */

class SubjectRequirementTracker {
  constructor() {
    this.subjects = new Map(); // subject_id -> requirement object
    this.theoryRemaining = new Map(); // subject_id -> hours remaining
    this.labRemaining = new Map(); // subject_id -> hours remaining  
    this.scheduledSlots = new Map(); // subject_id -> [slot objects]
    this.failedRequirements = [];
  }

  /**
   * Initialize tracking for all subjects
   */
  initializeSubjects(subjects) {
    this.subjects.clear();
    this.theoryRemaining.clear();
    this.labRemaining.clear();
    this.scheduledSlots.clear();
    this.failedRequirements = [];

    for (const subject of subjects) {
      const subjectId = subject.subject_id;
      
      const theoryHours = this.getTheoryHours(subject);
      const labHours = this.getLabHours(subject);

      this.subjects.set(subjectId, {
        ...subject,
        theoryHoursRequired: theoryHours,
        labHoursRequired: labHours,
        totalHours: theoryHours + labHours
      });

      this.theoryRemaining.set(subjectId, theoryHours);
      this.labRemaining.set(subjectId, labHours);
      this.scheduledSlots.set(subjectId, []);
    }
  }

  /**
   * Calculate theory hours required per week
   */
  getTheoryHours(subject) {
    if (subject.type === 'LAB') return 0;
    
    let hours = subject.weekly_lecture_count || 0;
    
    // Fallback to credits-based if not specified
    if (hours === 0 && subject.credits) {
      hours = Math.ceil(subject.credits);
    }
    
    // Final fallback
    if (hours === 0) {
      hours = 2; // Minimum 2 hours/week
    }
    
    // Hardcap at 3 hours/week
    return Math.min(hours, 3);
  }

  /**
   * Calculate lab hours required per week
   */
  getLabHours(subject) {
    if (subject.type === 'THEORY') return 0;
    
    let hours = (subject.weekly_lab_count || 2) * 1; // Each lab = 2 hours, but track as 2
    
    // Labs: Typically 2 hours per session, max 2 sessions/week
    // So max 4 hours of lab per week
    return Math.min(hours, 4);
  }

  /**
   * Record that a theory slot was scheduled for subject
   */
  recordTheoryScheduled(subjectId, hours = 1) {
    if (!this.theoryRemaining.has(subjectId)) {
      console.warn(`[Tracker] Subject ${subjectId} not found in requirements`);
      return false;
    }

    const remaining = this.theoryRemaining.get(subjectId);
    if (remaining > 0) {
      this.theoryRemaining.set(subjectId, remaining - hours);
      this.scheduledSlots.get(subjectId).push({ type: 'THEORY', hours });
      return true;
    }
    return false;
  }

  /**
   * Record that a lab slot was scheduled for subject
   */
  recordLabScheduled(subjectId, hours = 2) {
    if (!this.labRemaining.has(subjectId)) {
      console.warn(`[Tracker] Subject ${subjectId} not found in requirements`);
      return false;
    }

    const remaining = this.labRemaining.get(subjectId);
    if (remaining > 0) {
      this.labRemaining.set(subjectId, remaining - hours);
      this.scheduledSlots.get(subjectId).push({ type: 'LAB', hours });
      return true;
    }
    return false;
  }

  /**
   * Check overall coverage status
   */
  validateCoverage() {
    const coverage = {
      complete: [],
      partial: [],
      missing: [],
      summary: ''
    };

    for (const [subjectId, subject] of this.subjects) {
      const theoryRemaining = this.theoryRemaining.get(subjectId);
      const labRemaining = this.labRemaining.get(subjectId);
      const totalRemaining = theoryRemaining + labRemaining;

      if (totalRemaining === 0) {
        coverage.complete.push(subject.code);
      } else if (totalRemaining < subject.totalHours) {
        coverage.partial.push({
          code: subject.code,
          scheduled: subject.totalHours - totalRemaining,
          required: subject.totalHours,
          percentage: Math.round(((subject.totalHours - totalRemaining) / subject.totalHours) * 100)
        });
      } else {
        coverage.missing.push({
          code: subject.code,
          theorMissing: theoryRemaining,
          labMissing: labRemaining
        });
      }
    }

    coverage.summary = `Complete: ${coverage.complete.length} | Partial: ${coverage.partial.length} | Missing: ${coverage.missing.length}`;
    return coverage;
  }

  /**
   * Get subjects that still need scheduling
   */
  getUnscheduledRequirements() {
    const unscheduled = [];

    for (const [subjectId, subject] of this.subjects) {
      const theoryRemaining = this.theoryRemaining.get(subjectId);
      const labRemaining = this.labRemaining.get(subjectId);

      if (theoryRemaining > 0) {
        unscheduled.push({
          subjectId,
          code: subject.code,
          type: 'THEORY',
          hoursRemaining: theoryRemaining,
          priority: subject.professor_id ? 'high' : 'medium' // Subjects with locked professors are high priority
        });
      }

      if (labRemaining > 0) {
        unscheduled.push({
          subjectId,
          code: subject.code,
          type: 'LAB',
          hoursRemaining: labRemaining,
          priority: 'critical' // Labs are critical
        });
      }
    }

    // Sort by priority
    return unscheduled.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Get coverage percentage for a specific subject
   */
  getSubjectCoverage(subjectId) {
    const subject = this.subjects.get(subjectId);
    if (!subject) return 0;

    const theoryRemaining = this.theoryRemaining.get(subjectId);
    const labRemaining = this.labRemaining.get(subjectId);
    const totalRemaining = theoryRemaining + labRemaining;

    const coverage = ((subject.totalHours - totalRemaining) / subject.totalHours) * 100;
    return Math.round(coverage);
  }

  /**
   * Get overall coverage percentage
   */
  getOverallCoverage() {
    let totalHours = 0;
    let scheduleHours = 0;

    for (const [subjectId, subject] of this.subjects) {
      totalHours += subject.totalHours;
      const theoryRemaining = this.theoryRemaining.get(subjectId);
      const labRemaining = this.labRemaining.get(subjectId);
      scheduleHours += subject.totalHours - (theoryRemaining + labRemaining);
    }

    if (totalHours === 0) return 100;
    return Math.round((scheduleHours / totalHours) * 100);
  }
}

module.exports = SubjectRequirementTracker;
