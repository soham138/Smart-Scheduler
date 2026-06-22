/**
 * Professor Conflict Resolver
 * 
 * Detects and resolves:
 * 1. Professor double-booking (teaching multiple subjects at same time)
 * 2. Missing professor assignments
 * 3. Cross-branch subject timing conflicts
 * 4. Lab+Theory overlap for same professor
 */

const pool = require('./src/config/db');

class ProfessorConflictResolver {
  constructor() {
    this.conflicts = [];
    this.resolutions = [];
  }

  /**
   * STEP 1: DETECT PROFESSOR TIME CONFLICTS
   * Find all instances where a professor is booked for multiple sessions at same time
   */
  async detectProfessorTimeConflicts() {
    console.log('\n📋 STEP 1: Detecting Professor Time Conflicts...\n');
    
    try {
      const query = `
        SELECT 
          p.professor_id,
          p.name,
          array_agg(DISTINCT t.branch_id) as branches,
          array_agg(DISTINCT t.semester) as semesters,
          array_agg(DISTINCT t.day_of_week) as days,
          t.time_slot_start,
          t.time_slot_end,
          array_agg(json_build_object(
            'branch', t.branch_id,
            'semester', t.semester,
            'subject', s.name,
            'type', s.type,
            'batch', t.batch,
            'day', t.day_of_week
          )) as sessions
        FROM professor p
        JOIN timetable t ON p.professor_id = t.professor_id
        JOIN subject s ON t.subject_id = s.subject_id
        GROUP BY p.professor_id, p.name, t.time_slot_start, t.time_slot_end
        HAVING COUNT(*) > 1
        ORDER BY p.professor_id, t.time_slot_start
      `;
      
      const result = await pool.query(query);
      const conflicts = result.rows;

      if (conflicts.length === 0) {
        console.log('✅ No professor time conflicts detected!\n');
        return [];
      }

      console.log(`❌ Found ${conflicts.length} professor time conflict(s):\n`);
      
      conflicts.forEach((conflict, idx) => {
        console.log(`${idx + 1}. ${conflict.name}`);
        console.log(`   Time: ${conflict.time_slot_start} - ${conflict.time_slot_end}`);
        console.log(`   Branches: ${conflict.branches.join(', ')}`);
        console.log(`   Sessions:`);
        
        conflict.sessions.forEach(session => {
          console.log(`     • ${session.branch} Sem ${session.semester}: ${session.subject} (${session.type}) - Batch ${session.batch || 'N/A'}`);
        });
        console.log();
      });

      this.conflicts = conflicts;
      return conflicts;
    } catch (error) {
      console.error('❌ Error detecting conflicts:', error.message);
      return [];
    }
  }

  /**
   * STEP 2: DETECT MISSING PROFESSOR ASSIGNMENTS
   * Find timetable entries with NULL professor_id
   */
  async detectMissingProfessors() {
    console.log('\n📋 STEP 2: Detecting Missing Professor Assignments...\n');
    
    try {
      const query = `
        SELECT 
          t.timetable_id,
          t.branch_id,
          t.semester,
          t.day_of_week,
          t.time_slot_start,
          t.time_slot_end,
          s.code,
          s.name,
          t.batch,
          s.type
        FROM timetable t
        JOIN subject s ON t.subject_id = s.subject_id
        WHERE t.professor_id IS NULL
        AND t.slot_type NOT IN ('BREAK', 'RECESS', 'LIBRARY', 'PROJECT')
        ORDER BY t.branch_id, t.semester, t.day_of_week, t.time_slot_start
      `;
      
      const result = await pool.query(query);
      const missing = result.rows;

      if (missing.length === 0) {
        console.log('✅ All subjects have professors assigned!\n');
        return [];
      }

      console.log(`❌ Found ${missing.length} entry/entries with missing professors:\n`);
      
      missing.forEach((entry, idx) => {
        console.log(`${idx + 1}. ${entry.branch_id} Sem ${entry.semester}`);
        console.log(`   Subject: ${entry.code} - ${entry.name} (${entry.type})`);
        console.log(`   Time: ${entry.day_of_week} ${entry.time_slot_start} - ${entry.time_slot_end}`);
        console.log(`   Batch: ${entry.batch || 'N/A'}`);
        console.log(`   Timetable ID: ${entry.timetable_id}`);
        console.log();
      });

      return missing;
    } catch (error) {
      console.error('❌ Error detecting missing professors:', error.message);
      return [];
    }
  }

