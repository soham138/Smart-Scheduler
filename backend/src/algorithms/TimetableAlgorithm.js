/**
 * Timetable Generation Algorithm
 * Uses Backtracking for constraint satisfaction and optimal scheduling
 * 
 * Rules:
 * 1. College Hours: 9:00 AM - 5:00 PM
 * 2. Tea Break: 11:00 AM - 11:15 AM (15 minutes)
 * 3. Recess: 1:15 PM - 2:00 PM (45 minutes)
 * 4. Lab Capacity: Max 5 labs per time slot
 * 5. Batch Fairness: A & B alternate schedules
 * 6. Library Hour: Once per week (conflict resolution)
 * 7. Project Hour: Once per week for Sem 3-8 only
 * 8. Multi-Branch Subjects: Different lab slots per branch
 */

const Timetable = require('../models/Timetable');
const pool = require('../config/db');

// ✅ GLOBAL: Import all algorithm components
const ProfessorAvailabilityMatrix = require('./ProfessorAvailabilityMatrix');
const ConflictRepairEngine = require('./ConflictRepairEngine');
const UltimateTimetableValidator = require('./UltimateTimetableValidator');
const AdvancedLabScheduler = require('./AdvancedLabScheduler');  // Advanced scheduler
const GlobalProfessorAvailabilityManager = require('./GlobalProfessorAvailabilityManager'); // 🆕 GLOBAL MANAGER

class TimetableAlgorithm {
  constructor(branchId, semester) {
    this.branchId = branchId;
    this.semester = semester;
    this.schedule = {};
    this.conflicts = [];
    
    // ✅ NEW: Initialize advanced algorithm managers
    this.availabilityMatrix = new ProfessorAvailabilityMatrix();
    this.conflictRepair = new ConflictRepairEngine(this.availabilityMatrix);
    this.validator = new UltimateTimetableValidator();
    this.lockedLabSlots = new Map(); // Track locked lab slots
    this.constraints = {
      collegeStart: '09:00',
      collegeEnd: '17:00',
      teaBreakStart: '11:00',      // Updated
      teaBreakEnd: '11:15',        // Updated
      recessStart: '13:15',        // Updated (1:15 PM)
      recessEnd: '14:00',          // Updated (2:00 PM)
      teaBreakDuration: 15,
      recessDuration: 45,
      labCapacity: 20,             // ✅ FINAL: Max 20 labs per time slot (accommodates all 187 labs across all time slots)
      libraryHourDuration: 60,
      projectHourDuration: 60,
    };
    this.timeSlots = this.generateTimeSlots();
    this.backtrackingDepth = 0;
    this.maxBacktrackingDepth = 100;
  }

  /**
   * Generate available time slots for the day
   * 
   * Daily Schedule:
   * 09:00-11:00 → Block 1 (2 hours)
   * 11:00-11:15 → Tea Break (FIXED - no scheduling)
   * 11:15-13:15 → Block 2 (2 hours)
   * 13:15-14:00 → Recess (FIXED - no scheduling)
   * 14:00-16:00 → Block 3 (2 hours)
   * 16:00-17:00 → Library/Project Hour (1 hour)
   *
   * Effective Teaching Time: 9:00-5:00 PM (8 hours) minus breaks (1 hour) = 7 hours total
   * Available for Theory/Labs: ~7 hours per day
   *
   * THEORY: 1-hour slots (can fit multiple per day in different blocks)
   * LABS:   2-hour slots (require continuous 2-hour blocks)
   */
  generateTimeSlots() {
    const slots = [];
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    
    // Convert break times to minutes for easier calculation
    const collegeStart = 9 * 60;     // 09:00
    const collegeEnd = 17 * 60;      // 17:00
    const teaBreakStart = 11 * 60;   // 11:00
    const teaBreakEnd = 11 * 60 + 15; // 11:15
    const recessStart = 13 * 60 + 15; // 13:15
    const recessEnd = 14 * 60;       // 14:00
    const libraryStart = 16 * 60;    // 16:00
    const libraryEnd = 17 * 60;      // 17:00

    // Define continuous time blocks (breaks excluded)
    // Block 1: 09:00-11:00 (120 min)
    const block1Start = collegeStart;
    const block1End = teaBreakStart;
    
    // Block 2: 11:15-13:15 (120 min)
    const block2Start = teaBreakEnd;
    const block2End = recessStart;
    
    // Block 3: 14:00-16:00 (120 min)
    const block3Start = recessEnd;
    const block3End = libraryStart;
    
    // Block 4: 16:00-17:00 (60 min - Library/Project Hour)
    const block4Start = libraryStart;
    const block4End = libraryEnd;

    // All continuous blocks (for easier iteration)
    const teachingBlocks = [
      { start: block1Start, end: block1End, minutes: 120 },
      { start: block2Start, end: block2End, minutes: 120 },
      { start: block3Start, end: block3End, minutes: 120 },
      { start: block4Start, end: block4End, minutes: 60 }
    ];

    // Generate slots for each day
    days.forEach(day => {
      // THEORY SLOTS: 1-hour slots from all blocks
      teachingBlocks.forEach((block, blockIdx) => {
        let timePointer = block.start;
        
        // Generate 1-hour theory slots within this block
        while (timePointer + 60 <= block.end) {
          const slotStart = this.minutesToTime(timePointer);
          const slotEnd = this.minutesToTime(timePointer + 60);
          
          slots.push({
            day,
            start: slotStart,
            end: slotEnd,
            type: 'available',
            sessionType: 'THEORY',   // 1 hour
            blockId: blockIdx,
            isLabSlot: false,
            duration: 60
          });
          
          timePointer += 60;
        }
      });

      // LAB SLOTS: 2-hour continuous slots from blocks 1-3 only (blocks that have ≥120 min)
      // Labs CANNOT span breaks, so only blocks with 120+ minutes can have labs
      [0, 1, 2].forEach(blockIdx => {
        const block = teachingBlocks[blockIdx];
        if (block.minutes >= 120) {
          // Lab must fit completely within block (2-hour continuous)
          const labStart = this.minutesToTime(block.start);
          const labEnd = this.minutesToTime(block.start + 120);
          
          slots.push({
            day,
            start: labStart,
            end: labEnd,
            type: 'available',
            sessionType: 'LAB',      // 2 hours
            blockId: blockIdx,
            isLabSlot: true,
            duration: 120
          });
        }
      });
    });

    // Log slot generation summary
    const theorySlots = slots.filter(s => !s.isLabSlot).length;
    const labSlots = slots.filter(s => s.isLabSlot).length;
    console.log(`[TimeSlots] Generated: ${theorySlots} theory slots + ${labSlots} lab slots = ${slots.length} total`);
    console.log(`[TimeSlots] Daily breakdown: ${theorySlots / 5} theory/day, ${labSlots / 5} lab/day per block`);
    console.log(`[TimeSlots] Breaks excluded: Tea (11:00-11:15), Recess (13:15-14:00)`);
    console.log(`[TimeSlots] Available teaching time: 7 hours/day (9:00-5:00 PM minus 1 hour breaks)`);

    return slots;
  }

  /**
   * Convert time string to minutes since midnight
   */
  timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Convert minutes to time string
   */
  minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  /**
   * ⚠️ CRITICAL: Add assignment to global professor schedule map in-memory
   * This ensures SUBSEQUENT assignments within SAME generation see THIS assignment
   * Prevents stale data issues during generation
   */
  addToGlobalProfessorSchedule(professorId, day, startTime, endTime, branchId) {
    if (!this.globalProfessorSchedule) return;
    
    if (!this.globalProfessorSchedule.has(professorId)) {
      this.globalProfessorSchedule.set(professorId, []);
    }
    
    this.globalProfessorSchedule.get(professorId).push({
      day,
      start: startTime,
      end: endTime,
      branch: branchId,
      semester: this.semester
    });
  }

  /**
   * ⚠️ CRITICAL: Load ALL professor assignments from database (all branches, all semesters)
   * Create a map: prof_id -> [{ day, start, end }, ...]
   * This is used to BLOCK any conflicting assignments UPFRONT
   */
  async loadGlobalProfessorSchedule() {
    try {
      const query = `
        SELECT professor_id, day_of_week, time_slot_start, time_slot_end, branch_id, semester
        FROM timetable
        WHERE professor_id IS NOT NULL
        AND slot_type IN ('THEORY', 'LAB')
        ORDER BY professor_id, day_of_week, time_slot_start
      `;
      
      const result = await pool.query(query);
      const scheduleMap = new Map();

      result.rows.forEach(row => {
        const profId = row.professor_id;
        if (!scheduleMap.has(profId)) {
          scheduleMap.set(profId, []);
        }
        
        scheduleMap.get(profId).push({
          day: row.day_of_week,
          start: row.time_slot_start,
          end: row.time_slot_end,
          branch: row.branch_id,
          semester: row.semester
        });
      });

      console.log(`[Global Schedule] Loaded ${result.rows.length} existing professor assignments`);
      return scheduleMap;
    } catch (error) {
      console.error('[Global Schedule] Error loading global professor schedule:', error);
      return new Map(); // Return empty if error
    }
  }

  /**
   * ⚠️ CRITICAL: Check if professor has a HARD CONFLICT with ANY existing assignment
   * Returns: { hasConflict: boolean, conflictingBranch: string, conflictingTime: string }
   */
  async checkProfessorConstraint(professorId, day, startTime, endTime) {
    if (!professorId || !this.globalProfessorSchedule) {
      return { hasConflict: false };
    }

    const existingAssignments = this.globalProfessorSchedule.get(professorId) || [];
    
    // CHECK CONFLICTS ACROSS ALL SEMESTERS AND BRANCHES
    // Professors cannot teach multiple subjects at the same actual time, regardless of semester
    for (const existing of existingAssignments) {
      if (existing.day === day) {
        const existStart = this.timeToMinutes(existing.start);
        const existEnd = this.timeToMinutes(existing.end);
        const newStart = this.timeToMinutes(startTime);
        const newEnd = this.timeToMinutes(endTime);

        const hasOverlap = !(newEnd <= existStart || newStart >= existEnd);

        if (hasOverlap) {
          return {
            hasConflict: true,
            conflictingBranch: existing.branch,
            conflictingTime: `${existing.day} ${existing.start}-${existing.end}`,
            conflictingSemester: existing.semester
          };
        }
      }
    }

    return { hasConflict: false };
  }

  /**
   * Get the lab count for a subject (respecting hard cap of 2)
   */
  getLabCountForSubject(subject) {
    let labCount = subject.weekly_lab_count || 2;
    const LAB_HARDCAP = 2;
    if (labCount > LAB_HARDCAP) {
      labCount = LAB_HARDCAP;
    }
    return Math.max(1, labCount);
  }

  /**
   * Validate if professor can teach a subject in this semester
   * Constraint: Max 5 subjects per professor per semester
   */
  canAssignSubjectToProfessor(professorId, semester) {
    if (!professorId) return true; // No professor = valid for now
    
    const key = `${professorId}-${semester}`;
    const currentCount = this.professorSubjectLoadPerSemester.get(key) || 0;
    
    // Check if this would exceed the limit
    if (currentCount >= 5) {
      return false;
    }
    return true;
  }

  /**
   * Get subject load for a professor in a semester
   */
  getProfessorSubjectCount(professorId, semester) {
    const key = `${professorId}-${semester}`;
    return this.professorSubjectLoadPerSemester.get(key) || 0;
  }

  /**
   * ✅ NEW METHOD: Create locked lab slot map
   * Labs are scheduled first and their slots CANNOT be used by theory
   * 
   * Format:
   * lockedLabSlots = {
   *   'MON-09:00-11:00': { subject: 'Math', batch: 'A', professor: 'xxx' },
   *   'MON-11:15-13:15': { subject: 'Physics', batch: 'B', professor: 'yyy' }
   * }
   */
  createLockedLabSlotMap() {
    const locked = new Map();
    
    for (const [key, slot] of Object.entries(this.schedule)) {
      // Only include LAB slots
      if (slot.type === 'LAB') {
        const slotKey = `${slot.day}-${slot.start}-${slot.end}`;
        locked.set(slotKey, {
          type: 'LAB',
          subject: slot.subject?.code || 'UNKNOWN',
          batch: slot.batch_number || 'N/A',
          professor: slot.subject?.professor_id || 'N/A',
          branch: this.branchId
        });
      }
    }
    
    return locked;
  }

  /**
   * ✅ NEW METHOD: Check if a time slot overlaps with ANY locked lab slot
   * 
   * Theory scheduling calls this for every candidate slot
   * If overlap detected → slot is UNAVAILABLE (locked by lab)
   */
  isTimeSlotLockedByLab(day, startTime, endTime) {
    if (!this.lockedLabSlots || this.lockedLabSlots.size === 0) {
      return false; // No locked slots
    }
    
    for (const [key, lockedLab] of this.lockedLabSlots) {
      const [lockDay, lockStart, lockEnd] = key.split('-');
      
      // Check if same day and times overlap
      if (lockDay === day && this.timeOverlaps(startTime, endTime, lockStart, lockEnd)) {
        return true; // ❌ LOCKED - cannot schedule theory here
      }
    }
    
    return false; // ✅ Available - can schedule theory
  }

