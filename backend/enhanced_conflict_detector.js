#!/usr/bin/env node

/**
 * Enhanced Timetable Conflict Detection Engine
 * 
 * Detects:
 * 1. Lab + Theory overlaps (same batch, same subject)
 * 2. Professor double-booking (global, cross-branch)
 * 3. Same subject scheduled at same time in different branches
 * 4. Batch time conflicts
 * 5. Cross-batch professor conflicts
 * 
 * Provides detailed reporting with:
 * - Conflict type
 * - Severity level
 * - Affected entities (subjects, professors, batches, branches)
 * - Recommended fixes
 */

const pool = require('./src/config/db');

class EnhancedConflictDetector {
  constructor() {
    this.conflicts = [];
    this.warnings = [];
  }

  async detect() {
    console.log(`
╔════════════════════════════════════════════════════════════════════╗
║          ENHANCED CONFLICT DETECTION ENGINE                        ║
║                                                                     ║
║ Checking for:                                                       ║
║ ✓ Lab + Theory overlaps (same batch)                               ║
║ ✓ Professor double-booking (global)                                ║
║ ✓ Cross-branch same-subject conflicts                              ║
║ ✓ Batch time conflicts                                             ║
║ ✓ Cross-batch professor conflicts                                  ║
╚════════════════════════════════════════════════════════════════════╝
    `);

    try {
      // 1. Check Lab + Theory Overlaps
      console.log('\n[1/5] Checking Lab + Theory overlaps...');
      await this.checkLabTheoryOverlaps();

      // 2. Check Professor Double-Booking
      console.log('\n[2/5] Checking professor double-booking (global)...');
      await this.checkProfessorDoubleBooking();

      // 3. Check Same Subject Cross-Branch Conflicts
      console.log('\n[3/5] Checking same subject cross-branch conflicts...');
      await this.checkCrossSubjectBranchConflicts();

      // 4. Check Batch Time Conflicts
      console.log('\n[4/5] Checking batch time conflicts...');
      await this.checkBatchTimeConflicts();

      // 5. Check Cross-Batch Professor Overload
      console.log('\n[5/5] Checking cross-batch professor overload...');
      await this.checkProfessorOverload();

      this.printReport();
    } catch (error) {
      console.error('Error during conflict detection:', error);
    }
  }

  /**
   * Conflict Type 1: Lab + Theory Overlaps
   * Same batch, same subject, overlapping times = CRITICAL
   */
  async checkLabTheoryOverlaps() {
    const query = `
      SELECT 
        t1.timetable_id as id1,
        t1.branch_id, 
        t1.semester,
        t1.day_of_week,
        t1.time_slot_start as start1,
        t1.time_slot_end as end1,
        t1.slot_type as type1,
        t1.subject_id,
        s.name as subject_name,
        t1.batch_id,
        b.batch_number,
        p.name as professor_name
      FROM timetable t1
      JOIN timetable t2 ON 
        t1.subject_id = t2.subject_id AND
        t1.branch_id = t2.branch_id AND
        t1.semester = t2.semester AND
        t1.day_of_week = t2.day_of_week AND
        t1.batch_id = t2.batch_id AND
        t1.slot_type != t2.slot_type
      LEFT JOIN subjects s ON t1.subject_id = s.subject_id
      LEFT JOIN batches b ON t1.batch_id = b.batch_id
      LEFT JOIN professors p ON t1.professor_id = p.professor_id
      WHERE 
        t1.slot_type = 'LAB' AND t2.slot_type = 'THEORY' AND
        -- Check for time overlap
        (
          (t1.time_slot_start < t2.time_slot_end AND t1.time_slot_end > t2.time_slot_start) OR
          (t2.time_slot_start < t1.time_slot_end AND t2.time_slot_end > t1.time_slot_start)
        )
      ORDER BY t1.branch_id, t1.semester, t1.day_of_week, t1.time_slot_start
    `;

    try {
      const result = await pool.query(query);
      
      if (result.rows.length === 0) {
        console.log('  ✅ No lab + theory overlaps found!');
        return;
      }

      console.log(`  ⚠️ Found ${result.rows.length} lab + theory overlaps:`);

      for (const row of result.rows) {
        this.conflicts.push({
          type: 'LAB_THEORY_OVERLAP',
          severity: 'CRITICAL',
          detail: `${row.branch_id} Sem${row.semester} ${row.day_of_week} ${row.start1}-${row.end1}`,
          subject: row.subject_name,
          batch: row.batch_number,
          professor: row.professor_name,
          message: `${row.subject_name} LAB and THEORY scheduled simultaneously for ${row.batch_number}`,
          recommendation: 'Move THEORY lecture to a different time slot (after lab ends)'
        });
      }
    } catch (error) {
      console.error('  ❌ Error checking lab+theory overlaps:', error.message);
    }
  }

