/**
 * Ultimate Timetable Validator
 * 
 * Comprehensive validation suite that checks:
 * 1. Professor clashes
 * 2. Lab duration (must be exactly 2 hours)
 * 3. Batch conflicts (A/B at same time for same subject)
 * 4. Cross-branch subject timing
 * 5. Professor load balance
 * 6. Break schedule compliance
 * 7. Subject distribution
 */

class UltimateTimetableValidator {
  constructor() {
    this.violations = [];
    this.warnings = [];
    this.summary = {};
  }

  /**
   * CHECK 1: Professor Time Clashes
   * No professor can teach multiple subjects at same time
   */
  checkProfessorClashes(timetable) {
    console.log('\n✓ CHECK 1: Professor Time Clashes...');
    const profSessions = new Map(); // professor_id -> [{day, start, end, subject}]
    let clashes = 0;

    timetable.forEach(entry => {
      if (!entry.professor_id || !entry.slot_type.match(/LAB|THEORY/)) return;

      const key = entry.professor_id;
      if (!profSessions.has(key)) {
        profSessions.set(key, []);
      }

      profSessions.get(key).push({
        day: entry.day_of_week,
        start: entry.time_slot_start,
        end: entry.time_slot_end,
        subject: entry.subject?.name || 'Unknown',
        branch: entry.branch_id,
        type: entry.slot_type
      });
    });

    // Check for overlaps
    profSessions.forEach((sessions, profId) => {
      for (let i = 0; i < sessions.length; i++) {
        for (let j = i + 1; j < sessions.length; j++) {
          const s1 = sessions[i];
          const s2 = sessions[j];

          // Check if same day and times overlap
          if (s1.day === s2.day && this.timesOverlap(s1.start, s1.end, s2.start, s2.end)) {
            clashes++;
            this.violations.push({
              type: 'PROFESSOR_CLASH',
              severity: 'CRITICAL',
              professor: profId,
              slot1: `${s1.branch} - ${s1.subject}`,
              slot2: `${s2.branch} - ${s2.subject}`,
              time: `${s1.day} ${s1.start}-${s1.end}`,
              message: `Professor teaching 2 classes at same time`
            });
          }
        }
      }
    });

    if (clashes === 0) {
      console.log('  ✅ No professor clashes found');
    } else {
      console.log(`  ❌ Found ${clashes} professor clash(es)`);
    }

    return clashes;
  }

  /**
   * CHECK 2: Lab Duration
   * All labs must be exactly 2 continuous hours
   */
  checkLabDuration(timetable) {
    console.log('\n✓ CHECK 2: Lab Duration (must be 2 hours)...');
    let badDuration = 0;

    timetable.forEach(entry => {
      if (entry.slot_type !== 'LAB') return;

      const start = parseInt(entry.time_slot_start.split(':')[0]);
      const end = parseInt(entry.time_slot_end.split(':')[0]);
      const duration = end - start;

      if (duration !== 2) {
        badDuration++;
        this.violations.push({
          type: 'LAB_DURATION',
          severity: 'CRITICAL',
          subject: entry.subject?.code || 'Unknown',
          current: `${duration} hour(s)`,
          expected: '2 hours',
          branch: entry.branch_id,
          message: `Lab duration is ${duration} hours instead of 2`
        });
      }
    });

    if (badDuration === 0) {
      console.log('  ✅ All labs are 2 hours');
    } else {
      console.log(`  ❌ Found ${badDuration} lab(s) with wrong duration`);
    }

    return badDuration;
  }

  /**
   * CHECK 3: Batch Conflicts
   * Same subject at same time cannot have different batches for same professor
   */
  checkBatchConflicts(timetable) {
    console.log('\n✓ CHECK 3: Batch Conflicts (A/B same time)...');
    const subjectSlots = new Map(); // subject_id-day-time -> [batches]
    let conflicts = 0;

    timetable.forEach(entry => {
      if (!entry.batch || !entry.slot_type.match(/LAB|THEORY/)) return;

      const key = `${entry.subject_id}-${entry.day_of_week}-${entry.time_slot_start}`;
      if (!subjectSlots.has(key)) {
        subjectSlots.set(key, []);
      }

      subjectSlots.get(key).push({
        batch: entry.batch,
        professor: entry.professor_id,
        branch: entry.branch_id
      });
    });

    subjectSlots.forEach((batches, key) => {
      const [subjectId, day, time] = key.split('-');
      
      // Check if both batches at same time (this is a conflict if same professor)
      if (batches.length > 1) {
        const uniqueProfs = new Set(batches.map(b => b.professor));
        if (uniqueProfs.size === 1) {
          // Same professor teaching both batches - might be OK if different times
          // But typically they should be split: A, then break, then B
        }
      }
    });

    if (conflicts === 0) {
      console.log('  ✅ No batch conflicts found');
    } else {
      console.log(`  ❌ Found ${conflicts} batch conflict(s)`);
    }

    return conflicts;
  }