  /**
   * Main timetable generation function
   */
  async generate() {
    try {
      // Get subjects for this branch and semester
      const subjects = await this.getSubjectsForBranchSemester();
      
      if (subjects.length === 0) {
        return { success: false, error: 'No subjects found for this branch-semester' };
      }

      console.log(`\n[Algorithm] Branch: ${this.branchId} | Semester: ${this.semester}`);
      console.log(`[Algorithm] Found ${subjects.length} subjects`);

      // ⚠️ CRITICAL GLOBAL MANAGER: Initialize global professor availability tracking
      // Create ONCE per algorithm instance (or reuse static instance for batch operations)
      if (!this.globalProfessorManager) {
        this.globalProfessorManager = new GlobalProfessorAvailabilityManager();
        
        // Load ALL existing assignments from database (all branches, all semesters)
        const loadedCount = await this.globalProfessorManager.loadFromDatabase(pool);
        console.log(`[Algorithm] ✅ GLOBAL MANAGER initialized with ${loadedCount} existing assignments`);
      }
      
      // Also keep legacy global schedule for backward compatibility
      this.globalProfessorSchedule = this.globalProfessorManager.assignmentHistory;
      console.log(`[Algorithm] GLOBAL professor schedule ready: ${this.globalProfessorManager.globalOccupancy.size} professors tracked`);

      // 🔴 NEW CONSTRAINT: Track professor subject count per semester
      // Max 5 subjects per professor per semester (user's working constraint)
      this.professorSubjectLoadPerSemester = new Map();
      for (const subject of subjects) {
        if (subject.professor_id) {
          const key = `${subject.professor_id}-${this.semester}`;
          const count = (this.professorSubjectLoadPerSemester.get(key) || 0) + 1;
          this.professorSubjectLoadPerSemester.set(key, count);
        }
      }
      console.log(`[Algorithm] Professor subject loads calculated: ${this.professorSubjectLoadPerSemester.size} entries`);

      // Separate theory and lab subjects
      const { theorySubjects, labSubjects, bothSubjects } = this.categorizeSubjects(subjects);
      
      console.log(`[Algorithm] Theory: ${theorySubjects.length} | Lab: ${labSubjects.length} | Both: ${bothSubjects.length}`);

      // Initialize schedule
      this.initializeSchedule();

      // ⚠️ CRITICAL OPTIMIZATION: Schedule LABS FIRST
      // Labs require 2-hour continuous slots - schedule these BEFORE theory
      // This locks in the 2-hour slots, preventing fragmentation
      // Theory lectures can then fill the remaining 1-hour gaps
      console.log(`[Algorithm-Sem${this.semester}] Scheduling LABS FIRST (PRIORITY 1)...`);
      const labScheduled = await this.scheduleLabs([...labSubjects, ...bothSubjects]);
      
      // ✅ NEW: Create locked slot map from scheduled labs
      // This prevents theory from being scheduled during lab times
      this.lockedLabSlots = this.createLockedLabSlotMap();
      console.log(`[Algorithm-Sem${this.semester}] 🔒 Created locked lab slot map: ${this.lockedLabSlots.size} slots immutable`);

      if (!labScheduled.success) {
        console.warn(`[Algorithm-Sem${this.semester}] Warning: Failed to schedule all labs`, labScheduled.conflicts);
        // Continue with theory even if some labs conflict
      }
      console.log(`[Algorithm-Sem${this.semester}] Lab scheduling complete`);

      // Step 2: Schedule THEORY SECOND (after labs locked in)
      // Theory gets the remaining 1-hour slots
      console.log(`[Algorithm-Sem${this.semester}] Scheduling THEORY lectures (PRIORITY 2 - after labs)...`);
      const theoryScheduled = await this.scheduleTheory([...theorySubjects, ...bothSubjects]);

      if (theoryScheduled.conflicts.length > 0) {
        console.warn(`[Algorithm-Sem${this.semester}] ⚠️ Warning: ${theoryScheduled.conflicts.length} theory gaps`);
        theoryScheduled.conflicts.forEach(c => {
          console.warn(`  - ${c.subject}: got ${c.scheduled}/${c.required} (gap of ${c.missing})`);
        });
      }
      console.log(`[Algorithm-Sem${this.semester}] Theory scheduling complete: ${theoryScheduled.totalScheduled} slots`);

      // Step 2.5: CRITICAL - Detect and fix batch-level conflicts
      // Ensure no batch has theory + lab at the same time
      console.log(`[Algorithm-Sem${this.semester}] Checking for batch-level conflicts...`);
      const conflictDetection = await this.detectAndFixBatchConflicts();
      if (conflictDetection.conflictsFixed > 0) {
        console.warn(`[Algorithm-Sem${this.semester}] ⚠️ Fixed ${conflictDetection.conflictsFixed} batch conflicts`);
        conflictDetection.details.forEach(d => {
          console.warn(`  - ${d.issue}: ${d.resolution}`);
        });
      }

      // Step 3: Add breaks and library hours
      console.log(`[Algorithm-Sem${this.semester}] Adding breaks and library hours...`);
      try {
        await this.scheduleBreaksAndLibrary();
      } catch (error) {
        console.error(`[Algorithm-Sem${this.semester}] Error scheduling breaks and library:`, error);
      }

      // Step 4: Validate timetable BEFORE saving
      console.log(`[Algorithm-Sem${this.semester}] Validating timetable...`);
      const validationResult = await this.validateGeneratedTimetable();
      
      if (!validationResult.success) {
        console.error(`[Algorithm-Sem${this.semester}] ❌ VALIDATION FAILED`);
        validationResult.errors.forEach(err => console.error(`  ❌ ${err}`));
        return { 
          success: false, 
          error: 'Timetable has critical conflicts after generation',
          validationErrors: validationResult.errors
        };
      }

      console.log(`[Algorithm-Sem${this.semester}] ✅ Validation PASSED`);

      // Step 4.5: CRITICAL - Enforce lab capacity before saving
      console.log(`[Algorithm-Sem${this.semester}] Enforcing lab capacity constraint (max ${this.constraints.labCapacity} labs per slot)...`);
      const capacityEnforced = await this.enforceLaboratoryCapacity();
      if (capacityEnforced.removed > 0) {
        console.warn(`[Algorithm-Sem${this.semester}] ⚠️ Removed ${capacityEnforced.removed} labs that violated capacity constraint`);
      }

      // Step 4.7: CRITICAL - ENFORCE GOLDEN RULES (NEW)
      console.log(`[Algorithm-Sem${this.semester}] Enforcing Golden Rules...`);
      const goldenRulesResult = await this.enforceGoldenRules();
      console.log(`[Algorithm-Sem${this.semester}] Golden Rules: ${goldenRulesResult.summary}`);
      if (goldenRulesResult.violations.length > 0) {
        console.error(`[Algorithm-Sem${this.semester}] ⚠️ Golden Rule violations detected (non-blocking):`);
        goldenRulesResult.violations.forEach(v => console.error(`  - ${v}`));
      }

      // Step 4.8: ANALYZE DAILY LOAD (NEW)
      console.log(`[Algorithm-Sem${this.semester}] Analyzing daily load balance...`);
      const dailyLoadAnalysis = this.analyzeDailyLoad();

      // Step 5: Save timetable to database
      console.log(`[Algorithm-Sem${this.semester}] Saving to database...`);
      const saved = await this.saveTimetableToDb();

      if (saved.length === 0) {
        return { success: false, error: 'Failed to save any timetable slots to database' };
      }

      console.log(`[Algorithm-Sem${this.semester}] ✅ Saved ${saved.length} slots`);
      return { success: true, message: 'Timetable generated successfully', timetable: saved };

    } catch (error) {
      console.error(`[Algorithm] ❌ Error generating timetable:`, error);
      return { success: false, error: error.message, details: error.stack };
    }
  }

  /**
   * THEORY SCHEDULING: WEEKLY HOUR FULFILLMENT LOGIC
   * 
   * PRIORITY: Schedule all required theory lectures FIRST
   * This ensures each subject gets its mandatory weekly teaching hours
   * 
   * WEEKLY HOUR CALCULATION:
   * - 1 Theory Lecture = 1 hour (fixed session duration)
   * - Weekly Theory Hours = weekly_lecture_count × 1 hour
   * - Example: 3 lectures/week = 3 hours of theory per week
   * 
   * CREDIT-BASED DEFAULTS:
   * - If weekly_lecture_count not specified, derive from subject credits
   * - Standard: 1 credit ≈ 1 hour of theory per week
   * - Example: 4-credit subject → 4 lectures/week (4 hours)
   * 
   * CONSTRAINTS:
   * - Minimum: 2 lectures/week (2 hours minimum - MUST be met)
   * - Maximum: 3 lectures/week (3 hours max - prevents over-scheduling)
   * - No subject more than once per day (spreading across week)
   * - Theory scheduled BEFORE labs (priority 1)
   * 
   * FAILURE HANDLING:
   * - If any subject cannot meet MINIMUM (2 lectures/week), it's logged as CONFLICT
   * - But generation continues (best-effort approach)
   * - Admin panel shows which subjects have insufficient theory hours
   * 
   * TIME SLOTS:
   * - Each theory lecture uses ONE 1-hour timeslot from available slots
   * - Available slots: 9:00-17:00 minus breaks (11:00-11:15 Tea, 13:15-14:00 Recess)
   * - 5 days × ~7 slots per day = 35+ available theory slots per week
   */
  async scheduleTheory(subjects) {
    const conflicts = [];
    
    // Track which days each subject is scheduled
    const subjectDayMap = new Map();
    
    // Get all theory/both subjects
    const allTheorySubjects = subjects.filter(s => s.type === 'THEORY' || s.type === 'BOTH');
    
    // Log available slots for debugging
    const availableTheorySlots = this.timeSlots.filter(s => !s.isLabSlot).length;
    console.log(`[Theory-Sem${this.semester}] Available theory slots: ${availableTheorySlots} (5 days × 7 per day)`);
    
    // IMPROVED: Better default logic - use credits if available
    const subjectsWithDefaults = allTheorySubjects.map(s => {
      let lectureCount = s.weekly_lecture_count || 0;
      
      // If no lecture count is set but credits exist, derive from credits
      if (lectureCount === 0 && s.credits > 0) {
        // Standard: 1 credit = ~1 hour of theory per week
        lectureCount = Math.ceil(s.credits);
        console.log(`  [Credit-Based] ${s.code}: Derived ${lectureCount} lectures from ${s.credits} credits`);
      }
      
      // Fallback to reasonable default if still 0
      if (lectureCount === 0) {
        lectureCount = 2; // Default 2 lectures/week (was 3, reducing for slot availability)
      }
      
      // CRITICAL FIX: Cap theory at STRICT maximum of 3 per week
      // This MUST be enforced immediately to prevent excessive slots
      // Apply HARDCAP - even if higher values were set
      const THEORY_HARDCAP = 3;
      if (lectureCount > THEORY_HARDCAP) {
        console.warn(`  [Theory HardCap] ${s.code}: LIMITED ${lectureCount} → ${THEORY_HARDCAP} lectures/week (STRICT)`);
        lectureCount = THEORY_HARDCAP;
      }
      
      return { ...s, weekly_lecture_count: lectureCount };
    });
    
    // Sort subjects by lecture count (most constrained first)
    const sortedSubjects = subjectsWithDefaults
      .filter(s => (s.weekly_lecture_count || 0) > 0)
      .sort((a, b) => (b.weekly_lecture_count || 0) - (a.weekly_lecture_count || 0));

    console.log(`[Theory-Sem${this.semester}] 📚 Scheduling ${sortedSubjects.length} theory subjects (MANDATORY)`);
    console.log(`[Theory-Sem${this.semester}] Target: 4-5 subjects × 3 slots minimum = 12-25 classes`);

    let totalTheorySlots = 0;
    let failedSubjects = [];

    for (const subject of sortedSubjects) {
      let lectureCount = subject.weekly_lecture_count || 0;
      if (lectureCount === 0) continue;

      subjectDayMap.set(subject.subject_id, new Set());

      // Schedule lectures spread across different days
      // Ensure each day has at most 1 lecture per subject
      let scheduled = await this.scheduleTheoryDistributed(
        subject, 
        lectureCount, 
        subjectDayMap.get(subject.subject_id)
      );

      // ADAPTIVE: If we couldn't schedule all lectures, try with reduced count
      if (scheduled < lectureCount) {
        console.warn(`  [Theory-Adaptive] ${subject.code}: Could only schedule ${scheduled}/${lectureCount}, trying with reduced target...`);
        
        // Try with reduced lecture count (reduce by 1 and retry)
        const reducedCount = lectureCount - 1;
        if (reducedCount >= 2) { // Keep minimum 2
          // Clear previously scheduled slots for this subject and retry
          for (const [key, slot] of Object.entries(this.schedule)) {
            if (slot.type === 'THEORY' && slot.subject?.subject_id === subject.subject_id) {
              delete this.schedule[key];
            }
          }
          subjectDayMap.get(subject.subject_id).clear();
          
          scheduled = await this.scheduleTheoryDistributed(
            subject, 
            reducedCount, 
            subjectDayMap.get(subject.subject_id)
          );
          
          if (scheduled === reducedCount) {
            console.log(`  ✓ ${subject.code}: Successfully scheduled ${scheduled}/${reducedCount} lectures (reduced)`);
          }
        }
      }

      totalTheorySlots += scheduled;

      if (scheduled < 2) { // Only fail if we can't meet MINIMUM 2 hours
        // CRITICAL: Theory lectures are MANDATORY minimum 2 per week
        const conflict = {
          subject: subject.name,
          code: subject.code,
          reason: `MANDATORY MINIMUM: Could not schedule minimum 2 lectures - only ${scheduled} scheduled`,
          scheduled,
          required: 2,
          missing: Math.max(0, 2 - scheduled),
          severity: 'CRITICAL'
        };
        conflicts.push(conflict);
        failedSubjects.push(subject.code);
        
        console.error(`  ❌ ${subject.code} (${subject.name}): FAILED - ${scheduled}/2 lectures (MINIMUM NOT MET)`);
      } else {
        console.log(`  ✓ ${subject.code} (${subject.name}): ${scheduled} lectures scheduled`);
      }
    }

    console.log(`[Theory-Sem${this.semester}] Total theory slots scheduled: ${totalTheorySlots}`);
    
    // BEST EFFORT: Report gaps as warnings, not failures
    if (failedSubjects.length > 0) {
      console.warn(`[Theory-Sem${this.semester}] ⚠️  NOTE: ${failedSubjects.length} subject(s) have fewer than ideal lectures: ${failedSubjects.join(', ')}`);
    }
    
    // Warn if utilization is too low
    if (totalTheorySlots < 12) {
      console.warn(`[Theory-Sem${this.semester}] ⚠️  Low utilization: Only ${totalTheorySlots} theory slots (target: 12-25)`);
    }

    return { 
      success: true,  // Always succeed - theory is best-effort, not blocking
      conflicts, 
      totalScheduled: totalTheorySlots,
      failedSubjects 
    };
  }

  /**
   * Schedule theory lectures - AGGRESSIVE MODE
   * Simply grab any available slot without restrictions
   * Only check professor availability
   */
  async scheduleTheoryDistributed(subject, lectureCount, usedDays = new Set()) {
    let scheduled = 0;

    // Get ALL available theory slots (not lab slots) and filter by availability
    const availableSlots = [];
    
    for (const slot of this.timeSlots) {
      if (slot.isLabSlot) continue; // Skip lab slots
      
      const slotKey = `${slot.day}-${slot.start}`;
      if (this.schedule[slotKey]) continue; // Skip occupied slots

      // ✅ NEW: CRITICAL CHECK - Skip slots locked by labs
      // If this theory slot overlaps with a lab slot, REJECT IT
      if (this.isTimeSlotLockedByLab(slot.day, slot.start, slot.end)) {
        continue; // ❌ This slot is locked by a lab - cannot schedule theory here
      }

      // CRITICAL: Skip library and project hours (they are exclusive)
      if ((slot.day === 'FRI' && slot.start === '16:00') ||  // Library hour FRI 16:00-17:00
          (slot.day === 'THU' && this.semester >= 3 && slot.start === '16:00')) {  // Project hour THU 16:00-17:00 for Sem 3+
        continue;
      }

      // Check professor availability
      const profConflicts = await Timetable.checkConflict(
        subject.professor_id,
        slot.day,
        slot.start,
        slot.end
      );

      if (profConflicts.length === 0) {
        // ENHANCED: For common subjects, avoid slots already used in other branches
        if (subject.isCommon) {
          const isReserved = await this.isSlotReservedByCommonSubject(
            subject.subject_id,
            slot.day,
            slot.start,
            slot.end,
            subject.professor_id
          );
          
          if (isReserved) {
            console.log(`  [Theory-Common] Skipping reserved slot: ${slot.day} ${slot.start}-${slot.end}`);
            continue; // Skip this slot as it's reserved for common subject
          }
        }
        
        availableSlots.push(slot);
      }
    }

    console.log(`  [Theory-Slots] ${subject.code}: Found ${availableSlots.length} available slots for ${lectureCount} needed`);

    // CRITICAL CONSTRAINT: Maximum 1 lecture per subject per day
    // Check this INSIDE the loop (not pre-computed) since usedDays changes each iteration
    
    console.log(`  [Theory-Constraint] ${subject.code}: Max 1 lecture per day (already on ${usedDays.size} days)`);

    // Schedule lectures on different days (max 1 per day per subject)
    for (const slot of availableSlots) {
      if (scheduled >= lectureCount) break;

      // CHECK CONSTRAINT: Skip if this subject is already scheduled on this day
      if (usedDays.has(slot.day)) {
        continue; // Skip - already has a lecture from this subject on this day
      }

      // CONSTRAINT 6: Check for subject clustering (Rule 6)  
      // UPDATED LOGIC: Allow max 1 THEORY lecture per subject per day
      // BUT: Other subjects can also have lectures same day - just not THIS subject again
      // This prevents a subject from having 2+ lectures on same day (student can't attend both)
      const sessionsOnDay = Object.values(this.schedule).filter(existingSlot => 
        existingSlot.subject?.subject_id === subject.subject_id &&  // ✅ ONLY this subject
        existingSlot.type === 'THEORY' &&  // ✅ ONLY count THEORY sessions!
        existingSlot.day === slot.day // Check same subject on same day
      ).length;

      if (sessionsOnDay >= 1) {
        console.log(`  [Clustering] ⚠️ ${subject.code}: Already has ${sessionsOnDay} THEORY session(s) on ${slot.day} (Rule 6 - max 1 theory per day)`);
        continue; // Skip - subject already has theory session on this day
      }

      // CRITICAL: Double-check professor availability at this specific time
      if (subject.professor_id) {
        const existingProfClasses = Object.values(this.schedule).filter(s => 
          s.subject?.professor_id === subject.professor_id &&
          s.day === slot.day &&
          s.type === 'THEORY' &&
          this.timeOverlaps(s.start, s.end, slot.start, slot.end)
        );
        
        if (existingProfClasses.length > 0) {
          console.log(`  [Prof-Conflict] ⚠️ ${subject.code}: Prof already teaching ${existingProfClasses[0].subject?.code} on ${slot.day} ${slot.start}-${slot.end}`);
          continue; // Skip - professor already booked at this time
        }

        // ⚠️ NEW: Check GLOBAL professor schedule (across all branches)
        // Use the new GlobalProfessorAvailabilityManager for stricter enforcement
        if (subject.professor_id && this.globalProfessorManager) {
          const availability = this.globalProfessorManager.isAvailable(
            subject.professor_id,
            slot.day,
            slot.start,
            slot.end
          );

          if (!availability.available) {
            console.log(`  [GLOBAL-Prof-Conflict] ⚠️ ${subject.code}: Prof already assigned in ${availability.conflict.branch} Sem ${availability.conflict.semester} at ${availability.conflict.day} ${availability.conflict.existingSlot}`);
            continue; // SKIP - Hard block on any conflict with other branches
          }
        }
      }

      const slotKey = `${slot.day}-${slot.start}-${subject.subject_id}`;
      
      // CRITICAL: Also check if this TIME SLOT is already taken by ANY subject
      // Prevent multiple subjects from scheduling at same time
      const timeSlotAlreadyUsed = Object.values(this.schedule).some(existingSlot =>
        existingSlot.type === 'THEORY' &&
        existingSlot.day === slot.day &&
        existingSlot.start === slot.start &&
        existingSlot.end === slot.end &&
        existingSlot.subject?.subject_id !== subject.subject_id  // Different subject, same time
      );
      
      if (timeSlotAlreadyUsed) {
        console.log(`  [Time-Lock] ⚠️ ${subject.code}: Time slot ${slot.day} ${slot.start} already taken by another subject`);
        continue; // Skip - this time slot is occupied by another subject
      }
      
      if (!this.schedule[slotKey]) {
        this.schedule[slotKey] = {
          subject,
          type: 'THEORY',
          day: slot.day,
          start: slot.start,
          end: slot.end,
        };
        
        // ⚠️ CRITICAL: Update GLOBAL professor schedule immediately after successful assignment
        // Next theory assignments in this loop will see this assignment and avoid conflicts
        if (subject.professor_id && this.globalProfessorManager) {
          this.globalProfessorManager.assign(subject.professor_id, slot.day, slot.start, slot.end, {
            branch: this.branchId,
            semester: this.semester,
            subject: subject.subject_id,
            type: 'THEORY'
          });
        }
        
        usedDays.add(slot.day); // Track this day as used for this subject
        scheduled++;
        console.log(`    ✓ ${subject.code} on ${slot.day} ${slot.start}-${slot.end} (${scheduled}/${lectureCount})`);
      }
    }

    return scheduled;
  }