  /**
   * Conflict Type 2: Professor Double-Booking (Global)
   * Same professor teaching at overlapping times (any branch) = CRITICAL
   */
  async checkProfessorDoubleBooking() {
    const query = `
      SELECT 
        p.name as professor_name,
        p.professor_id,
        t1.day_of_week,
        t1.time_slot_start as start1,
        t1.time_slot_end as end1,
        t1.branch_id as branch1,
        t1.semester as sem1,
        s1.name as subject1,
        t2.branch_id as branch2,
        t2.semester as sem2,
        s2.name as subject2
      FROM timetable t1
      JOIN timetable t2 ON 
        t1.professor_id = t2.professor_id AND
        t1.day_of_week = t2.day_of_week AND
        t1.timetable_id < t2.timetable_id  -- Avoid duplicates
      JOIN professors p ON t1.professor_id = p.professor_id
      LEFT JOIN subjects s1 ON t1.subject_id = s1.subject_id
      LEFT JOIN subjects s2 ON t2.subject_id = s2.subject_id
      WHERE 
        t1.slot_type IN ('LAB', 'THEORY') AND
        t2.slot_type IN ('LAB', 'THEORY') AND
        -- Check for time overlap
        (
          (t1.time_slot_start < t2.time_slot_end AND t1.time_slot_end > t2.time_slot_start)
        )
      ORDER BY p.name, t1.day_of_week, t1.time_slot_start
    `;

    try {
      const result = await pool.query(query);
      
      if (result.rows.length === 0) {
        console.log('  ✅ No professor double-booking found!');
        return;
      }

      console.log(`  ⚠️ Found ${result.rows.length} professor double-bookings:`);

      for (const row of result.rows) {
        this.conflicts.push({
          type: 'PROFESSOR_DOUBLE_BOOKING',
          severity: 'CRITICAL',
          detail: `${row.professor_name} on ${row.day_of_week} ${row.start1}-${row.end1}`,
          professor: row.professor_name,
          subject1: row.subject1,
          subject2: row.subject2,
          branch1: row.branch1,
          branch2: row.branch2,
          message: `Professor ${row.professor_name} assigned to multiple subjects at same time`,
          recommendation: 'Move one of the subjects to a different time slot'
        });
      }
    } catch (error) {
      console.error('  ❌ Error checking professor double-booking:', error.message);
    }
  }

  /**
   * Conflict Type 3: Same Subject at Same Time in Different Branches
   * Same subject, different branches, overlapping times = WARNING/CRITICAL
   */
  async checkCrossSubjectBranchConflicts() {
    const query = `
      SELECT 
        s.name as subject_name,
        t1.branch_id as branch1,
        t1.semester as sem1,
        t1.day_of_week,
        t1.time_slot_start as start1,
        t1.time_slot_end as end1,
        t2.branch_id as branch2,
        t2.semester as sem2,
        p1.name as prof1,
        p2.name as prof2
      FROM timetable t1
      JOIN timetable t2 ON 
        t1.subject_id = t2.subject_id AND
        t1.branch_id != t2.branch_id AND  -- Different branches
        t1.day_of_week = t2.day_of_week AND
        t1.timetable_id < t2.timetable_id  -- Avoid duplicates
      JOIN subjects s ON t1.subject_id = s.subject_id
      LEFT JOIN professors p1 ON t1.professor_id = p1.professor_id
      LEFT JOIN professors p2 ON t2.professor_id = p2.professor_id
      WHERE 
        t1.slot_type IN ('LAB', 'THEORY') AND
        t2.slot_type IN ('LAB', 'THEORY') AND
        -- Check for time overlap
        (
          (t1.time_slot_start < t2.time_slot_end AND t1.time_slot_end > t2.time_slot_start)
        )
      ORDER BY s.name, t1.day_of_week, t1.time_slot_start
    `;

    try {
      const result = await pool.query(query);
      
      if (result.rows.length === 0) {
        console.log('  ✅ No cross-branch subject conflicts found!');
        return;
      }

      console.log(`  ⚠️ Found ${result.rows.length} cross-branch subject conflicts:`);

      for (const row of result.rows) {
        this.warnings.push({
          type: 'CROSS_BRANCH_SUBJECT',
          severity: 'MEDIUM',
          detail: `${row.subject_name} scheduled in ${row.branch1} and ${row.branch2}`,
          subject: row.subject_name,
          branch1: row.branch1,
          branch2: row.branch2,
          message: `${row.subject_name} taught simultaneously in different branches`,
          recommendation: 'Spread same subject to different times across branches to reduce resource pressure'
        });
      }
    } catch (error) {
      console.error('  ❌ Error checking cross-branch conflicts:', error.message);
    }
  }