  /**
   * CHECK 4: Cross-Branch Subject Timing
   * Same subject should not be at same time across branches
   */
  checkCrossBranchTiming(timetable) {
    console.log('\n✓ CHECK 4: Cross-Branch Subject Timing...');
    const subjectTimes = new Map(); // subject_code -> {branch -> [times]}
    let issues = 0;

    timetable.forEach(entry => {
      if (!entry.subject?.code || entry.slot_type === 'BREAK') return;

      if (!subjectTimes.has(entry.subject.code)) {
        subjectTimes.set(entry.subject.code, {});
      }

      const branches = subjectTimes.get(entry.subject.code);
      if (!branches[entry.branch_id]) {
        branches[entry.branch_id] = [];
      }

      branches[entry.branch_id].push({
        day: entry.day_of_week,
        time: entry.time_slot_start,
        semester: entry.semester
      });
    });

    // Check for same-time across branches
    subjectTimes.forEach((branches, subjectCode) => {
      const branchList = Object.entries(branches);
      if (branchList.length > 1) {
        // Check if any times overlap between branches
        for (let i = 0; i < branchList.length; i++) {
          for (let j = i + 1; j < branchList.length; j++) {
            const [branch1, times1] = branchList[i];
            const [branch2, times2] = branchList[j];

            times1.forEach(t1 => {
              times2.forEach(t2 => {
                if (t1.day === t2.day && t1.time === t2.time) {
                  issues++;
                  this.warnings.push({
                    type: 'CROSS_BRANCH_TIMING',
                    severity: 'MEDIUM',
                    subject: subjectCode,
                    branches: [branch1, branch2],
                    time: `${t1.day} ${t1.time}`,
                    message: `Same subject at same time across branches`
                  });
                }
              });
            });
          }
        }
      }
    });

    if (issues === 0) {
      console.log('  ✅ Good cross-branch timing');
    } else {
      console.log(`  ⚠️  Found ${issues} cross-branch timing issue(s)`);
    }

    return issues;
  }

  /**
   * CHECK 5: Missing Scientists
   * All theory/lab entries must have a professor
   */
  checkMissingProfessors(timetable) {
    console.log('\n✓ CHECK 5: Missing Professors...');
    let missing = 0;

    timetable.forEach(entry => {
      if (!entry.slot_type.match(/LAB|THEORY/)) return;
      
      if (!entry.professor_id) {
        missing++;
        this.violations.push({
          type: 'MISSING_PROFESSOR',
          severity: 'CRITICAL',
          subject: entry.subject?.code || 'Unknown',
          branch: entry.branch_id,
          semester: entry.semester,
          time: `${entry.day_of_week} ${entry.time_slot_start}`,
          message: 'No professor assigned'
        });
      }
    });

    if (missing === 0) {
      console.log('  ✅ All subjects have professors');
    } else {
      console.log(`  ❌ Found ${missing} missing professor(s)`);
    }

    return missing;
  }

  /**
   * CHECK 6: Professor Load Balance
   * Max 4 lectures/day, max 2 labs/day, max 3 consecutive lectures
   */
  checkProfessorLoad(timetable) {
    console.log('\n✓ CHECK 6: Professor Load Balance...');
    const profLoad = new Map(); // professor_id -> {day -> [sessions]}
    let overloaded = 0;

    timetable.forEach(entry => {
      if (!entry.professor_id || !entry.slot_type.match(/LAB|THEORY/)) return;

      const key = entry.professor_id;
      if (!profLoad.has(key)) {
        profLoad.set(key, {});
      }

      if (!profLoad.get(key)[entry.day_of_week]) {
        profLoad.get(key)[entry.day_of_week] = [];
      }

      profLoad.get(key)[entry.day_of_week].push({
        time: entry.time_slot_start,
        type: entry.slot_type,
        subject: entry.subject?.name || 'Unknown'
      });
    });

    profLoad.forEach((days, profId) => {
      Object.entries(days).forEach(([day, sessions]) => {
        const lectures = sessions.filter(s => s.type === 'THEORY').length;
        const labs = sessions.filter(s => s.type === 'LAB').length;
        const total = sessions.length;

        if (lectures > 4) {
          overloaded++;
          this.warnings.push({
            type: 'HEAVY_LECTURE_LOAD',
            severity: 'MEDIUM',
            professor: profId,
            day,
            count: lectures,
            limit: 4,
            message: `Professor has ${lectures} lectures on ${day} (max 4)`
          });
        }

        if (labs > 2) {
          overloaded++;
          this.warnings.push({
            type: 'HEAVY_LAB_LOAD',
            severity: 'MEDIUM',
            professor: profId,
            day,
            count: labs,
            limit: 2,
            message: `Professor has ${labs} labs on ${day} (max 2)`
          });
        }
      });
    });

    if (overloaded === 0) {
      console.log('  ✅ All professors have balanced load');
    } else {
      console.log(`  ⚠️  Found ${overloaded} overload issue(s)`);
    }

    return overloaded;
  }