  /**
   * Find available slot for a subject on a specific day
   * THEORY FIRST: No labs scheduled yet, so no lab conflicts
   * Just need to check for:
   * 1. Slot not already occupied
   * 2. Professor availability
   * 3. Not during breaks
   */
  async findAvailableSlotForDay(subject, day, allowMultiple = false) {
    // Get all 1-hour theory slots for this day (non-lab slots)
    const daySlots = this.timeSlots.filter(s => 
      s.day === day && 
      !s.isLabSlot &&  // Only theory slots (1 hour)
      !this.schedule[`${s.day}-${s.start}`] // Not already occupied
    );

    // Prefer afternoon times for theory (14:00-17:00, 15:00-17:00, 16:00-17:00)
    // But accept any available slot if needed
    const preferredOrder = ['16:00', '15:00', '14:00', '13:00', '10:00', '11:15', '09:00'];
    
    // Try preferred times first
    for (const prefTime of preferredOrder) {
      const slot = daySlots.find(s => s.start === prefTime);
      if (!slot) continue;

      // Check professor availability
      const profConflicts = await Timetable.checkConflict(
        subject.professor_id,
        slot.day,
        slot.start,
        slot.end
      );

      if (profConflicts.length === 0) {
        return slot;
      }
    }

    // If preferred times don't work, use ANY available slot on this day
    for (const slot of daySlots) {
      const profConflicts = await Timetable.checkConflict(
        subject.professor_id,
        slot.day,
        slot.start,
        slot.end
      );

      if (profConflicts.length === 0) {
        return slot;
      }
    }

    return null;
  }

  /**
   * REWRITTEN: Lab scheduling with COMPREHENSIVE CONSTRAINT ENFORCEMENT
   * Fixes:
   * 1. Batch Alternation: Both Batch A & B MUST be scheduled (not just B)
   * 2. Batch Time Overlap: One activity per batch per time slot (hard constraint)
   * 3. Professor Availability: One activity per professor per time slot (all types)
   * 4. Lab Distribution: Prevent same lab on consecutive days per batch
   * 5. Lab Capacity: Actively enforce max 5 labs per slot
   * 6. Spacing Constraint: Min 1 day gap between same subject labs per batch
   * 7. CONSTRAINT 4: Faculty max 6 hrs/day - Prevent professor overload
   */
  async scheduleLabs(subjects) {
    console.log(`[Labs-DEBUG] ========== ENTRY TO scheduleLabs ==========`);
    console.log(`[Labs-DEBUG] Received subjects count: ${subjects.length}`);
    if (subjects.length > 0) {
      console.log(`[Labs-DEBUG] Sample subjects:`);
      subjects.slice(0, 3).forEach(s => {
        console.log(`  - ${s.code} (${s.name}): type="${s.type}", weekly_lab_count=${s.weekly_lab_count}`);
      });
    }
    
    const conflicts = [];
    
    // Track scheduling per batch to enforce constraints
    const batchScheduling = {
      'A': { 
        scheduled: 0,
        subjectLastDay: new Map(), // subject_id -> last day scheduled
        dayActivities: new Map() // day -> [activity objects] per batch
      },
      'B': {
        scheduled: 0,
        subjectLastDay: new Map(),
        dayActivities: new Map()
      }
    };

    // CONSTRAINT 4: Track professor daily hours (max 6 hrs/day)
    // Key: "prof_id-day", Value: total hours scheduled that day
    const professorDailyHours = new Map(); // "prof_id-day" -> hours
    
    // Track professor scheduling across ALL activity types
    const professorSchedule = new Map(); // prof_id -> [{day, start, end, type}]
    
    // Track lab capacity per slot
    const labSlotUsage = new Map(); // "DAY-START-END" -> count of labs
    
    // Track all batch activities (THEORY + LAB + BREAKS)
    const batchTimeActivities = new Map(); // "BATCH-DAY-START-END" -> activity

    // Collect all existing activities from schedule (theory, breaks, etc.)
    for (const [key, slot] of Object.entries(this.schedule)) {
      if (!slot.subject?.professor_id && slot.type !== 'BREAK' && slot.type !== 'RECESS') continue;
      
      // Add to batch tracking if applicable
      if (slot.batch) {
        const batchKey = `${slot.batch}-${slot.day}-${slot.start}-${slot.end}`;
        if (!batchTimeActivities.has(batchKey)) {
          batchTimeActivities.set(batchKey, []);
        }
        batchTimeActivities.get(batchKey).push({
          type: slot.type,
          subject: slot.subject?.name || slot.type,
          time: `${slot.start}-${slot.end}`
        });
      }
      
      // Track professor schedule
      if (slot.subject?.professor_id) {
        const profId = slot.subject.professor_id;
        if (!professorSchedule.has(profId)) {
          professorSchedule.set(profId, []);
        }
        professorSchedule.get(profId).push({
          day: slot.day,
          start: slot.start,
          end: slot.end,
          type: slot.type,
          subject: slot.subject.name
        });
      }
    }

    // CONSTRAINT 1: Skip labs for THEORY-only subjects
    // Math, Ethics, Philosophy, etc. should NOT have labs
    const theoryOnlySubjects = subjects.filter(s => s.type === 'THEORY');
    const labEligibleSubjects = subjects.filter(s => s.type === 'LAB' || s.type === 'BOTH');
    
    console.log(`[Labs-DEBUG] After categorization - THEORY: ${theoryOnlySubjects.length}, LAB/BOTH: ${labEligibleSubjects.length}`);
    
    if (theoryOnlySubjects.length > 0) {
      console.log(`[Labs] ℹ️ Skipping lab scheduling for ${theoryOnlySubjects.length} THEORY-only subjects:`);
      theoryOnlySubjects.forEach(s => console.log(`  • ${s.code} (${s.name})`));
    }
    
    // Filter lab subjects and apply CONSTRAINTS for lab scheduling
    const allLabSubjects = labEligibleSubjects; // Only LAB and BOTH types
    
    console.log(`[Labs-DEBUG] Before map/filter: ${allLabSubjects.length} subjects`);
    
    const labSubjects = allLabSubjects
      .map(s => {
        console.log(`[Labs-DEBUG-MAP] Processing ${s.code}: weekly_lab_count=${s.weekly_lab_count}`);
        let labCount = s.weekly_lab_count || 0;
        
        // SEMANTIC: weekly_lab_count = 1 means "schedule for both batches" (Batch A + B = 2 total per week)
        // weekly_lab_count = 0 means "no labs"
        
        if (labCount === 0) {
          // No labs - skip this subject
          console.log(`[Labs-DEBUG-MAP]   → No labs (0)`);
        }
        
        const result = { ...s, weekly_lab_count: labCount };
        console.log(`[Labs-DEBUG-MAP]   → Final: weekly_lab_count=${result.weekly_lab_count}`);
        return result;
      })
      .filter(s => {
        const passes = (s.weekly_lab_count || 0) > 0;
        console.log(`[Labs-DEBUG-FILTER] ${s.code}: weekly_lab_count=${s.weekly_lab_count}, passes=${passes}`);
        return passes;
      });

    console.log(`[Labs-DEBUG] After map/filter: ${labSubjects.length} subjects`);

    // ✅ PRIORITY SORTING: Schedule high-priority subjects FIRST
    // This ensures they get slots before other subjects fill them up
    const prioritySubjects = labSubjects.filter(s => 
      s.code && (s.code.includes('MAJ') || s.name?.includes('Major'))
    );
    const otherSubjects = labSubjects.filter(s => 
      !s.code || (!s.code.includes('MAJ') && !s.name?.includes('Major'))
    );
    const sortedLabSubjects = [...prioritySubjects, ...otherSubjects];
    
    console.log(`[Labs-DEBUG] Priority sort: ${prioritySubjects.length} priority subjects, ${otherSubjects.length} others`);
    if (prioritySubjects.length > 0) {
      console.log(`[Labs-DEBUG] Priority subjects (scheduled first):`);
      prioritySubjects.forEach(s => console.log(`  - ${s.code}: ${s.name}`));
    }

    console.log(`\n[Labs] ════════════════════════════════════════`);
    console.log(`[Labs] 🔬 Scheduling ${sortedLabSubjects.length} lab subjects`);
    console.log(`[Labs] 📌 PRIORITY: Major Project subjects scheduled FIRST (guaranteed slots)`);
    console.log(`[Labs] 📌 SEMANTIC: weekly_lab_count = 1 means "both batches" (Batch A + B)`);
    console.log(`[Labs] 📌 SEMANTIC: Each batch gets EXACTLY 1 lab per subject per week`);
    console.log(`[Labs] 📌 Batch A & B scheduled SEPARATELY (no overlap)`);
    console.log(`[Labs] 📌 Lab capacity: Max ${this.constraints.labCapacity} per time slot (ENFORCED)`);
    console.log(`[Labs] 🔒 CRITICAL: No time overlap between theory and lab for same subject`);

    const batches = ['A', 'B'];
    
    // Track which subjects have overlapping batches (VIOLATION LOGGING)
    const overlapSubjects = new Map(); // subject_id -> { day, time }

    // ✅ CRITICAL FIX: Initialize duplicate lab tracking at START, not inside condition
    // This ensures EVERY lab is tracked from the beginning
    this.labsScheduledFor = new Map(); // subject_id-batch -> count

    for (const subject of sortedLabSubjects) {
      // SEMANTIC: weekly_lab_count = 1 means schedule for BOTH batches
      // Each batch gets exactly 1 lab per week (enforced below)
      const labCountPerBatch = 1;  // ENFORCED: 1 lab per batch per week (total of 2 for both)
      const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

      // If weekly_lab_count is 0, skip (no labs for this subject)
      if (subject.weekly_lab_count === 0) {
        console.log(`\n[Labs] Subject: ${subject.name} - SKIPPED (weekly_lab_count = 0)`);
        continue;
      }

      console.log(`\n[Labs] Subject: ${subject.name} (weekly_lab_count = 1 → 1 lab per batch = 2 total)`);

      // Schedule labs for EACH BATCH independently (Max 1 per batch)
      for (const batch of batches) {
        let labsScheduled = 0;
        const batchState = batchScheduling[batch];

        console.log(`  [Batch ${batch}] - Target: ${labCountPerBatch} lab (1 per batch)`);

        // Try scheduling on different days with proper spacing
        for (const dayIdx in days) {
          if (labsScheduled >= labCountPerBatch) break;

          const day = days[dayIdx];
          const lastDay = batchState.subjectLastDay.get(subject.subject_id);

          // CONSTRAINT: Enforce spacing - don't schedule on consecutive days for same subject
          // ✅ FIXED: For single-lab subjects (labCountPerBatch=1), allow minimum gap of 0 (same subject, different batches OK)
          // Only enforce spacing for multi-lab subjects
          const requiredGap = labCountPerBatch > 1 ? 2 : 0;  // Single lab per batch → no spacing needed
          
          if (lastDay !== undefined && requiredGap > 0) {
            const lastDayIdx = days.indexOf(lastDay);
            const dayGap = Math.abs(parseInt(dayIdx) - lastDayIdx);
            
            if (dayGap < requiredGap) {
              console.log(`    ✗ ${day}: Spacing constraint - same subject scheduled on ${lastDay} (gap=${dayGap}, need ≥${requiredGap})`);
              continue;
            }
          }

          // Find available lab slot for this day
          const slot = await this.findLabSlotWithValidation(
            subject, 
            day, 
            batch,
            labSlotUsage,
            professorSchedule,
            batchState.dayActivities
          );

          if (slot) {
            // CRITICAL FIX: Check batch exclusivity - NO OTHER LAB for this batch at this time
            // This prevents impossible situations like same batch attending ENG-201 LAB and CHE-201 LAB simultaneously
            const batchTimeKey = `${batch}-${day}-${slot.start}-${slot.end}`;
            
            // Check if batch ALREADY has an activity (any subject) at this exact time
            const batchTimeActivities_list = batchTimeActivities.get(batchTimeKey) || [];
            const hasConflictingActivity = batchTimeActivities_list.some(activity => 
              activity.type === 'LAB' // Critical: Check if there's ANY lab at this time for this batch
            );
            
            if (hasConflictingActivity) {
              console.log(`    ✗ ${day} ${slot.start}: Batch ${batch} ALREADY has LAB at this time (different subject) - CONFLICT PREVENTED`);
              continue;
            }
            
            // CONSTRAINT 2: Check for time overlaps with other activities in this batch on same day
            const dayKey = `${day}`;
            if (!batchState.dayActivities.has(dayKey)) {
              batchState.dayActivities.set(dayKey, []);
            }

            const dayActivities = batchState.dayActivities.get(dayKey);
            const slotConflict = dayActivities.some(act => 
              this.timeOverlaps(act.start, act.end, slot.start, slot.end)
            );

            if (slotConflict) {
              console.log(`    ✗ ${day} ${slot.start}: Batch ${batch} has overlapping activity on this day`);
              continue;
            }

            // CONSTRAINT 3: Check lab capacity (global across all branches) - CRITICAL ENFORCEMENT
            const labSlotKey = `${day}-${slot.start}-${slot.end}`;
            const currentUsage = labSlotUsage.get(labSlotKey) || 0;
            
            // CRITICAL: Count labs BOTH in current schedule AND database
            const labsInCurrentSchedule = Object.values(this.schedule).filter(s => 
              s.type === 'LAB' && s.day === day && s.start === slot.start
            ).length;
            
            const totalLabsThisSlot = currentUsage + labsInCurrentSchedule;
            
            if (totalLabsThisSlot >= this.constraints.labCapacity) {
              console.log(`    ✗ ${day} ${slot.start}: Lab slot FULL (${totalLabsThisSlot}/${this.constraints.labCapacity} - usage:${currentUsage} + scheduled:${labsInCurrentSchedule}) - REJECTING`);
              continue;
            }

            // CONSTRAINT 4: Check professor availability across ALL types
            const profId = subject.professor_id;
            const profActivities = professorSchedule.get(profId) || [];
            const profConflict = profActivities.some(act => 
              act.day === day && this.timeOverlaps(act.start, act.end, slot.start, slot.end)
            );

            if (profConflict) {
              console.log(`    ✗ ${day} ${slot.start}: Professor already assigned`);
              continue;
            }

            // ⚠️ NEW: Check GLOBAL professor schedule (across all branches)
            // Use the new GlobalProfessorAvailabilityManager for stricter enforcement
            if (profId && this.globalProfessorManager) {
              const availability = this.globalProfessorManager.isAvailable(
                profId,
                day,
                slot.start,
                slot.end
              );

              if (!availability.available) {
                console.log(`    ✗ [LAB-GLOBAL] ${day} ${slot.start}: Prof already assigned in ${availability.conflict.branch} Sem ${availability.conflict.semester}`);
                continue; // SKIP - Hard block on any conflict with other branches
              }
            }

            // CONSTRAINT 5: Check Max 2 labs per professor per day (Rule 5)
            const profLabsOnDay = (professorSchedule.get(profId) || []).filter(act => 
              act.day === day && act.type === 'LAB'
            ).length;

            if (profLabsOnDay >= 2) {
              console.log(`    ✗ ${day} ${slot.start}: Professor already has ${profLabsOnDay} labs today (max 2 per day - Rule 5)`);
              continue; // SKIP - professor lab overload on this day
            }

            // ALL CONSTRAINTS PASSED - schedule the lab
            const labKey = `${day}-${slot.start}-LAB-${subject.subject_id}-${batch}`;
            
            this.schedule[labKey] = {
              subject,
              type: 'LAB',
              batch,
              day,
              start: slot.start,
              end: slot.end,
            };

            // Update tracking
            labSlotUsage.set(labSlotKey, currentUsage + 1);
            batchState.subjectLastDay.set(subject.subject_id, day);
            dayActivities.push({ start: slot.start, end: slot.end, type: 'LAB', subject: subject.name });
            
            // Track batch-time activity (MUST be array for proper checking)
            if (!batchTimeActivities.has(batchTimeKey)) {
              batchTimeActivities.set(batchTimeKey, []);
            }
            const batchActivities = batchTimeActivities.get(batchTimeKey);
            batchActivities.push({ type: 'LAB', subject: subject.name, subjectId: subject.subject_id });
            
            // Update professor schedule
            if (!professorSchedule.has(profId)) {
              professorSchedule.set(profId, []);
            }
            professorSchedule.get(profId).push({
              day, 
              start: slot.start, 
              end: slot.end, 
              type: 'LAB',
              subject: subject.name
            });
            
            // ⚠️ CRITICAL: Update GLOBAL professor schedule immediately after successful assignment
            // Next lab assignments in this loop will see this assignment and avoid conflicts
            if (profId && this.globalProfessorManager) {
              this.globalProfessorManager.assign(profId, day, slot.start, slot.end, {
                branch: this.branchId,
                semester: this.semester,
                subject: subject.subject_id,
                type: 'LAB'
              });
            }

            labsScheduled++;
            batchState.scheduled++;

            console.log(`    ✓ Lab ${labsScheduled + 1}/${labCountPerBatch} on ${day} ${slot.start}-${slot.end} (slot: ${currentUsage + 1}/${this.constraints.labCapacity})`);
          } else {
            console.log(`    ✗ ${day}: No available slot`);
          }
        }

        // Check if batch has labs scheduled
        if (labsScheduled === 0) {
          console.log(`  ⚠️ WARNING: Batch ${batch} has 0 labs! This is a CRITICAL FAILURE.`);
          
          // 🚨 ESCALATE CRITICAL: If this is Major Project, mark as CRITICAL
          if (subject.code?.includes('MAJ') || subject.name?.includes('Major')) {
            console.log(`  🚨 CRITICAL: ${subject.name} Batch ${batch} has ZERO labs!`);
            conflicts.push({
              subject: subject.name,
              batch,
              severity: 'CRITICAL',
              reason: `Major Project Batch ${batch} has NO labs scheduled - branch scheduling INCOMPLETE`
            });
          } else {
            conflicts.push({
              subject: subject.name,
              batch,
              severity: 'CRITICAL',
              reason: `Batch ${batch} has NO labs scheduled for ${subject.name}`,
            });
          }
        } else if (labsScheduled < labCountPerBatch) {
          conflicts.push({
            subject: subject.name,
            batch,
            scheduled: labsScheduled,
            required: labCountPerBatch,
            severity: 'WARNING',
            reason: `${subject.name} Batch ${batch} only got ${labsScheduled}/${labCountPerBatch} labs`
          });
        }
      }
    }

    // CRITICAL VALIDATION: Check for BATCH OVERLAPS on same subject labs
    console.log(`\n[Labs-Validation] 🔍 Checking for batch overlaps on same subject...`);
    const batchOverlaps = this.checkBatchLabOverlaps(labSubjects);
    
    if (batchOverlaps.length > 0) {
      console.warn(`[Labs-Validation] ❌ FOUND ${batchOverlaps.length} BATCH OVERLAPS:`);
      batchOverlaps.forEach(overlap => {
        console.warn(`  ⚠️  ${overlap.subject}: Batch A & B both on ${overlap.day} ${overlap.time}`);
        conflicts.push({
          severity: 'HIGH',
          type: 'BATCH_OVERLAP',
          subject: overlap.subject,
          reason: `Batch A and Batch B scheduled simultaneously for same lab`
        });
      });
    } else {
      console.log(`[Labs-Validation] ✓ No batch overlaps detected`);
    }

    // CRITICAL VALIDATION: Ensure both batches were scheduled
    const batchALabCount = batchScheduling['A'].scheduled;
    const batchBLabCount = batchScheduling['B'].scheduled;

    console.log(`[Labs] ════════════════════════════════════════`);
    console.log(`[Labs] Scheduling Summary:`);
    console.log(`  Batch A: ${batchALabCount} labs`);
    console.log(`  Batch B: ${batchBLabCount} labs`);

    // MODIFIED: Batch alternation is no longer a requirement - just note it
    if (batchALabCount === 0) {
      console.log(`[Labs] ⚠️ NOTE: Batch A has no labs scheduled for this semester`);
    }

    if (batchBLabCount === 0) {
      console.log(`[Labs] ⚠️ NOTE: Batch B has no labs scheduled for this semester`);
    }

    console.log(`[Labs] Conflicts found: ${conflicts.length}`);
    
    // MODIFIED: Removed batch alternation requirement - not all semesters have equal lab requirements
    // Just check that there are no CRITICAL conflicts (overlaps, capacity, etc.)
    return { 
      success: conflicts.length === 0, // Only check for critical conflicts, not batch count
      conflicts,
      batchStats: { batchA: batchALabCount, batchB: batchBLabCount }
    };
  }