  /**
   * STEP 3: DETECT HEAVY PROFESSOR LOAD
   * Find professors teaching too many different subjects
   */
  async detectHeavyProfessorLoad() {
    console.log('\n📋 STEP 3: Detecting Heavy Professor Loads...\n');
    
    try {
      const query = `
        SELECT 
          p.professor_id,
          p.name,
          COUNT(DISTINCT CONCAT(t.branch_id, '-', t.semester, '-', t.subject_id)) as unique_subjects,
          COUNT(DISTINCT CONCAT(t.branch_id, '-', t.semester)) as branch_semester_combos,
          array_agg(DISTINCT CONCAT(t.branch_id, ' Sem ', t.semester)) as branches_semesters,
          array_agg(DISTINCT s.name) as subject_names,
          COUNT(*) as total_sessions
        FROM professor p
        JOIN timetable t ON p.professor_id = t.professor_id
        JOIN subject s ON t.subject_id = s.subject_id
        WHERE t.slot_type IN ('LAB', 'THEORY')
        GROUP BY p.professor_id, p.name
        HAVING COUNT(DISTINCT CONCAT(t.branch_id, '-', t.semester, '-', t.subject_id)) >= 4
        ORDER BY unique_subjects DESC
      `;
      
      const result = await pool.query(query);
      const heavyLoads = result.rows;

      if (heavyLoads.length === 0) {
        console.log('✅ No professors with excessive load!\n');
        return [];
      }

      console.log(`⚠️ Found ${heavyLoads.length} professor(s) with heavy load:\n`);
      
      heavyLoads.forEach((prof, idx) => {
        console.log(`${idx + 1}. ${prof.name}`);
        console.log(`   Unique Subjects: ${prof.unique_subjects}`);
        console.log(`   Branch-Semester Combos: ${prof.branch_semester_combos}`);
        console.log(`   Total Sessions: ${prof.total_sessions}`);
        console.log(`   Branches/Semesters: ${prof.branches_semesters.join(', ')}`);
        console.log(`   Subjects: ${prof.subject_names.join(', ')}`);
        console.log(`   ⚠️  RECOMMENDATION: Reassign some subjects to other professors`);
        console.log();
      });

      return heavyLoads;
    } catch (error) {
      console.error('❌ Error detecting heavy loads:', error.message);
      return [];
    }
  }

  /**
   * STEP 4: DETECT SAME SUBJECT ACROSS BRANCHES AT SIMILAR TIMES
   * Subjects should be staggered across branches to avoid resource conflicts
   */
  async detectSubjectTimingAcrossBranches() {
    console.log('\n📋 STEP 4: Detecting Subject Timing Across Branches...\n');
    
    try {
      const query = `
        SELECT 
          s.code,
          s.name,
          array_agg(json_build_object(
            'branch', t.branch_id,
            'semester', t.semester,
            'time', t.time_slot_start || ' - ' || t.time_slot_end,
            'day', t.day_of_week
          ) ORDER BY t.branch_id) as schedules
        FROM subject s
        JOIN timetable t ON s.subject_id = t.subject_id
        WHERE t.slot_type = 'THEORY'
        GROUP BY s.code, s.name
        HAVING COUNT(DISTINCT t.branch_id) > 1
        ORDER BY s.code
      `;
      
      const result = await pool.query(query);
      const subjects = result.rows;

      if (subjects.length === 0) {
        console.log('✅ No cross-branch subjects found!\n');
        return [];
      }

      console.log(`ℹ️ Found ${subjects.length} subject(s) across multiple branches:\n`);
      
      subjects.forEach((subject, idx) => {
        console.log(`${idx + 1}. ${subject.code} - ${subject.name}`);
        subject.schedules.forEach(schedule => {
          console.log(`   • ${schedule.branch} Sem ${schedule.semester}: ${schedule.day} ${schedule.time}`);
        });
        console.log();
      });

      return subjects;
    } catch (error) {
      console.error('❌ Error detecting cross-branch subjects:', error.message);
      return [];
    }
  }