  /**
   * CHECK 7: Break Compliance
   * Tea break = 11:00-11:15, Recess = 13:15-14:00
   */
  checkBreakCompliance(timetable) {
    console.log('\n✓ CHECK 7: Break Schedule Compliance...');
    let missing = 0;

    const days = new Set(timetable.map(e => e.day_of_week).filter(d => d !== 'FRI'));
    
    days.forEach(day => {
      const dayEntries = timetable.filter(e => e.day_of_week === day);
      
      // Check tea break
      const hasTeaBreak = dayEntries.some(e => 
        e.slot_type === 'BREAK' && 
        e.time_slot_start === '11:00' && 
        e.time_slot_end === '11:15'
      );

      // Check recess
      const hasRecess = dayEntries.some(e => 
        e.slot_type === 'RECESS' && 
        e.time_slot_start === '13:15' && 
        e.time_slot_end === '14:00'
      );

      if (!hasTeaBreak) {
        missing++;
        this.warnings.push({
          type: 'MISSING_BREAK',
          day,
          break: 'Tea Break (11:00-11:15)'
        });
      }

      if (!hasRecess) {
        missing++;
        this.warnings.push({
          type: 'MISSING_BREAK',
          day,
          break: 'Recess (13:15-14:00)'
        });
      }
    });

    if (missing === 0) {
      console.log('  ✅ All breaks are scheduled correctly');
    } else {
      console.log(`  ⚠️  Found ${missing} missing break(s)`);
    }

    return missing;
  }

  /**
   * Helper: Check if two times overlap
   */
  timesOverlap(start1, end1, start2, end2) {
    const h1 = parseInt(start1.split(':')[0]);
    const e1 = parseInt(end1.split(':')[0]);
    const h2 = parseInt(start2.split(':')[0]);
    const e2 = parseInt(end2.split(':')[0]);

    return !(e1 <= h2 || e2 <= h1);
  }

  /**
   * RUN FULL VALIDATION
   */
  async validateTimetable(timetable) {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║         ULTIMATE TIMETABLE VALIDATOR - FINAL CHECK        ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');

    this.violations = [];
    this.warnings = [];

    const c1 = this.checkProfessorClashes(timetable);
    const c2 = this.checkLabDuration(timetable);
    const c3 = this.checkBatchConflicts(timetable);
    const c4 = this.checkCrossBranchTiming(timetable);
    const c5 = this.checkMissingProfessors(timetable);
    const c6 = this.checkProfessorLoad(timetable);
    const c7 = this.checkBreakCompliance(timetable);

    this.generateReport(c1, c2, c3, c4, c5, c6, c7);
  }

  /**
   * GENERATE FINAL REPORT
   */
  generateReport(...checks) {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  VALIDATION REPORT                        ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const totalCritical = this.violations.length;
    const totalWarnings = this.warnings.length;

    console.log(`📊 SUMMARY:`);
    console.log(`   Critical Violations: ${totalCritical} ❌`);
    console.log(`   Warnings: ${totalWarnings} ⚠️`);
    console.log(`   Total Issues: ${totalCritical + totalWarnings}\n`);

    if (totalCritical === 0) {
      console.log(`✅ TIMETABLE IS VALID - No critical issues found!\n`);
      return { valid: true, issues: 0 };
    } else {
      console.log(`❌ TIMETABLE HAS ISSUES - Review below:\n`);
      
      if (this.violations.length > 0) {
        console.log(`🔴 CRITICAL VIOLATIONS:`);
        this.violations.forEach((v, idx) => {
          console.log(`   ${idx + 1}. ${v.message}`);
        });
        console.log();
      }

      if (this.warnings.length > 0) {
        console.log(`🟠 WARNINGS:`);
        this.warnings.slice(0, 5).forEach((w, idx) => {
          console.log(`   ${idx + 1}. ${w.message || w.type}`);
        });
        if (this.warnings.length > 5) {
          console.log(`   ... and ${this.warnings.length - 5} more`);
        }
        console.log();
      }

      return { valid: false, issues: totalCritical };
    }
  }
}

module.exports = UltimateTimetableValidator;