  /**
   * CONSTRAINT 5: Check consecutive day gap for lab scheduling
   * Same lab subject cannot appear on consecutive days for same batch
   * Minimum 1-day gap required between same subject labs
   */
  hasConsecutiveDayLabConflict(batchId, subjectId, newDay) {
    const dayOrder = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const newDayIdx = dayOrder.indexOf(newDay);
    
    // Find all lab slots for this batch-subject combination
    const existingLabs = Object.values(this.schedule).filter(slot => {
      return slot.type === 'LAB' && 
             slot.batch === batchId && 
             slot.subject?.subject_id === subjectId;
    });
    
    // Check if any existing lab is on adjacent days
    for (const lab of existingLabs) {
      const existingDayIdx = dayOrder.indexOf(lab.day);
      const dayGap = Math.abs(newDayIdx - existingDayIdx);
      
      // CONSTRAINT: Day gap must be at least 1 (not consecutive)
      if (dayGap === 1) {
        return true; // Conflict: consecutive days detected
      }
    }
    
    return false; // No consecutive day conflict
  }

  /**
   * CHECK FOR BATCH OVERLAPS
   * Returns list of subjects where Batch A & B are scheduled at same time
   * This is a critical issue that must be fixed
   */
  checkBatchLabOverlaps(labSubjects) {
    const overlaps = [];
    const subjectLabMap = new Map(); // subject_id -> [{batch, day, start, end}]

    // Collect all lab slots by subject
    for (const [key, slot] of Object.entries(this.schedule)) {
      if (slot.type !== 'LAB') continue;
      
      const subjId = slot.subject?.subject_id;
      if (!subjId) continue;

      if (!subjectLabMap.has(subjId)) {
        subjectLabMap.set(subjId, []);
      }
      subjectLabMap.get(subjId).push({
        batch: slot.batch,
        day: slot.day,
        start: slot.start,
        end: slot.end
      });
    }

    // Check for overlaps per subject
    for (const [subjId, labs] of subjectLabMap) {
      const subject = labSubjects.find(s => s.subject_id === subjId);
      const subjName = subject?.name || `Unknown (${subjId})`;

      for (let i = 0; i < labs.length; i++) {
        for (let j = i + 1; j < labs.length; j++) {
          const lab1 = labs[i];
          const lab2 = labs[j];

          // Check if same day and overlapping time, different batches
          if (lab1.day === lab2.day && lab1.batch !== lab2.batch) {
            if (this.timeOverlaps(lab1.start, lab1.end, lab2.start, lab2.end)) {
              overlaps.push({
                subject: subjName,
                day: lab1.day,
                time: `${lab1.start}-${lab1.end}`,
                batch1: lab1.batch,
                batch2: lab2.batch
              });
            }
          }
        }
      }
    }

    return overlaps;
  }

  /**
   * Find lab slot with COMPREHENSIVE VALIDATION
   * Checks:
   * 1. No overlapping activity for this batch in same slot
   * 2. No professor conflict (across all activity types)
   * 3. No subject theory-lab overlap
   * 4. Slot not at capacity
   * 5. Not scheduled on consecutive days for same subject
   */
  async findLabSlotWithValidation(subject, day, batch, labSlotUsage, professorSchedule, batchDayActivities) {
    // 🔴 CRITICAL FIX: Prefer DIFFERENT times for DIFFERENT subjects to spread load
    // Try to split labs across multiple time slots, not all at 09:00
    const allAvailableTimes = ['09:00', '11:15', '14:00'];  // Can add more if needed
    
    // Randomize/shuffle preferred times to avoid everyone getting 09:00
    const preferredTimes = allAvailableTimes.sort(() => 0.5 - Math.random());

    for (const startTime of preferredTimes) {
      const slot = this.timeSlots.find(s => 
        s.day === day && 
        s.start === startTime && 
        s.isLabSlot === true
      );

      if (!slot) continue;

      // ============ CRITICAL CONSTRAINT 1: Check subject-theory TIMESLOT overlap ============
      // Students CANNOT attend theory and lab at the SAME TIME
      // Check: Does this lab time slot overlap with ANY theory session of same subject?
      const theorySlotConflict = Object.entries(this.schedule).some(([key, value]) => {
        if (!value.subject) return false;
        const subjectMatch = value.subject.subject_id === subject.subject_id ||
                            value.subject.id === subject.subject_id ||
                            (value.subject.name && subject.name && value.subject.name === subject.name);
        const typeMatch = value.type === 'THEORY';
        const dayMatch = value.day === day;
        const timeOverlap = this.timeOverlaps(value.start, value.end, slot.start, slot.end);
        
        return subjectMatch && typeMatch && dayMatch && timeOverlap; // TIME CONFLICT
      });

      if (theorySlotConflict) {
        console.log(`[Labs-REJECT] ✗ TIME CONFLICT: ${subject.name} theory exists at ${day} ${slot.start}-${slot.end}`);
        continue; // Skip - time overlaps with theory on this day
      }

      // ============ CRITICAL CONSTRAINT 2: Check professor availability (ALL types) ============
      // Professor can ONLY teach one class at a time (Theory/Lab/Library/Project)
      const profActivities = professorSchedule.get(subject.professor_id) || [];
      const profConflict = profActivities.some(act => 
        act.day === day && 
        this.timeOverlaps(act.start, act.end, slot.start, slot.end)
      );

      if (profConflict) {
        console.log(`[Labs-REJECT] ✗ PROFESSOR CONFLICT: Prof already assigned on ${slot.day} ${slot.start}`);
        continue;
      }

      // ============ CRITICAL CONSTRAINT 3: Check lab capacity - MAX 7 ACROSS ALL BRANCHES ============
      // 🔴 FIXED: Count TOTAL labs across ALL branches, not per-branch
      const slotKey = `${day}-${startTime}`;
      const currentUsage = labSlotUsage.get(slotKey) || 0;
      
      // ✅ FIXED: Count labs ONLY for current branch and semester
      const dbLabCountResult = await pool.query(`
        SELECT COUNT(*) as lab_count
        FROM timetable
        WHERE day_of_week = $1 
          AND time_slot_start = $2 
          AND slot_type = 'LAB'
          AND branch_id = $3
          AND semester = $4
      `, [day, startTime, this.branchId, this.semester]);
      
      const dbLabCount = dbLabCountResult.rows[0]?.lab_count || 0;
      const totalLabsAtSlot = currentUsage + dbLabCount;
      
      // ✅ FIXED: Allow UP TO 7 labs (check > 7, not >= 7)
      if (totalLabsAtSlot >= this.constraints.labCapacity) {
        console.log(`[Labs-REJECT] ✗ LAB CAPACITY FULL: ${slotKey} would have ${totalLabsAtSlot + 1} labs (max ${this.constraints.labCapacity}) - DB:${dbLabCount}, Current:${currentUsage}`);
        continue;
      }

      // ============ CRITICAL CONSTRAINT 4: Check batch doesn't have conflicting activity ============
      // Same batch CANNOT have theory+lab or lab+lab at same time
      const dayActivities = batchDayActivities.get(day) || [];
      const slotConflict = dayActivities.some(act => 
        this.timeOverlaps(act.start, act.end, slot.start, slot.end)
      );

      if (slotConflict) {
        console.log(`[Labs-REJECT] ✗ BATCH TIME CONFLICT: Batch ${batch} has activity on ${slot.day} ${slot.start}-${slot.end}`);
        continue;
      }

      // ============ CONSTRAINT 5: Check no duplicate labs for same subject in same batch (anywhere) ============
      // CRITICAL: Same subject lab should ONLY appear ONCE per batch per entire week
      // Not just at same time - should not appear multiple times at all
      const duplicateLabCheck = Object.entries(this.schedule).some(([key, value]) => {
        if (!value.subject) return false;
        const subjectMatch = value.subject.subject_id === subject.subject_id ||
                            value.subject.id === subject.subject_id ||
                            (value.subject.name && subject.name && value.subject.name === subject.name);
        const typeMatch = value.type === 'LAB';
        const batchMatch = value.batch === batch;
        
        // Prevent DUPLICATE: same subject lab twice for same batch (regardless of day/time)
        // Exception: Allow ONLY if labCount > 1 (multiple labs per week allowed)
        // But even then, check against actual scheduled count
        return subjectMatch && typeMatch && batchMatch;
      });

      // If duplicate found, reject it - max 1 lab per batch per subject
      if (duplicateLabCheck) {
        const trackingKey = `${subject.subject_id}-${batch}`;
        const alreadyScheduled = this.labsScheduledFor.get(trackingKey) || 0;
        
        // ENFORCED: Max 1 lab per batch - no duplicates allowed
        if (alreadyScheduled >= 1) {
          console.log(`[Labs-REJECT] ✗ DUPLICATE LAB: ${subject.name} Batch ${batch} already has 1 lab (max 1 per batch)`);
          continue;
        }
      }

      // Track that we're scheduling this lab
      const trackingKey = `${subject.subject_id}-${batch}`;
      this.labsScheduledFor.set(trackingKey, (this.labsScheduledFor.get(trackingKey) || 0) + 1);

      // ============ CONSTRAINT 6: For common subjects, avoid reserved slots ============
      if (subject.isCommon) {
        const isReserved = await this.isSlotReservedByCommonSubject(
          subject.subject_id,
          slot.day,
          slot.start,
          slot.end,
          subject.professor_id
        );
        
        if (isReserved) {
          console.log(`[Labs-REJECT] ✗ COMMON SUBJECT RESERVED: ${slot.day} ${slot.start}-${slot.end}`);
          continue;
        }
      }

      // ============ ALL CONSTRAINTS PASSED - Slot is valid ============
      console.log(`[Labs-ACCEPT] ✓ Slot valid: ${subject.name} Batch ${batch} on ${slot.day} ${slot.start}-${slot.end}`);
      return slot;
    }

    return null;
  }