  /**
   * Conflict Type 4: Batch Time Conflicts
   * Same batch assigned to multiple classes at same time = CRITICAL
   */
  async checkBatchTimeConflicts() {
    const query = `
      SELECT 
        b.batch_number,
        t1.branch_id,
        t1.semester,
        t1.day_of_week,
        t1.time_slot_start,
        t1.time_slot_end,
        COUNT(*) as conflict_count,
        STRING_AGG(DISTINCT s.name, ', ') as subjects
      FROM timetable t1
      JOIN batches b ON t1.batch_id = b.batch_id
      LEFT JOIN subjects s ON t1.subject_id = s.subject_id
      WHERE t1.slot_type IN ('LAB', 'THEORY')
      GROUP BY 
        b.batch_number, t1.branch_id, t1.semester, 
        t1.day_of_week, t1.time_slot_start, t1.time_slot_end
      HAVING COUNT(*) > 1
      ORDER BY b.batch_number, t1.day_of_week
    `;

    try {
      const result = await pool.query(query);
      
      if (result.rows.length === 0) {
        console.log('  ✅ No batch time conflicts found!');
        return;
      }

      console.log(`  ⚠️ Found ${result.rows.length} batch time slot conflicts:`);

      for (const row of result.rows) {
        this.conflicts.push({
          type: 'BATCH_TIME_CONFLICT',
          severity: 'CRITICAL',
          detail: `${row.batch_number} at ${row.day_of_week} ${row.time_slot_start}-${row.time_slot_end}`,
          batch: row.batch_number,
          conflictCount: row.conflict_count,
          subjects: row.subjects,
          message: `Batch ${row.batch_number} has ${row.conflict_count} classes at same time`,
          recommendation: 'Move one or more classes to different time slots'
        });
      }
    } catch (error) {
      console.error('  ❌ Error checking batch conflicts:', error.message);
    }
  }

  /**
   * Conflict Type 5: Professor Overload
   * Same professor teaching too many hours per day/week = WARNING
   */
  async checkProfessorOverload() {
    const query = `
      SELECT 
        p.name as professor_name,
        p.professor_id,
        t.day_of_week,
        COUNT(*) as class_count,
        SUM(EXTRACT(EPOCH FROM (t.time_slot_end::time - t.time_slot_start::time))/3600)::int as total_hours,
        STRING_AGG(DISTINCT b.branch_id || ' Sem' || t.semester, ', ') as branches
      FROM timetable t
      JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      WHERE t.slot_type IN ('LAB', 'THEORY')
      GROUP BY 
        p.name, p.professor_id, t.day_of_week
      HAVING 
        COUNT(*) > 4 OR  -- More than 4 classes in a day
        SUM(EXTRACT(EPOCH FROM (t.time_slot_end::time - t.time_slot_start::time))/3600) > 6  -- More than 6 hours
      ORDER BY p.name, total_hours DESC
    `;

    try {
      const result = await pool.query(query);
      
      if (result.rows.length === 0) {
        console.log('  ✅ No professor overload issues found!');
        return;
      }

      console.log(`  ⚠️ Found ${result.rows.length} professor overload issues:`);

      for (const row of result.rows) {
        this.warnings.push({
          type: 'PROFESSOR_OVERLOAD',
          severity: row.total_hours > 8 ? 'HIGH' : 'MEDIUM',
          detail: `${row.professor_name} on ${row.day_of_week}: ${row.total_hours} hours`,
          professor: row.professor_name,
          dayOfWeek: row.day_of_week,
          classCount: row.class_count,
          totalHours: row.total_hours,
          branches: row.branches,
          message: `Professor ${row.professor_name} has ${row.total_hours} teaching hours on ${row.day_of_week}`,
          recommendation: 'Redistribute classes across other days to balance workload'
        });
      }
    } catch (error) {
      console.error('  ❌ Error checking professor overload:', error.message);
    }
  }

  /**
   * Print comprehensive conflict report
   */
  printReport() {
    console.log('\n' + '═'.repeat(70));
    console.log('CONFLICT DETECTION REPORT');
    console.log('═'.repeat(70));

    if (this.conflicts.length === 0 && this.warnings.length === 0) {
      console.log('\n✅ NO CONFLICTS DETECTED! Timetable is clean.\n');
      return;
    }

    if (this.conflicts.length > 0) {
      console.log(`\n🔴 CRITICAL CONFLICTS FOUND: ${this.conflicts.length}\n`);
      
      this.conflicts.forEach((conflict, idx) => {
        console.log(`${idx + 1}. [${conflict.type}]`);
        console.log(`   ${conflict.message}`);
        console.log(`   Location: ${conflict.detail}`);
        if (conflict.recommendation) {
          console.log(`   Fix: ${conflict.recommendation}`);
        }
        console.log();
      });
    }

    if (this.warnings.length > 0) {
      console.log(`\n⚠️ WARNINGS: ${this.warnings.length}\n`);
      
      this.warnings.forEach((warning, idx) => {
        console.log(`${idx + 1}. [${warning.type}]`);
        console.log(`   ${warning.message}`);
        if (warning.recommendation) {
          console.log(`   Suggestion: ${warning.recommendation}`);
        }
        console.log();
      });
    }

    console.log('═'.repeat(70));
    console.log(`SUMMARY: ${this.conflicts.length} Critical | ${this.warnings.length} Warnings`);
    console.log('═'.repeat(70) + '\n');
    
    process.exit(this.conflicts.length > 0 ? 1 : 0);
  }
}

// Main execution
const detector = new EnhancedConflictDetector();
detector.detect();