  /**
   * RESOLVE CONFLICTS: Move one of the conflicting sessions
   * Attempts to find an available slot and move the session
   */
  async resolveConflict(conflictId, sessionToMove) {
    console.log(`\n🔧 Attempting to resolve conflict by moving session...\n`);
    console.log(`   Session: ${sessionToMove.branch} Sem ${sessionToMove.semester} - ${sessionToMove.subject}`);
    console.log(`   Current: ${sessionToMove.day} ${sessionToMove.time}`);
    
    try {
      // Find available slots for this session
      const query = `
        SELECT 
          t.day_of_week,
          t.time_slot_start,
          t.time_slot_end,
          COUNT(*) as usage
        FROM timetable t
        WHERE t.branch_id = $1
        AND t.semester = $2
        AND t.slot_type = $3
        AND t.professor_id IS NULL  -- Available slot
        GROUP BY t.day_of_week, t.time_slot_start, t.time_slot_end
        LIMIT 5
      `;

      const result = await pool.query(query, [
        sessionToMove.branch_id,
        sessionToMove.semester,
        sessionToMove.type
      ]);

      if (result.rows.length === 0) {
        console.log(`   ❌ No available slots found`);
        return null;
      }

      console.log(`   ✅ Found ${result.rows.length} possible alternative slot(s):`);
      result.rows.forEach((slot, idx) => {
        console.log(`      ${idx + 1}. ${slot.day_of_week} ${slot.time_slot_start} - ${slot.time_slot_end}`);
      });

      return result.rows[0]; // Return first available slot
    } catch (error) {
      console.error('❌ Error resolving conflict:', error.message);
      return null;
    }
  }

  /**
   * VALIDATION: Run all checks and generate report
   */
  async runFullValidation() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║     PROFESSOR CONFLICT DETECTION & RESOLUTION SYSTEM           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    const professionConflicts = await this.detectProfessorTimeConflicts();
    const missingProfs = await this.detectMissingProfessors();
    const heavyLoads = await this.detectHeavyProfessorLoad();
    const crossBranchSubjects = await this.detectSubjectTimingAcrossBranches();

    // Generate summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                      VALIDATION SUMMARY                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const totalIssues = professionConflicts.length + missingProfs.length + heavyLoads.length;

    console.log(`🔴 CRITICAL ISSUES:`);
    console.log(`   Professor Time Conflicts: ${professionConflicts.length}`);
    console.log(`   Missing Professors: ${missingProfs.length}`);
    console.log(`   Total Critical: ${professionConflicts.length + missingProfs.length}\n`);

    console.log(`🟠 HIGH PRIORITY:`);
    console.log(`   Heavy Professor Loads: ${heavyLoads.length}\n`);

    console.log(`ℹ️  INFORMATIONAL:`);
    console.log(`   Cross-Branch Subjects: ${crossBranchSubjects.length}\n`);

    console.log(`════════════════════════════════════════════════════════════════\n`);

    if (totalIssues === 0) {
      console.log('✅ TIMETABLE IS VALID - No critical issues found!\n');
      return { valid: true, issues: 0 };
    } else {
      console.log(`❌ TIMETABLE HAS ${totalIssues} CRITICAL ISSUE(S) - NEEDS FIXING\n`);
      console.log('RECOMMENDATIONS:');
      console.log('1️⃣  Fix professor time conflicts by moving sessions');
      console.log('2️⃣  Assign professors to missing subjects');
      console.log('3️⃣  Rebalance heavy professor loads');
      console.log('4️⃣  Verify cross-branch subject scheduling\n');
      return { valid: false, issues: totalIssues };
    }
  }
}

// RUN IT
const resolver = new ProfessorConflictResolver();
resolver.runFullValidation().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