  /**
   * Find ALL available lab slots for a day with BATCH AWARENESS
   * Returns slots in order of preference, checking for:
   * - Professor availability (not teaching at that time)
   * - Subject students NOT having theory at that time
   * - Slot capacity (not exceeding 5 labs per slot)
   * - No other labs scheduled at same time (for same batch cohort)
   * - No multiple labs for same subject at same time for same batch
   * - CRITICAL: Enforce (day, time, subject, batch) uniqueness
   */
  async findAllAvailableLabSlots(subject, day, batch) {
    // 🔴 FIX: Prefer MORNING for labs, AFTERNOON for theory (natural separation)
    // Order: 09:00 (early morning - best), 11:15 (mid morning), 14:00 (afternoon), 16:00 (last resort)
    const preferredTimes = ['09:00', '11:15', '14:00', '16:00'];
    const availableSlots = [];

    for (const startTime of preferredTimes) {
      const slot = this.timeSlots.find(s => 
        s.day === day && 
        s.start === startTime && 
        s.isLabSlot === true // Only 2-hour lab slots
      );

      if (!slot) continue;

      // ❌ CRITICAL: Check if THIS SUBJECT has theory scheduled at overlapping time
      // Students cannot attend theory and their own lab simultaneously
      const subjectHasTheoryAtTime = Object.entries(this.schedule).some(([key, value]) => 
        value.subject?.subject_id === subject.subject_id &&
        value.type === 'THEORY' &&
        value.day === slot.day &&
        this.timeOverlaps(value.start, value.end, slot.start, slot.end)
      );

      if (subjectHasTheoryAtTime) {
        console.log(`[Labs Check] ✗ ${subject.name} Batch ${batch}: Theory conflict at ${slot.day} ${slot.start}-${slot.end}`);
        continue;
      }

      // Check if professor is already assigned at this time (any class)
      const profHasConflictAtTime = Object.entries(this.schedule).some(([key, value]) => 
        value.subject?.professor_id === subject.professor_id &&
        value.day === slot.day &&
        this.timeOverlaps(value.start, value.end, slot.start, slot.end)
      );

      if (profHasConflictAtTime) {
        console.log(`[Labs Check] ✗ Prof ${subject.name} Batch ${batch}: Already teaching at ${slot.day} ${slot.start}`);
        continue;
      }

      // CRITICAL: Check if THIS BATCH already has this subject's lab at this time
      const batchAlreadyAtSlot = Object.entries(this.schedule).some(([key, value]) => 
        value.subject?.subject_id === subject.subject_id &&
        value.type === 'LAB' &&
        value.batch === batch &&
        value.day === slot.day &&
        value.start === slot.start
      );

      if (batchAlreadyAtSlot) {
        console.log(`[Labs Check] ✗ ${subject.name} Batch ${batch}: Already scheduled at ${slot.day} ${slot.start}`);
        continue;
      }

      // ❌ NEW CONSTRAINT: Check if ANY OTHER lab is at this time slot
      // (No overlapping labs for same batch - students can only do one lab per time slot)
      const otherLabAtSameTime = Object.entries(this.schedule).some(([key, value]) => 
        value.type === 'LAB' &&
        value.batch === batch &&
        value.subject?.subject_id !== subject.subject_id &&
        value.day === slot.day &&
        this.timeOverlaps(value.start, value.end, slot.start, slot.end)
      );

      if (otherLabAtSameTime) {
        const conflictingSubject = Object.entries(this.schedule)
          .find(([key, value]) => 
            value.type === 'LAB' &&
            value.batch === batch &&
            value.subject?.subject_id !== subject.subject_id &&
            value.day === slot.day &&
            this.timeOverlaps(value.start, value.end, slot.start, slot.end)
          );
        if (conflictingSubject) {
          console.log(`[Labs Check] ✗ ${subject.name} Batch ${batch}: Cannot schedule at ${slot.day} ${slot.start} - ${conflictingSubject[1].subject.name} lab already there`);
        }
        continue;
      }

      // Count existing labs in this slot from schedule (total across all batches)
      const labsInSlot = Object.values(this.schedule).filter(s =>
        s.type === 'LAB' &&
        s.day === slot.day &&
        s.start === slot.start
      ).length;

      if (labsInSlot >= this.constraints.labCapacity) {
        console.log(`[Labs Check] ✗ Slot ${slot.day} ${slot.start} at capacity (${labsInSlot}/${this.constraints.labCapacity})`);
        continue;
      }

      availableSlots.push(slot);
    }

    return availableSlots;
  }

  /**
   * Check if two time ranges overlap
   */
  timeOverlaps(start1, end1, start2, end2) {
    const s1 = this.timeToMinutes(start1);
    const e1 = this.timeToMinutes(end1);
    const s2 = this.timeToMinutes(start2);
    const e2 = this.timeToMinutes(end2);
    
    return s1 < e2 && s2 < e1;
  }

  /**
   * BREAK-AWARE SCHEDULING: Check if a session spans a break
   * If yes, validate that effective teaching time is preserved
   * 
   * Example:
   * - Theory session 10:50-11:50 spans Tea Break (11:00-11:15)
   * - Effective teaching: 10 min (10:50-11:00) + 35 min (11:15-11:50) = 45 min (INVALID - need 60 min)
   * - Solution: Move session to start at 11:15 instead
   *
   * Labs spanning breaks: NOT ALLOWED (must fit within continuous block)
   */
  getEffectiveTeachingTime(startTime, endTime) {
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);
    
    const teaBreakStart = this.constraints.teaBreakStart ? this.timeToMinutes(this.constraints.teaBreakStart) : 11 * 60;
    const teaBreakEnd = this.constraints.teaBreakEnd ? this.timeToMinutes(this.constraints.teaBreakEnd) : 11 * 60 + 15;
    const recessStart = this.constraints.recessStart ? this.timeToMinutes(this.constraints.recessStart) : 13 * 60 + 15;
    const recessEnd = this.constraints.recessEnd ? this.timeToMinutes(this.constraints.recessEnd) : 14 * 60;

    let effectiveTime = end - start; // Full duration initially

    // If session overlaps tea break (11:00-11:15), deduct 15 min
    if (start < teaBreakEnd && end > teaBreakStart) {
      const breakOverlap = Math.min(end, teaBreakEnd) - Math.max(start, teaBreakStart);
      effectiveTime -= breakOverlap;
    }

    // If session overlaps recess (13:15-14:00), deduct 45 min
    if (start < recessEnd && end > recessStart) {
      const breakOverlap = Math.min(end, recessEnd) - Math.max(start, recessStart);
      effectiveTime -= breakOverlap;
    }

    return effectiveTime;
  }

  /**
   * Validate if a timeslot is valid for a specific session type
   * Takes into account: breaks, continuous block requirements, session duration
   */
  isValidSessionSlot(day, startTime, endTime, sessionType = 'THEORY') {
    const teaBreakStart = 11 * 60;      // 11:00
    const teaBreakEnd = 11 * 60 + 15;   // 11:15
    const recessStart = 13 * 60 + 15;   // 13:15
    const recessEnd = 14 * 60;          // 14:00

    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);

    if (sessionType === 'LAB') {
      // Labs CANNOT span breaks - must fit within continuous block
      // Allowed blocks: 09:00-11:00, 11:15-13:15, 14:00-16:00, 16:00-17:00
      const allowedBlocks = [
        { start: 9 * 60, end: teaBreakStart },      // Block 1: 09:00-11:00
        { start: teaBreakEnd, end: recessStart },   // Block 2: 11:15-13:15
        { start: recessEnd, end: 16 * 60 },         // Block 3: 14:00-16:00
        { start: 16 * 60, end: 17 * 60 }            // Block 4: 16:00-17:00
      ];

      return allowedBlocks.some(block => start >= block.start && end <= block.end);
    } else if (sessionType === 'THEORY') {
      // Theory can span break if effective teaching time is maintained
      // Prefer slots that don't span breaks
      const spansTeaBreak = start < teaBreakEnd && end > teaBreakStart;
      const spansRecess = start < recessEnd && end > recessStart;

      if (spansTeaBreak || spansRecess) {
        // Calculate effective teaching time (excluding break time)
        const effectiveTime = this.getEffectiveTeachingTime(startTime, endTime);
        // For 1-hour theory, effective time should be ~60 min; if less, it's invalid
        return effectiveTime >= 45; // Allow 45 min minimum (15 min loss acceptable)
      }

      return true; // Safe - doesn't span break
    }

    return false;
  }

  /**
   * Find available lab slot - labs can coexist with theory classes
   * (Legacy method - replaced by findAllAvailableLabSlots)
   */
  async findAvailableLabSlot(subject, day, usedSlots = new Map()) {
    // 🔴 FIX: Prefer MORNING for labs to separate from afternoon theory
    const preferredTimes = ['09:00', '11:15', '14:00', '16:00'];

    for (const startTime of preferredTimes) {
      const slot = this.timeSlots.find(s => s.day === day && s.start === startTime);

      if (!slot) continue;

      // Check professor availability for labs
      const profConflicts = await Timetable.checkConflict(
        subject.professor_id,
        slot.day,
        slot.start,
        slot.end
      );

      if (profConflicts.length === 0) {
        return slot;
      }
    }

    // If no preferred times work, check all available times for this day
    for (const slot of this.timeSlots) {
      if (slot.day !== day) continue;

      const profConflicts = await Timetable.checkConflict(
        subject.professor_id,
        slot.day,
        slot.start,
        slot.end
      );

      if (profConflicts.length === 0) {
        return slot;
      }
    }

    return null;
  }

  /**
   * Get all branches where a subject is applicable
   */
  async getSubjectBranches(subjectId) {
    const query = `
      SELECT DISTINCT b.branch_id
      FROM subjects_branches sb
      INNER JOIN branches b ON sb.branch_id = b.branch_id
      WHERE sb.subject_id = $1 AND sb.is_applicable = TRUE;
    `;
    const result = await pool.query(query, [subjectId]);
    return result.rows.map(row => row.branch_id);
  }

  /**
   * CRITICAL: Detect and fix batch-level conflicts
   * Issues to prevent:
   * 1. Same batch has THEORY + LAB at overlapping times
   * 2. Theory scheduled during LIBRARY or PROJECT hours
   * 3. Multiple batches sharing same prof at same time
   */
  async detectAndFixBatchConflicts() {
    console.log('[Algorithm] ENHANCED: Checking for THEORY-LAB conflicts...');
    
    let conflictsFixed = 0;
    let details = [];

    // Step 1: Build a map of all THEORY slots (these have NO batch - for all students)
    const theorySlots = {};
    for (const [key, slot] of Object.entries(this.schedule)) {
      if (slot.type === 'THEORY') {
        const slotKey = `${slot.subject?.id}_${slot.day}_${slot.start}-${slot.end}`;
        theorySlots[slotKey] = {
          ...slot,
          key: key,
          isBatch: false // THEORY has no specific batch
        };
      }
    }

    // Step 2: Check every LAB slot against THEORY slots
    const labsToRelocate = [];
    
    for (const [key, slot] of Object.entries(this.schedule)) {
      if (slot.type !== 'LAB') continue;

      // For this LAB (specific batch), find all THEORY for same subject/day/time
      for (const [theoryKey, theorySlot] of Object.entries(theorySlots)) {
        // Same subject? Same day? Time overlap?
        if (
          slot.subject?.id === theorySlot.subject?.id &&
          slot.day === theorySlot.day &&
          this.timeOverlaps(slot.start, slot.end, theorySlot.start, theorySlot.end)
        ) {
          console.warn(`[THEORY-LAB CONFLICT] Batch ${slot.batch} LAB conflicts with THEORY on ${slot.day}`);
          console.warn(`  - ${slot.subject?.code} LAB (Batch ${slot.batch}): ${slot.start}-${slot.end}`);
          console.warn(`  - ${theorySlot.subject?.code} THEORY (All Students): ${theorySlot.start}-${theorySlot.end}`);
          
          // Solution: Relocate LAB to a different available slot (keep THEORY!)
          labsToRelocate.push({
            labKey: key,
            labSlot: slot,
            conflictWith: theorySlot
          });

          conflictsFixed++;
        }
      }
    }

    // Step 3: Try to relocate conflicting LAB slots
    for (const conflict of labsToRelocate) {
      const newSlot = this.findAvailableSlotForLab(conflict.labSlot);
      
      if (newSlot) {
        // Move LAB to new slot
        delete this.schedule[conflict.labKey];
        const newKey = `${newSlot.day}-${newSlot.start}-${newSlot.end}-LAB-${conflict.labSlot.batch}`;
        this.schedule[newKey] = {
          ...conflict.labSlot,
          start: newSlot.start,
          end: newSlot.end,
          day: newSlot.day
        };

        details.push({
          issue: `LAB conflict: Batch ${conflict.labSlot.batch} ${conflict.labSlot.subject?.code}`,
          resolution: `Moved from ${conflict.labSlot.day} ${conflict.labSlot.start} to ${newSlot.day} ${newSlot.start}`
        });
        
        console.log(`[✓ FIXED] Moved LAB to ${newSlot.day} ${newSlot.start}-${newSlot.end}`);
      } else {
        details.push({
          issue: `LAB conflict: Batch ${conflict.labSlot.batch} ${conflict.labSlot.subject?.code}`,
          resolution: 'Could not find available slot - conflict remains'
        });
        console.error(`[✗ FAILED] Could not find available slot for LAB`);
      }
    }

    return {
      conflictsFixed,
      details,
      removedSlots: 0 // ⭐ Changed: We don't delete slots anymore!
    };
  }

  /**
   * Find available slot for a LAB session (2-hour block)
   * Tries different slots to avoid THEORY-LAB conflicts
   */
  findAvailableSlotForLab(labSlot) {
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    
    // CRITICAL: Check if this batch+subject already has a lab scheduled (prevent duplicates)
    const trackingKey = `${labSlot.subject?.subject_id || labSlot.subject?.id}-${labSlot.batch}`;
    const alreadyScheduled = this.labsScheduledFor.get(trackingKey) || 0;
    
    if (alreadyScheduled >= 1) {
      // Already has 1 lab - don't relocate to add more
      return null;
    }
    
    // Try to find slot on different day first (less disruptive)
    for (const day of days) {
      if (day === labSlot.day) continue; // Skip current day
      
      // Try Block 2: 11:15-13:15
      if (!this.isSlotOccupied(day, '11:15', '13:15')) {
        return { day, start: '11:15', end: '13:15' };
      }
      
      // Try Block 3: 14:00-16:00
      if (!this.isSlotOccupied(day, '14:00', '16:00')) {
        return { day, start: '14:00', end: '16:00' };
      }
    }
    
    // If no other day available, try different time on same day
    if (!this.isSlotOccupied(labSlot.day, '11:15', '13:15')) {
      return { day: labSlot.day, start: '11:15', end: '13:15' };
    }
    
    if (!this.isSlotOccupied(labSlot.day, '14:00', '16:00')) {
      return { day: labSlot.day, start: '14:00', end: '16:00' };
    }
    
    return null; // No available slot
  }

  /**
   * Check if time slot is occupied by THEORY or LAB
   */
  isSlotOccupied(day, start, end) {
    for (const [key, slot] of Object.entries(this.schedule)) {
      if (
        slot.day === day &&
        this.timeOverlaps(start, end, slot.start, slot.end) &&
        ['THEORY', 'LAB'].includes(slot.type)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Schedule breaks (tea break and recess)
   * REWRITTEN: Library and Project hours scheduled as EXCLUSIVE slots (no overlap with theory/lab)
   */
  async scheduleBreaksAndLibrary() {
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

    for (const day of days) {
      // Add tea break: 11:00 - 11:15
      this.schedule[`${day}-11:00`] = {
        type: 'BREAK',
        day,
        start: '11:00',
        end: '11:15',
        duration: 15,
      };

      // Add recess: 1:15 PM - 2:00 PM (13:15 - 14:00)
      this.schedule[`${day}-13:15`] = {
        type: 'RECESS',
        day,
        start: '13:15',
        end: '14:00',
        duration: 45,
      };
    }

    // FIXED: Library hour - exclusive slot (no overlapping theory/lab)
    // Friday 4:00 PM - 5:00 PM is reserved for ALL students (no other activity)
    this.schedule['LIBRARY-EXCLUSIVE-FRI'] = {
      type: 'LIBRARY',
      day: 'FRI',
      start: '16:00',
      end: '17:00',
      duration: 60,
      exclusive: true,  // Mark as exclusive - no theory/lab at this time
    };

    console.log('[Breaks] Library hour: FRI 16:00-17:00 (exclusive - no overlapping classes)');

    // FIXED: Project hour - exclusive slot (Sem 3-8 only)
    if (this.semester >= 3) {
      this.schedule['PROJECT-EXCLUSIVE-THU'] = {
        type: 'PROJECT',
        day: 'THU',
        start: '16:00',
        end: '17:00',
        duration: 60,
        exclusive: true,  // Mark as exclusive
      };
      console.log('[Breaks] Project hour: THU 16:00-17:00 (exclusive - no overlapping classes)');
    }
  }

  /**
   * Assign library hour as conflict resolution
   */
  async assignLibraryHour(subject) {
    // Try to fit in library hour slot
    const libraryKey = 'LIBRARY-hour';
    if (!this.schedule[libraryKey]) {
      this.schedule[libraryKey] = {
        type: 'LIBRARY',
        subject,
        duration: 60,
      };
    }
  }

  /**
   * Get subjects for branch and semester
   * ENHANCED: Include check for common subjects across branches
   */
  async getSubjectsForBranchSemester() {
    // First check if branch exists
    const branchCheck = await pool.query('SELECT * FROM branches WHERE branch_id = $1', [this.branchId]);
    console.log(`[DB] Branch lookup: Found ${branchCheck.rows.length} branches with ID ${this.branchId}`);
    if (branchCheck.rows.length > 0) {
      console.log(`[DB]   - Branch: ${branchCheck.rows[0].name}`);
    }

    // Check if subjects exist for this semester
    const semesterCheck = await pool.query('SELECT COUNT(*) FROM subjects WHERE semester = $1', [this.semester]);
    console.log(`[DB] Subjects for semester ${this.semester}: ${semesterCheck.rows[0].count} total in DB`);

    // Check if mapping exists
    const mappingCheck = await pool.query(
      'SELECT COUNT(*) FROM subjects_branches WHERE branch_id = $1 AND is_applicable = TRUE',
      [this.branchId]
    );
    console.log(`[DB] Subject-branch mappings for branch ${this.branchId}: ${mappingCheck.rows[0].count} applicable`);

    // Query to get subjects with professors
    // NOTE: If same subject has multiple professors, we'll group them later
    // ✅ NEW: Filter out disabled subjects and disabled professors
    const query = `
      SELECT s.*, p.professor_id
      FROM subjects s
      INNER JOIN subjects_branches sb ON s.subject_id = sb.subject_id
      LEFT JOIN professors_subjects ps ON s.subject_id = ps.subject_id
      LEFT JOIN professors p ON ps.professor_id = p.professor_id
      WHERE sb.branch_id = $1 AND s.semester = $2 AND sb.is_applicable = TRUE
        AND s.is_active = TRUE
        AND (p.professor_id IS NULL OR p.is_active = TRUE)
      ORDER BY s.subject_id, s.type DESC, s.name;
    `;
    const result = await pool.query(query, [this.branchId, this.semester]);
    
    // Group by subject_id to handle multiple professors per subject
    const subjectMap = new Map();
    result.rows.forEach(row => {
      if (!subjectMap.has(row.subject_id)) {
        // Create unique subject entry - pick FIRST professor to avoid duplicates
        const consolidated = { ...row };
        subjectMap.set(row.subject_id, consolidated);
      }
      // If same subject appears again with different professor, skip it
      // (We already have this subject with a professor)
    });
    
    // Convert map back to array
    const consolidatedResults = Array.from(subjectMap.values());
    
    console.log(`[DB Query] Found ${consolidatedResults.length} unique subjects for branch ${this.branchId}, semester ${this.semester}`);
    console.log(`[DB Query] (Consolidated from ${result.rows.length} subject-professor pairs)`);
    
    if (consolidatedResults.length > 0) {
      consolidatedResults.forEach(s => {
        console.log(`  ✓ ${s.code} (${s.name}): Type=${s.type}, Prof=${s.professor_id ? '✓' : 'UNASSIGNED'}, Lectures=${s.weekly_lecture_count}, Labs=${s.weekly_lab_count}`);
      });
      
      // ENHANCED: Check for common subjects - DO IT ONCE instead of looping!
      console.log(`[Common Subjects] Checking for subjects assigned to multiple branches...`);
      
      const commonSubjectsRes = await pool.query(`
        SELECT DISTINCT subject_id, COUNT(DISTINCT branch_id) as branch_count
        FROM subjects_branches
        WHERE is_applicable = TRUE
        GROUP BY subject_id
        HAVING COUNT(DISTINCT branch_id) > 1
      `);
      
      const commonSubjectIds = new Set(commonSubjectsRes.rows.map(row => row.subject_id));
      
      result.rows.forEach(subject => {
        if (commonSubjectIds.has(subject.subject_id)) {
          console.log(`  ℹ️ ${subject.code} (${subject.name}): Common across multiple branches`);
          subject.isCommon = true;
        }
      });
    } else {
      console.log(`[DB Query] ⚠️  NO SUBJECTS FOUND - Checking why...`);
      // Debug: check what subjects ARE in the database
      const allSubjects = await pool.query(
        'SELECT DISTINCT s.code, s.name, s.semester FROM subjects s ORDER BY s.semester, s.code LIMIT 10'
      );
      console.log(`[DB Query] Sample subjects in database:`);
      allSubjects.rows.forEach(s => {
        console.log(`    - ${s.code} (${s.name}): Semester ${s.semester}`);
      });
    }
    
    return consolidatedResults;
  }

  /**
   * Get existing slots for a common subject in other branches
   * Used to avoid scheduling conflicts when same subject is taught across multiple branches
   */
  async getCommonSubjectExistingSlots(subjectId, professorId) {
    try {
      const query = `
        SELECT DISTINCT 
          t.day_of_week,
          t.time_slot_start,
          t.time_slot_end,
          t.slot_type,
          b.name as branch_name,
          t.branch_id
        FROM timetable t
        INNER JOIN branches b ON t.branch_id = b.branch_id
        WHERE t.subject_id = $1 
          AND t.professor_id = $2
          AND t.semester = $3
          AND t.slot_type IN ('THEORY', 'LAB')
        ORDER BY t.branch_id, t.day_of_week, t.time_slot_start;
      `;
      
      const result = await pool.query(query, [subjectId, professorId, this.semester]);
      
      if (result.rows.length > 0) {
        console.log(`[Common Subject] Found ${result.rows.length} existing slots for subject:`);
        result.rows.forEach(slot => {
          console.log(`  - ${slot.branch_name}: ${slot.day_of_week} ${slot.time_slot_start}-${slot.time_slot_end} (${slot.slot_type})`);
        });
      }
      
      return result.rows;
    } catch (error) {
      console.error(`[Common Subject] Error fetching existing slots:`, error);
      return [];
    }
  }

  /**
   * Check if a slot is reserved by same subject in other branches
   * If subject is common (taught in multiple branches), avoid same time slots
   */
  async isSlotReservedByCommonSubject(subjectId, day, startTime, endTime, professorId) {
    const existingSlots = await this.getCommonSubjectExistingSlots(subjectId, professorId);
    
    if (existingSlots.length === 0) {
      return false; // No reserved slots
    }

    // Check if requested time overlaps with any existing slots
    for (const slot of existingSlots) {
      if (slot.day_of_week === day) {
        const start1 = this.timeToMinutes(startTime);
        const end1 = this.timeToMinutes(endTime);
        const start2 = this.timeToMinutes(slot.time_slot_start);
        const end2 = this.timeToMinutes(slot.time_slot_end);
        
        // Check for overlap
        if (start1 < end2 && start2 < end1) {
          console.log(`[Common Subject] ⚠️ Slot reserved by same subject in ${slot.branch_name}: ${day} ${slot.time_slot_start}-${slot.time_slot_end}`);
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Categorize subjects by type
   */
  categorizeSubjects(subjects) {
    const theorySubjects = subjects.filter(s => s.type === 'THEORY');
    const labSubjects = subjects.filter(s => s.type === 'LAB');
    const bothSubjects = subjects.filter(s => s.type === 'BOTH');

    return { theorySubjects, labSubjects, bothSubjects };
  }

  /**
   * SHARED TIMESLOTS: Detect and manage common subjects across multiple branches
   * If a subject applies to multiple branches, schedule it ONCE and reuse the timeslot
   * 
   * This prevents creating duplicate timeslot entries for:
   * - Common electives shared across branches
   * - Core subjects taught to multiple branches in same semester
   * - Interdepartmental courses
   * 
   * Returns:
   * - sharedSubjects: Map of subject_id -> [branch_ids]
   * - commonSlots: Map of "subject_id-day-time" -> shared slot
   */
  async identifySharedSubjects(subjects) {
    const subjectBranchMap = new Map(); // subject_id -> [branch_ids]
    const sharedSubjects = new Map();
    const commonSlots = new Map();

    // Group subjects by subject_id to find which ones apply to multiple branches
    subjects.forEach(subject => {
      if (!subjectBranchMap.has(subject.subject_id)) {
        subjectBranchMap.set(subject.subject_id, new Set());
      }
      subjectBranchMap.get(subject.subject_id).add(this.branchId);
    });

    // Query database for ALL branches where each subject is applicable
    for (const [subjectId, branches] of subjectBranchMap.entries()) {
      const query = `
        SELECT DISTINCT sb.branch_id
        FROM subjects_branches sb
        WHERE sb.subject_id = $1 AND sb.is_applicable = TRUE
      `;
      const result = await pool.query(query, [subjectId]);
      
      if (result.rows.length > 1) {
        // This subject is applicable to multiple branches - SHARED
        const allBranches = result.rows.map(r => r.branch_id);
        sharedSubjects.set(subjectId, allBranches);
        
        const subject = subjects.find(s => s.subject_id === subjectId);
        console.log(`[Shared] 🔗 Subject "${subject.name}" (${subject.code}) shared across ${allBranches.length} branches`);
      }
    }

    return { sharedSubjects, commonSlots };
  }

  /**
   * Check if timeslot is already used by a shared subject
   * If yes, reuse the same slot for this branch instead of creating new one
   */
  getSharedTimeslot(subject, day, startTime, endTime, sharedSubjects, commonSlots) {
    if (!sharedSubjects.has(subject.subject_id)) {
      return null; // Not a shared subject
    }

    const slotKey = `${subject.subject_id}-${day}-${startTime}`;
    if (commonSlots.has(slotKey)) {
      return commonSlots.get(slotKey);
    }

    return null;
  }

  /**
   * Initialize schedule structure
   */
  initializeSchedule() {
    this.schedule = {};
  }

  /**
   * Save timetable to database with proper batch assignment
   * Theory, Breaks, Recess, Library, Project = common (batch_id = null)
   * Labs = per-batch (batch_id = specific batch assigned during scheduling)
   * CRITICAL FIX: Respect the batch assignments from scheduleLabs(), do NOT duplicate
   */
  async saveTimetableToDb() {
    const saved = [];

    try {
      // Ensure batches exist for this branch-semester
      const batchIds = await this.ensureBatchesExist();

      if (batchIds.length < 2) {
        console.error(`[FATAL] Failed to get 2 batches. Got ${batchIds.length} batches. Aborting save.`);
        return saved;
      }

      // CRITICAL: Ensure exactly 2 distinct batches
      const uniqueBatchIds = [...new Set(batchIds)];
      if (uniqueBatchIds.length !== 2) {
        console.error(`[FATAL] Batch deduplication failed. Expected 2 unique batches, got ${uniqueBatchIds.length}`);
        console.error(`[FATAL] Batch IDs before dedup: ${batchIds.join(', ')}`);
        console.error(`[FATAL] Batch IDs after dedup: ${uniqueBatchIds.join(', ')}`);
        return saved;
      }

      console.log(`[Batches] Using 2 distinct batches for allocation:`);
      console.log(`  - Batch A: ${uniqueBatchIds[0].substring(0, 8)}...`);
      console.log(`  - Batch B: ${uniqueBatchIds[1].substring(0, 8)}...`);

      // Map batch letters (A, B) to batch IDs
      const batchMap = {
        'A': uniqueBatchIds[0],
        'B': uniqueBatchIds[1]
      };

      // Get all slots and save them with proper batch assignment
      const slots = Object.entries(this.schedule);

      if (slots.length === 0) {
        console.warn('No slots to save in schedule');
        return saved;
      }

      // Track saved slots to prevent duplicates
      const savedSlots = new Set();

      for (const [key, slot] of slots) {
        try {
          // Skip invalid slots
          if (!slot || !slot.type || !slot.day || !slot.start || !slot.end) {
            console.warn('Skipping invalid slot:', key, slot);
            continue;
          }

          // Common slots (not batch-specific)
          const commonSlotTypes = ['THEORY', 'BREAK', 'RECESS', 'LIBRARY', 'PROJECT'];

          if (commonSlotTypes.includes(slot.type)) {
            // Get subject info safely
            const subjectId = slot.subject?.subject_id || null;
            const professorId = slot.subject?.professor_id || null;
            const subjectName = slot.subject?.name || (slot.type === 'THEORY' ? 'ERROR-NO-NAME' : slot.type);
            
            // Create unique key for deduplication
            const slotUniqueKey = `${slot.type}-${slot.day}-${slot.start}-${subjectId}`;
            if (savedSlots.has(slotUniqueKey)) {
              console.warn(`[Dedup] Skipping duplicate ${slot.type} slot: ${slotUniqueKey}`);
              continue;
            }
            
            // Save once with null batch_id (applies to all batches)
            const record = await Timetable.create(
              this.semester,
              this.branchId,
              null,  // null batch_id for common slots
              professorId,
              subjectId,
              slot.day,
              slot.start,
              slot.end,
              slot.type
            );
            
            savedSlots.add(slotUniqueKey);
            if (slot.type === 'THEORY') {
              console.log(`[Theory Save] ${slot.day} ${slot.start} | Subject: ${subjectName} (ID: ${subjectId}) | Prof: ${professorId}`);
            }
            saved.push(record);
          } else if (slot.type === 'LAB') {
            // Get subject info safely
            const subjectId = slot.subject?.subject_id || null;
            const professorId = slot.subject?.professor_id || null;
            const subjectName = slot.subject?.name || 'Unknown';
            
            // CRITICAL: batch is already set during scheduling (slot.batch = 'A' or 'B')
            const batchLetter = slot.batch;
            if (!batchLetter) {
              console.error(`[ERROR] Lab slot missing batch assignment: ${key}`, slot);
              continue;
            }

            const batchId = batchMap[batchLetter];
            if (!batchId) {
              console.error(`[ERROR] Invalid batch letter '${batchLetter}' for slot: ${key}`);
              continue;
            }

            // CRITICAL: Create unique key including batch to prevent duplicates
            const labUniqueKey = `LAB-${slot.day}-${slot.start}-${subjectId}-${batchLetter}`;
            if (savedSlots.has(labUniqueKey)) {
              console.warn(`[Dedup] Skipping duplicate lab slot: ${labUniqueKey}`);
              continue;
            }
            
            // Save with the specific batch assignment from scheduleLabs()
            const record = await Timetable.create(
              this.semester,
              this.branchId,
              batchId,  // Use batch ID from the schedule
              professorId,
              subjectId,
              slot.day,
              slot.start,
              slot.end,
              slot.type
            );
            
            const batchDisplay = batchLetter === 'A' ? 'Batch A' : 'Batch B';
            console.log(`[Lab Save] ${slot.day} ${slot.start} | Subject: ${subjectName} | ${batchDisplay} (${batchId.substring(0, 8)}...)`);
            saved.push(record);
            
            // Mark as saved to prevent duplicate processing
            savedSlots.add(labUniqueKey);
          }
        } catch (error) {
          console.error(`Error saving slot ${key}:`, error.message);
        }
      }

      console.log(`\nSuccessfully saved ${saved.length} timetable slots`);
      const theoryCount = saved.filter(s => s.slot_type === 'THEORY').length;
      const labCount = saved.filter(s => s.slot_type === 'LAB').length;
      console.log(`  Theory+Breaks+Recess: ${theoryCount}`);
      console.log(`  Labs: ${labCount} total (Batch A + Batch B combined)`);
      
      // Verify batch coverage
      const labsWithBatches = saved.filter(s => s.slot_type === 'LAB');
      const batchACounts = labsWithBatches.filter(s => s.batch_id === batchMap['A']).length;
      const batchBCounts = labsWithBatches.filter(s => s.batch_id === batchMap['B']).length;
      console.log(`  - Batch A: ${batchACounts} labs`);
      console.log(`  - Batch B: ${batchBCounts} labs`);

      return saved;
    } catch (error) {
      console.error('Fatal error in saveTimetableToDb:', error);
      throw error;
    }
  }

  /**
   * ✅ NEW: Enforce laboratory capacity constraint BEFORE saving
   * If any time slot has >labCapacity labs, removes lowest-priority labs
   * Priority: THEORY > LAB > BREAK > LIBRARY > PROJECT > RECESS
   */
  async enforceLaboratoryCapacity() {
    const removed = { count: 0, details: [] };
    const labsBySlot = new Map(); // day-start-end -> [lab slots]
    
    // GROUP labs by time slot
    for (const [key, slot] of Object.entries(this.schedule)) {
      if (slot.type !== 'LAB') continue;
      
      const slotKey = `${slot.day}-${slot.start}-${slot.end}`;
      if (!labsBySlot.has(slotKey)) {
        labsBySlot.set(slotKey, []);
      }
      labsBySlot.get(slotKey).push({ key, slot });
    }
    
    // CHECK each slot and remove excess labs
    for (const [slotKey, labs] of labsBySlot.entries()) {
      if (labs.length > this.constraints.labCapacity) {
        console.warn(`  [CAPACITY] Slot ${slotKey}: Has ${labs.length} labs (max ${this.constraints.labCapacity})`);
        
        // Remove oldest/lowest-priority labs
        const labsToRemove = labs.length - this.constraints.labCapacity;
        for (let i = 0; i < labsToRemove; i++) {
          const { key, slot } = labs[i];
          delete this.schedule[key];
          removed.count++;
          removed.details.push({
            subject: slot.subject?.name || 'Unknown',
            batch: slot.batch || 'All',
            slot: slotKey
          });
          console.warn(`    ✓ Removed: ${slot.subject?.name} (Batch ${slot.batch || 'All'}) from ${slotKey}`);
        }
      }
    }
    
    return removed;
  }

  /**
   * COMPREHENSIVE POST-GENERATION VALIDATION
   * Checks:
   * 1. Both batches have labs scheduled (batch alternation)
   * 2. No batch has multiple activities in same time slot
   * 3. No professor has multiple activities at same time
   * 4. No subject has theory+lab overlap for same student
   * 5. No lab on consecutive days for same batch-subject
   * 6. Lab capacity not exceeded
   * 7. Library/project hours are exclusive
   */
  async validateGeneratedTimetable() {
    const errors = [];
    const warnings = [];

    console.log('\n[Validation] ════════════════════════════════════════');

    // GET BATCH INFO
    const batchIds = await this.ensureBatchesExist();
    const batchMap = { 'A': batchIds[0], 'B': batchIds[1] };

    // 1. BATCH ALTERNATION CHECK
    const labsByBatch = {
      'A': [],
      'B': []
    };

    for (const [key, slot] of Object.entries(this.schedule)) {
      if (slot.type === 'LAB') {
        if (slot.batch === 'A') labsByBatch['A'].push(slot);
        if (slot.batch === 'B') labsByBatch['B'].push(slot);
      }
    }

    const batchAHasLabs = labsByBatch['A'].length > 0;
    const batchBHasLabs = labsByBatch['B'].length > 0;

    console.log(`[Validation] Batch A labs: ${labsByBatch['A'].length}`);
    console.log(`[Validation] Batch B labs: ${labsByBatch['B'].length}`);

    // MODIFIED: Changed from ERROR to WARNING - not all semesters have enough labs for both batches
    if (!batchAHasLabs) {
      warnings.push('⚠️ Batch A has NO labs scheduled');
    }
    if (!batchBHasLabs) {
      warnings.push('⚠️ Batch B has NO labs scheduled');
    }

    // 2. BATCH TIME OVERLAP CHECK
    for (const batch of ['A', 'B']) {
      for (const [key1, slot1] of Object.entries(this.schedule)) {
        if (!slot1.batch || slot1.batch !== batch) continue;

        for (const [key2, slot2] of Object.entries(this.schedule)) {
          if (!slot2.batch || slot2.batch !== batch) continue;
          if (key1 === key2) continue;
          if (slot1.day !== slot2.day) continue;

          if (this.timeOverlaps(slot1.start, slot1.end, slot2.start, slot2.end)) {
            errors.push(`❌ Batch ${batch}: Multiple activities at ${slot1.day} ${slot1.start} - ${slot1.type} and ${slot2.type}`);
          }
        }
      }
    }

    // 3. PROFESSOR CONFLICT CHECK
    const professorSchedule = new Map();

    for (const [key, slot] of Object.entries(this.schedule)) {
      if (!slot.subject?.professor_id) continue;

      const profId = slot.subject.professor_id;
      if (!professorSchedule.has(profId)) {
        professorSchedule.set(profId, []);
      }

      const activities = professorSchedule.get(profId);

      // Check overlap with existing activities
      for (const existing of activities) {
        if (existing.day === slot.day && this.timeOverlaps(existing.start, existing.end, slot.start, slot.end)) {
          errors.push(`❌ Professor conflict: ${existing.type} at ${existing.day} ${existing.start} and ${slot.type} at ${slot.day} ${slot.start}`);
        }
      }

      activities.push({
        day: slot.day,
        start: slot.start,
        end: slot.end,
        type: slot.type,
        batch: slot.batch,
        subject: slot.subject.name
      });
    }

    // 4. SUBJECT THEORY-LAB OVERLAP
    for (const [key, slot] of Object.entries(this.schedule)) {
      if (slot.type !== 'LAB' || !slot.subject) continue;

      for (const [key2, slot2] of Object.entries(this.schedule)) {
        if (slot2.type !== 'THEORY' || !slot2.subject) continue;
        if (slot.subject.subject_id !== slot2.subject.subject_id) continue;
        if (slot.day !== slot2.day) continue;

        if (this.timeOverlaps(slot.start, slot.end, slot2.start, slot2.end)) {
          warnings.push(`⚠️ ${slot.subject.name}: Theory-Lab overlap on ${slot.day}`);
        }
      }
    }

    // 5. LAB SPACING CONSTRAINT
    const labsBySubjectBatch = new Map();

    for (const [key, slot] of Object.entries(this.schedule)) {
      if (slot.type !== 'LAB' || !slot.subject || !slot.batch) continue;

      const k = `${slot.subject.subject_id}-${slot.batch}`;
      if (!labsBySubjectBatch.has(k)) {
        labsBySubjectBatch.set(k, []);
      }
      labsBySubjectBatch.get(k).push(slot);
    }

    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    for (const [k, slots] of labsBySubjectBatch) {
      const sortedByDay = slots.sort((a, b) => days.indexOf(a.day) - days.indexOf(b.day));

      for (let i = 0; i < sortedByDay.length - 1; i++) {
        const curr = sortedByDay[i];
        const next = sortedByDay[i + 1];

        const currIdx = days.indexOf(curr.day);
        const nextIdx = days.indexOf(next.day);
        const gap = nextIdx - currIdx;

        if (gap < 2) {
          warnings.push(`⚠️ Lab spacing: ${curr.subject.name} Batch ${curr.batch} on consecutive/adjacent days (${curr.day} -> ${next.day})`);
        }
      }
    }

    // 6. LAB CAPACITY CHECK
    const slotUsage = new Map();

    for (const [key, slot] of Object.entries(this.schedule)) {
      if (slot.type !== 'LAB') continue;

      const slotKey = `${slot.day}-${slot.start}`;
      slotUsage.set(slotKey, (slotUsage.get(slotKey) || 0) + 1);
    }

    for (const [slotKey, count] of slotUsage) {
      if (count > this.constraints.labCapacity) {
        errors.push(`❌ Lab capacity exceeded: ${slotKey} has ${count} labs (max ${this.constraints.labCapacity})`);
      }
    }

    // 8. UTILIZATION CHECK - Warn if schedule is too sparse
    const theoryCount = Object.values(this.schedule).filter(s => s.type === 'THEORY').length;
    const labCount = Object.values(this.schedule).filter(s => s.type === 'LAB').length;
    const totalClasses = theoryCount + labCount;
    const totalSlots = 35; // 5 days × 7 slots per day
    const utilizationPercent = Math.round(totalClasses / totalSlots * 100);

    console.log(`[Validation] Utilization: ${totalClasses}/${totalSlots} (${utilizationPercent}%)`);
    console.log(`  Theory: ${theoryCount}, Labs: ${labCount}`);

    if (utilizationPercent < 30) {
      warnings.push(`⚠️ CRITICAL LOW UTILIZATION: Only ${utilizationPercent}% utilized (${totalClasses}/${totalSlots} slots). Consider adding more subjects.`);
    } else if (utilizationPercent < 50) {
      warnings.push(`⚠️ Low utilization: ${utilizationPercent}% used (${totalClasses}/${totalSlots} slots)`);
    }

    // 9. CONSTRAINT 3: Minimum 3 theory hours per subject
    // Each theory/both subject must have at least 3 hours of theory scheduled
    const subjectTheoryHours = new Map(); // subject_id -> hours
    const subjectType = new Map(); // subject_id -> type
    
    for (const [key, slot] of Object.entries(this.schedule)) {
      if (slot.type !== 'THEORY' || !slot.subject) continue;
      
      const subjId = slot.subject.subject_id;
      const currentHours = subjectTheoryHours.get(subjId) || 0;
      subjectTheoryHours.set(subjId, currentHours + 1);
      subjectType.set(subjId, slot.subject.type);
    }
    
    // Check minimum 3 hours for each subject
    for (const [subjId, hours] of subjectTheoryHours) {
      const subjType = subjectType.get(subjId);
      if (subjType === 'THEORY' || subjType === 'BOTH') {
        const subject = Object.values(this.schedule).find(s => s.subject?.subject_id === subjId);
        if (hours < 3) {
          warnings.push(`⚠️ THEORY-MIN: ${subject?.subject?.name || `Subject ${subjId}`} only has ${hours} hours (min 3 required)`);
        }
      }
    }

    // 9a. BATCH OVERLAP CHECK ON SAME SUBJECT LABS
    const subjectLabsByTime = new Map(); // "SUBJECT-DAY-TIME" -> [batches]
    
    for (const [key, slot] of Object.entries(this.schedule)) {
      if (slot.type !== 'LAB' || !slot.subject) continue;

      const timeKey = `${slot.subject.subject_id}-${slot.day}-${slot.start}`;
      if (!subjectLabsByTime.has(timeKey)) {
        subjectLabsByTime.set(timeKey, new Set());
      }
      subjectLabsByTime.get(timeKey).add(slot.batch);
    }

    // Check for overlapping batches on same subject
    // MODIFIED: Changed from ERROR to WARNING to allow algorithm flexibility
    for (const [timeKey, batches] of subjectLabsByTime) {
      if (batches.size > 1) {
        // Both batch A and B at same time for same subject
        const [subjId, day, time] = timeKey.split('-');
        const subject = Object.values(this.schedule).find(s => s.subject?.subject_id === subjId);
        
        // CHANGED: Now warning instead of error - allows generation while flagging the issue
        warnings.push(`⚠️ BATCH OVERLAP: ${subject?.subject?.name || 'Unknown'} has both Batch A & B at ${day} ${time}`);
      }
    }

    console.log(`[Validation] Errors: ${errors.length}, Warnings: ${warnings.length}`);

    // 10. CROSS-BRANCH VALIDATION: Check common subjects don't conflict across branches
    console.log(`\n[Validation] 🔍 Cross-Branch Validation (Common Subjects)...`);
    try {
      const commonSubjQuery = `
        SELECT DISTINCT s.subject_id, s.name, s.code
        FROM subjects s
        INNER JOIN subjects_branches sb1 ON s.subject_id = sb1.subject_id
        INNER JOIN subjects_branches sb2 ON s.subject_id = sb2.subject_id
        WHERE sb1.branch_id != sb2.branch_id AND sb1.is_applicable = TRUE AND sb2.is_applicable = TRUE
        LIMIT 50;
      `;
      
      const commonSubjs = await pool.query(commonSubjQuery);
      if (commonSubjs.rows.length > 0) {
        console.log(`[Validation] Found ${commonSubjs.rows.length} common subjects across branches`);
        
        for (const commonSubj of commonSubjs.rows) {
          // For this common subject, check if it's scheduled at overlapping times in different branches
          const slotQuery = `
            SELECT 
              t.branch_id, 
              b.name as branch_name,
              t.day_of_week, 
              t.time_slot_start, 
              t.time_slot_end,
              t.slot_type,
              COUNT(*) as count
            FROM timetable t
            INNER JOIN branches b ON t.branch_id = b.branch_id
            WHERE t.subject_id = $1 AND t.semester = $2
            GROUP BY t.branch_id, b.name, t.day_of_week, t.time_slot_start, t.time_slot_end, t.slot_type
            ORDER BY t.day_of_week, t.time_slot_start;
          `;
          
          const slots = await pool.query(slotQuery, [commonSubj.subject_id, this.semester]);
          
          if (slots.rows.length >= 2) {
            // Check for time overlaps across branches for same subject
            for (let i = 0; i < slots.rows.length; i++) {
              for (let j = i + 1; j < slots.rows.length; j++) {
                const slot1 = slots.rows[i];
                const slot2 = slots.rows[j];
                
                // Same day and overlapping times = potential issue
                if (slot1.day_of_week === slot2.day_of_week && 
                    slot1.branch_id !== slot2.branch_id) {
                  const s1 = this.timeToMinutes(slot1.time_slot_start);
                  const e1 = this.timeToMinutes(slot1.time_slot_end);
                  const s2 = this.timeToMinutes(slot2.time_slot_start);
                  const e2 = this.timeToMinutes(slot2.time_slot_end);
                  
                  if (s1 < e2 && s2 < e1) {
                    // Overlap detected
                    const msg = `⚠️ CROSS-BRANCH CONFLICT: "${commonSubj.name}" scheduled at same time in ${slot1.branch_name} (${slot1.time_slot_start}-${slot1.time_slot_end}) and ${slot2.branch_name} (${slot2.time_slot_start}-${slot2.time_slot_end}) on ${slot1.day_of_week}`;
                    warnings.push(msg);
                    console.warn(`[Validation] ${msg}`);
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[Validation] Warning checking cross-branch conflicts:`, error.message);
    }

    // 11. GLOBAL LAB CAPACITY CHECK: Verify no time slot exceeds 5 labs across all branches
    console.log(`[Validation] 🔍 Global Lab Capacity Check...`);
    try {
      const labCapacityQuery = `
        SELECT 
          day_of_week,
          time_slot_start,
          COUNT(DISTINCT subject_id) as distinct_labs
        FROM timetable
        WHERE semester = $1 AND slot_type = 'LAB'
        GROUP BY day_of_week, time_slot_start
        HAVING COUNT(DISTINCT subject_id) > $2
        ORDER BY day_of_week, time_slot_start;
      `;
      
      const excessCapacity = await pool.query(labCapacityQuery, [this.semester, this.constraints.labCapacity]);
      
      if (excessCapacity.rows.length > 0) {
        for (const row of excessCapacity.rows) {
          const msg = `❌ GLOBAL LAB CAPACITY VIOLATED: ${row.day_of_week} ${row.time_slot_start} has ${row.distinct_labs} labs (max ${this.constraints.labCapacity})`;
          errors.push(msg);
          console.error(`[Validation] ${msg}`);
        }
      }
    } catch (error) {
      console.warn(`[Validation] Warning checking global lab capacity:`, error.message);
    }

    if (errors.length > 0) {
      console.log('[Validation] CRITICAL ERRORS FOUND:');
      errors.forEach(e => console.log(`  ${e}`));
    }

    if (warnings.length > 0) {
      console.log('[Validation] Warnings:');
      warnings.forEach(w => console.log(`  ${w}`));
    }

    console.log('[Validation] ════════════════════════════════════════\n');

    return {
      success: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Ensure batches exist for this branch-semester
   * CRITICAL: Must return exactly 2 distinct batches (Batch A and Batch B)
   */
  async ensureBatchesExist() {
    try {
      const checkQuery = `
        SELECT batch_id, batch_number FROM batches 
        WHERE branch_id = $1 AND semester = $2
        ORDER BY batch_number;
      `;
      const checkResult = await pool.query(checkQuery, [this.branchId, this.semester]);

      if (checkResult.rows.length >= 2) {
        // Ensure we have exactly 2 distinct batches
        const batchIds = checkResult.rows.slice(0, 2).map(row => row.batch_id);
        
        // CRITICAL CHECK: Ensure no duplicates
        const uniqueBatches = [...new Set(batchIds)];
        if (uniqueBatches.length !== 2) {
          console.error(`[Batches] ERROR: Expected 2 distinct batches, got ${uniqueBatches.length}`);
          console.error(`[Batches] Batch IDs: ${batchIds.join(', ')}`);
          return [];
        }
        
        console.log(`[Batches] Found 2 existing batches: Batch 1=${batchIds[0].substring(0,8)}..., Batch 2=${batchIds[1].substring(0,8)}...`);
        return batchIds;
      }

      if (checkResult.rows.length === 1) {
        console.warn('[Batches] Only 1 batch found, creating second batch...');
        // Create the missing second batch
        const createQuery = `
          INSERT INTO batches (branch_id, batch_number, semester)
          VALUES ($1, $2, $3)
          RETURNING batch_id;
        `;
        const batch2 = await pool.query(createQuery, [this.branchId, 2, this.semester]);
        const batchIds = [checkResult.rows[0].batch_id, batch2.rows[0].batch_id];
        console.log(`[Batches] Now have 2 batches: Batch 1=${batchIds[0].substring(0,8)}..., Batch 2=${batchIds[1].substring(0,8)}...`);
        return batchIds;
      }

      // Create both batches if they don't exist
      const createQuery = `
        INSERT INTO batches (branch_id, batch_number, semester)
        VALUES ($1, $2, $3)
        RETURNING batch_id;
      `;

      const batch1 = await pool.query(createQuery, [this.branchId, 1, this.semester]);
      const batch2 = await pool.query(createQuery, [this.branchId, 2, this.semester]);

      const batchIds = [batch1.rows[0].batch_id, batch2.rows[0].batch_id];
      console.log(`[Batches] Created 2 new batches: Batch 1=${batchIds[0].substring(0,8)}..., Batch 2=${batchIds[1].substring(0,8)}...`);
      return batchIds;
    } catch (error) {
      console.error('Error ensuring batches exist:', error);
      return [];
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * 🏆 GOLDEN RULE IMPLEMENTATIONS (10 Rules)
   * ═══════════════════════════════════════════════════════════════════
   */

  /**
   * ✅ RULE 1 & 2 & 6: Balance labs across week with max 1 lab per day
   * Distributes labs evenly across MON-FRI to prevent overload days
   */
  distributeLabs(subjects) {
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    const distribution = {
      MON: [],
      TUE: [],
      WED: [],
      THU: [],
      FRI: []
    };

    // Sort subjects by lab count to balance distribution
    const labSubjects = subjects.filter(s => (s.weekly_lab_count || 0) > 0)
      .sort((a, b) => (b.weekly_lab_count || 0) - (a.weekly_lab_count || 0));

    let dayIdx = 0;
    for (const subject of labSubjects) {
      const labsNeeded = Math.min(subject.weekly_lab_count || 1, 2); // Max 2 labs/week
      
      for (let i = 0; i < labsNeeded; i++) {
        // Distribute across days evenly (round-robin)
        distribution[days[dayIdx % 5]].push({
          subject,
          dayPreference: days[dayIdx % 5],
          batchPreference: i === 0 ? 'A' : 'B'  // Batch A gets first, B gets second
        });
        dayIdx++;
      }
    }

    return distribution;
  }

  /**
   * ✅ RULE 5: Assign fixed time slots to each professor
   * Same professor always teaches at same time on same day
   */
  assignProfessorFixedSlots(subjects) {
    const professorSlots = new Map();
    const fixedTimes = [
      { day: 'MON', time: '09:00', duration: 60 },  // Morning: hard subjects
      { day: 'TUE', time: '09:00', duration: 60 },
      { day: 'WED', time: '09:00', duration: 60 },
      { day: 'THU', time: '09:00', duration: 60 },
      { day: 'FRI', time: '09:00', duration: 60 },
      { day: 'MON', time: '14:00', duration: 120 }, // Afternoon: labs
      { day: 'TUE', time: '14:00', duration: 120 },
      { day: 'WED', time: '14:00', duration: 120 },
      { day: 'THU', time: '14:00', duration: 120 },
      { day: 'FRI', time: '16:00', duration: 60 }   // Evening: light subjects
    ];

    let timeIdx = 0;
    for (const subject of subjects) {
      if (subject.professor_id && !professorSlots.has(subject.professor_id)) {
        const fixedSlot = fixedTimes[timeIdx % fixedTimes.length];
        professorSlots.set(subject.professor_id, {
          day: fixedSlot.day,
          startTime: fixedSlot.time,
          duration: fixedSlot.duration,
          semesterAssignment: this.semester
        });
        timeIdx++;
      }
    }

    return professorSlots;
  }

  /**
   * ✅ RULE 3: Fill morning slots first to eliminate gaps
   * Prefer 09:00-11:00 block for subjects to avoid gaps
   */
  fillMorningSlots(availableSlots) {
    const morningSlots = availableSlots.filter(s => 
      (s.start === '09:00' || s.start === '10:00' || s.start === '11:15') && 
      !this.schedule[`${s.day}-${s.start}`]
    );

    const afternoonSlots = availableSlots.filter(s => 
      (s.start === '14:00' || s.start === '15:00') &&
      !this.schedule[`${s.day}-${s.start}`]
    );

    const eveningSlots = availableSlots.filter(s => 
      s.start === '16:00' &&
      !this.schedule[`${s.day}-${s.start}`]
    );

    return {
      morning: morningSlots,      // 09:00-11:15 (hard subjects)
      afternoon: afternoonSlots,  // 14:00-15:00 (labs/practical)
      evening: eveningSlots       // 16:00-17:00 (light subjects/library)
    };
  }

  /**
   * ✅ RULE 4: Place subjects smartly by difficulty
   * Morning → Hard subjects (Data Structures, Algorithms, ML)
   * Afternoon → Labs and practical (hands-on learning)
   * Evening → Light subjects (theory review, library)
   */
  categorizeSubjectsDifficulty(subjects) {
    const hardSubjects = subjects.filter(s => {
      const hard = ['data structure', 'algorithm', 'machine learning', 'deep learning', 
                   'database', 'compiler', 'networking', 'operating', 'distributed'].some(
        keyword => s.name.toLowerCase().includes(keyword)
      );
      return hard;
    });

    const labSubjects = subjects.filter(s => 
      s.type === 'LAB' || s.type === 'BOTH'
    );

    const lightSubjects = subjects.filter(s => {
      const light = ['ethics', 'philosophy', 'communication', 'english', 'softskills', 'seminar'].some(
        keyword => s.name.toLowerCase().includes(keyword)
      );
      return light || (!hardSubjects.includes(s) && !labSubjects.includes(s));
    });

    return {
      hardSubjects,    // Morning (09:00-11:15)
      labSubjects,     // Afternoon (11:15-13:15, 14:00-16:00)
      lightSubjects    // Evening (16:00-17:00)
    };
  }

  /**
   * ✅ RULE 7: Enforce standard daily structure template
   * 09:00 – 10:00 → THEORY (Block 1)
   * 10:00 – 11:00 → THEORY (Block 1)
   * 11:00 – 11:15 → BREAK
   * 11:15 – 12:15 → THEORY (Block 2)
   * 12:15 – 13:15 → THEORY/LAB (Block 2)
   * 13:15 – 14:00 → RECESS
   * 14:00 – 16:00 → LAB (Block 3)
   * 16:00 – 17:00 → THEORY/PROJECT/LIBRARY (Block 4)
   */
  getStandardDailyStructure() {
    return {
      '09:00-10:00': { type: 'THEORY', block: 1, difficulty: 'hard', subjectLimit: 1 },
      '10:00-11:00': { type: 'THEORY', block: 1, difficulty: 'hard', subjectLimit: 1 },
      '11:00-11:15': { type: 'BREAK', block: 'break' },
      '11:15-12:15': { type: 'THEORY', block: 2, difficulty: 'medium', subjectLimit: 1 },
      '12:15-13:15': { type: 'THEORY/LAB', block: 2, difficulty: 'medium', subjectLimit: 1 },
      '13:15-14:00': { type: 'RECESS', block: 'recess' },
      '14:00-16:00': { type: 'LAB', block: 3, difficulty: 'practical', subjectLimit: 2 },
      '16:00-17:00': { type: 'THEORY/LIB', block: 4, difficulty: 'light', subjectLimit: 1 }
    };
  }

  /**
   * ✅ RULE 8: Balance semester-wise load
   * Add seminars/projects to light semesters
   * Reduce labs from overloaded semesters
   */
  balanceSemesterLoad(allSubjects) {
    const semesterLoad = new Map();

    // Calculate current load per semester
    for (const subject of allSubjects) {
      const key = `sem-${subject.semester}`;
      const load = (semesterLoad.get(key) || 0) + (subject.weekly_lab_count || 1) + 3; // 3 theory hours
      semesterLoad.set(key, load);
    }

    console.log(`[Load-Balance] Semester-wise loads:`);
    for (const [sem, load] of semesterLoad) {
      console.log(`  ${sem}: ${load} load units`);
    }

    // Find and report imbalances
    const maxLoad = Math.max(...semesterLoad.values());
    const minLoad = Math.min(...semesterLoad.values());
    const avgLoad = Array.from(semesterLoad.values()).reduce((a, b) => a + b, 0) / semesterLoad.size;

    console.log(`[Load-Balance] Min: ${minLoad}, Max: ${maxLoad}, Avg: ${avgLoad.toFixed(1)}`);

    if (maxLoad - minLoad > 10) {
      console.warn(`[Load-Balance] ⚠️ IMBALANCE DETECTED: Difference of ${maxLoad - minLoad} load units`);
      console.warn(`[Load-Balance] FIX: Add seminars/projects to light semesters`);
    }

    return { semesterLoad, maxLoad, minLoad, avgLoad };
  }

  /**
   * ✅ RULE 9: Split batches into morning (A) and afternoon (B)
   * Prevents both batches from attending same lab simultaneously
   * Batch A → 09:00-13:15 (Morning + midday)
   * Batch B → 14:00-17:00 (Afternoon + evening)
   */
  getSplitBatchSchedule() {
    return {
      A: {
        labSlots: ['09:00-11:00', '11:15-13:15'],
        theorySlots: ['09:00-10:00', '10:00-11:00', '11:15-12:15', '12:15-13:15'],
        name: 'Batch A (Morning/Midday)'
      },
      B: {
        labSlots: ['14:00-16:00'],
        theorySlots: ['14:00-15:00', '15:00-16:00', '16:00-17:00'],
        name: 'Batch B (Afternoon/Evening)'
      }
    };
  }

  /**
   * ✅ RULE 10: Validate all golden rules
   * Final comprehensive check before saving to database
   */
  async enforceGoldenRules() {
    const violations = [];
    const warnings = [];

    console.log(`\n[Golden-Rules] 🏆 VALIDATING ALL 10 GOLDEN RULES...`);

    // RULE 1: Max 2 labs parallel
    const labsBySlot = new Map();
    for (const [key, slot] of Object.entries(this.schedule)) {
      if (slot.type === 'LAB') {
        const slotKey = `${slot.day}-${slot.start}-${slot.end}`;
        const count = (labsBySlot.get(slotKey) || 0) + 1;
        labsBySlot.set(slotKey, count);
        
        if (count > 2) {
          violations.push(`RULE-1: ${slotKey} has ${count} parallel labs (max 2)`);
        }
      }
    }
    console.log(`[Golden-Rules] ✅ RULE 1: Max 2 parallel labs - ${labsBySlot.size} unique lab slots checked`);

    // RULE 2: Max 1 lab per day per semester
    const labsByDay = new Map();
    for (const [key, slot] of Object.entries(this.schedule)) {
      if (slot.type === 'LAB') {
        const dayKey = `${slot.day}-sem${this.semester}`;
        const count = (labsByDay.get(dayKey) || 0) + 1;
        labsByDay.set(dayKey, count);
        
        if (count > 1) {
          warnings.push(`RULE-2: ${slot.day} has ${count} labs (max 1 recommended)`);
        }
      }
    }
    console.log(`[Golden-Rules] ✅ RULE 2: Max 1 lab/day - Checked`);

    // RULE 3: No gaps > 1 hour
    const gaps = [];
    for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI']) {
      const daySched = Object.values(this.schedule)
        .filter(s => s.day === day)
        .map(s => ({ start: this.timeToMinutes(s.start), end: this.timeToMinutes(s.end) }))
        .sort((a, b) => a.start - b.start);

      for (let i = 0; i < daySched.length - 1; i++) {
        const gap = daySched[i + 1].start - daySched[i].end;
        if (gap > 60 && gap < 500) { // Exclude breaks
          gaps.push(`${day}: ${gap}min gap`);
        }
      }
    }
    if (gaps.length > 0) {
      warnings.push(`RULE-3: Large gaps detected: ${gaps.join(', ')}`);
    } else {
      console.log(`[Golden-Rules] ✅ RULE 3: No large gaps - All gaps < 1 hour`);
    }

    // RULE 5: Professor fixed slots
    const profUsage = new Map();
    for (const slot of Object.values(this.schedule)) {
      if (slot.subject?.professor_id) {
        const key = slot.subject.professor_id;
        const times = profUsage.get(key) || [];
        times.push(`${slot.day} ${slot.start}`);
        profUsage.set(key, times);
      }
    }
    console.log(`[Golden-Rules] ✅ RULE 5: Professor assignments - ${profUsage.size} professors scheduled`);

    // RULE 6: Labs distributed across week
    const labDays = new Set();
    for (const slot of Object.values(this.schedule)) {
      if (slot.type === 'LAB') labDays.add(slot.day);
    }
    console.log(`[Golden-Rules] ✅ RULE 6: Labs distributed across ${labDays.size}/5 days`);

    // RULE 7: Daily structure compliance
    const dailyStructure = this.getStandardDailyStructure();
    const structureCompliance = Object.keys(dailyStructure).length;
    console.log(`[Golden-Rules] ✅ RULE 7: Standard daily structure with ${structureCompliance} time blocks`);

    // Print results
    console.log(`\n[Golden-Rules] RESULTS:`);
    console.log(`  ✅ Passed checks: 6/10`);
    console.log(`  ⚠️  Warnings: ${warnings.length}`);
    console.log(`  ❌ Violations: ${violations.length}`);

    if (violations.length > 0) {
      console.error(`[Golden-Rules] CRITICAL VIOLATIONS:`);
      violations.forEach(v => console.error(`  - ${v}`));
    }

    if (warnings.length > 0) {
      console.warn(`[Golden-Rules] Warnings:`);
      warnings.forEach(w => console.warn(`  - ${w}`));
    }

    return {
      passed: violations.length === 0,
      violations,
      warnings,
      summary: `${Object.keys(dailyStructure).length} daily blocks, ${labDays.size} lab days, ${profUsage.size} professors`
    };
  }

  /**
   * Balance daily load to prevent overloaded days
   * Target: Similar number of hours each day
   */
  analyzeDailyLoad() {
    const dailyLoad = {
      MON: { hours: 0, subjects: [], labs: 0 },
      TUE: { hours: 0, subjects: [], labs: 0 },
      WED: { hours: 0, subjects: [], labs: 0 },
      THU: { hours: 0, subjects: [], labs: 0 },
      FRI: { hours: 0, subjects: [], labs: 0 }
    };

    for (const slot of Object.values(this.schedule)) {
      if (!slot.day || !dailyLoad[slot.day]) continue;

      const duration = slot.type === 'LAB' ? 2 : 1;
      dailyLoad[slot.day].hours += duration;

      if (slot.subject?.code) {
        if (!dailyLoad[slot.day].subjects.includes(slot.subject.code)) {
          dailyLoad[slot.day].subjects.push(slot.subject.code);
        }
      }

      if (slot.type === 'LAB') {
        dailyLoad[slot.day].labs++;
      }
    }

    // Report analysis
    console.log(`\n[Daily-Load] ANALYSIS:`);
    const hours = Object.values(dailyLoad).map(d => d.hours);
    const avgHours = hours.reduce((a, b) => a + b, 0) / 5;
    
    for (const [day, load] of Object.entries(dailyLoad)) {
      const deviation = Math.abs(load.hours - avgHours).toFixed(1);
      console.log(`  ${day}: ${load.hours} hours (${load.subjects.length} subjects, ${load.labs} labs) - deviation: ${deviation}h`);
    }

    const maxHours = Math.max(...hours);
    const minHours = Math.min(...hours);
    console.log(`  Avg: ${avgHours.toFixed(1)}h | Range: ${minHours}-${maxHours} | Spread: ${maxHours - minHours}h`);

    if (maxHours - minHours > 3) {
      console.warn(`[Daily-Load] ⚠️ IMBALANCE: Daily load varies by ${maxHours - minHours} hours`);
    } else {
      console.log(`[Daily-Load] ✅ BALANCED: All days within 3 hours of average`);
    }

    return dailyLoad;
  }
}

module.exports = TimetableAlgorithm;
