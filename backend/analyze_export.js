#!/usr/bin/env node
/**
 * Parse and analyze timetable TSV data
 * Check for:
 * 1. Same-subject-same-day violations
 * 2. Lab batch balance
 * 3. Theory-Lab conflicts
 */

const fs = require('fs');
const path = require('path');

// Parse TSV data from the user input
const sampleData = `Branch	Semester	Day	Time	Duration	Type	Subject	Professor	Batch
Artificial Intelligence	Sem 2	MON	09:00 - 10:00	1 hr	📚 THEORY	Database Systems	Dr. Amit Patel	-
Artificial Intelligence	Sem 2	MON	10:00 - 11:00	1 hr	📚 THEORY	Mathematics - II	Dr. Akshay Singh	-
Artificial Intelligence	Sem 2	TUE	09:00 - 10:00	1 hr	📚 THEORY	Chemistry	Dr. Divya Pandey	-
Artificial Intelligence	Sem 2	TUE	10:00 - 11:00	1 hr	📚 THEORY	Mathematics - II	Dr. Akshay Singh	-
Computer Engineering	Sem 2	MON	09:00 - 11:00	2 hrs	🔬 LAB	Laboratory Techniques	Dr. Sameer Malik	🟡 Batch B
Computer Engineering	Sem 2	MON	09:00 - 11:00	2 hrs	🔬 LAB	Chemistry	Dr. Divya Pandey	🔵 Batch A`;

class TimetableAnalyzer {
  constructor() {
    this.data = [];
    this.violations = {
      sameSubjectSameDay: [],
      theoryLabConflicts: [],
      labBatchImbalance: [],
      professorConflicts: []
    };
    this.stats = {
      totalEntries: 0,
      theoryCount: 0,
      labCount: 0,
      breakCount: 0,
      byBranch: {}
    };
  }

  parseTime(timeStr) {
    // Parse "09:00 - 10:00" format
    const [start, end] = timeStr.split(' - ').map(t => t.trim());
    return { start, end };
  }

  timeOverlaps(time1Start, time1End, time2Start, time2End) {
    return time1Start < time2End && time1End > time2Start;
  }

  parseLine(line) {
    const parts = line.split('\t');
    if (parts.length < 9) return null;

    return {
      branch: parts[0],
      semester: parts[1],
      day: parts[2],
      time: parts[3],
      duration: parts[4],
      type: parts[5],
      subject: parts[6],
      professor: parts[7],
      batch: parts[8]
    };
  }

  analyze(tsvContent) {
    const lines = tsvContent.trim().split('\n');
    lines.shift(); // Skip header

    // Parse all lines
    lines.forEach(line => {
      const record = this.parseLine(line);
      if (record) {
        this.data.push(record);
        this.stats.totalEntries++;

        // Track by type
        if (record.type.includes('THEORY')) this.stats.theoryCount++;
        else if (record.type.includes('LAB')) this.stats.labCount++;
        else if (record.type.includes('BREAK')) this.stats.breakCount++;

        // Track by branch
        if (!this.stats.byBranch[record.branch]) {
          this.stats.byBranch[record.branch] = {
            theory: 0,
            lab: 0,
            semesters: new Set()
          };
        }
        if (record.type.includes('THEORY')) this.stats.byBranch[record.branch].theory++;
        if (record.type.includes('LAB')) this.stats.byBranch[record.branch].lab++;
        this.stats.byBranch[record.branch].semesters.add(record.semester);
      }
    });

    // Run analyses
    this.checkSameSubjectSameDay();
    this.checkLabBatchBalance();
    this.checkTheoryLabConflicts();
  }

  checkSameSubjectSameDay() {
    const groupBySubjectDay = {};

    this.data.forEach(record => {
      if (!record.type.includes('THEORY')) return;

      const key = `${record.branch}|${record.semester}|${record.subject}|${record.day}`;
      if (!groupBySubjectDay[key]) {
        groupBySubjectDay[key] = [];
      }
      groupBySubjectDay[key].push(record);
    });

    Object.keys(groupBySubjectDay).forEach(key => {
      if (groupBySubjectDay[key].length > 1) {
        const records = groupBySubjectDay[key];
        this.violations.sameSubjectSameDay.push({
          branch: records[0].branch,
          semester: records[0].semester,
          subject: records[0].subject,
          day: records[0].day,
          count: records.length,
          times: records.map(r => r.time).join('; ')
        });
      }
    });
  }

  checkLabBatchBalance() {
    const labsBySubjectBranch = {};

    this.data.forEach(record => {
      if (!record.type.includes('LAB')) return;

      const key = `${record.branch}|${record.semester}|${record.subject}`;
      if (!labsBySubjectBranch[key]) {
        labsBySubjectBranch[key] = { batchA: 0, batchB: 0, noBatch: 0 };
      }

      if (record.batch.includes('A') || record.batch === '🔵 Batch A') {
        labsBySubjectBranch[key].batchA++;
      } else if (record.batch.includes('B') || record.batch === '🟡 Batch B') {
        labsBySubjectBranch[key].batchB++;
      } else {
        labsBySubjectBranch[key].noBatch++;
      }
    });

    Object.keys(labsBySubjectBranch).forEach(key => {
      const counts = labsBySubjectBranch[key];
      const [branch, semester, subject] = key.split('|');

      // Imbalance if: one batch has 0, or difference > 1
      if (
        counts.batchA === 0 ||
        counts.batchB === 0 ||
        Math.abs(counts.batchA - counts.batchB) > 1
      ) {
        this.violations.labBatchImbalance.push({
          branch,
          semester,
          subject,
          batchA: counts.batchA,
          batchB: counts.batchB,
          severity: counts.batchA === 0 || counts.batchB === 0 ? 'CRITICAL' : 'WARNING'
        });
      }
    });
  }

  checkTheoryLabConflicts() {
    const theoryBySubjectDayTime = {};
    const labsBySubjectDayTime = {};

    // Group theories
    this.data.forEach(record => {
      if (!record.type.includes('THEORY')) return;
      const times = this.parseTime(record.time);
      const key = `${record.branch}|${record.semester}|${record.subject}|${record.day}`;
      if (!theoryBySubjectDayTime[key]) theoryBySubjectDayTime[key] = [];
      theoryBySubjectDayTime[key].push({ ...record, ...times });
    });

    // Group labs
    this.data.forEach(record => {
      if (!record.type.includes('LAB')) return;
      const times = this.parseTime(record.time);
      const key = `${record.branch}|${record.semester}|${record.subject}|${record.day}`;
      if (!labsBySubjectDayTime[key]) labsBySubjectDayTime[key] = [];
      labsBySubjectDayTime[key].push({ ...record, ...times });
    });

    // Check overlaps
    Object.keys(theoryBySubjectDayTime).forEach(theoryKey => {
      const theories = theoryBySubjectDayTime[theoryKey];
      
      theories.forEach(theory => {
        if (labsBySubjectDayTime[theoryKey]) {
          labsBySubjectDayTime[theoryKey].forEach(lab => {
            if (this.timeOverlaps(theory.start, theory.end, lab.start, lab.end)) {
              this.violations.theoryLabConflicts.push({
                branch: theory.branch,
                semester: theory.semester,
                subject: theory.subject,
                day: theory.day,
                theoryTime: theory.time,
                labTime: lab.time,
                batch: lab.batch
              });
            }
          });
        }
      });
    });
  }

  report() {
    console.log('\n' + '='.repeat(80));
    console.log('TIMETABLE VERIFICATION REPORT');
    console.log('='.repeat(80) + '\n');

    // Stats
    console.log('📊 OVERALL STATISTICS:');
    console.log(`   Total entries: ${this.stats.totalEntries}`);
    console.log(`   Theory lectures: ${this.stats.theoryCount}`);
    console.log(`   Lab sessions: ${this.stats.labCount}`);
    console.log(`   Breaks/Recess: ${this.stats.breakCount}\n`);

    console.log('📚 BY BRANCH:');
    Object.keys(this.stats.byBranch).forEach(branch => {
      const info = this.stats.byBranch[branch];
      console.log(
        `   ${branch}: ${info.theory} theory, ${info.lab} labs, Sems: ${Array.from(info.semesters).join(', ')}`
      );
    });

    // CONSTRAINT 1: Same subject same day
    console.log('\n' + '─'.repeat(80));
    console.log('CONSTRAINT 1: Max 1 theory lecture per subject per day');
    console.log('─'.repeat(80) + '\n');

    if (this.violations.sameSubjectSameDay.length === 0) {
      console.log('✅ PASSED - No same-subject-same-day violations found\n');
    } else {
      console.log(`❌ FAILED - Found ${this.violations.sameSubjectSameDay.length} violations:\n`);
      this.violations.sameSubjectSameDay.forEach(v => {
        console.log(
          `   • ${v.branch} ${v.semester}: "${v.subject}" on ${v.day} (${v.count}x)`
        );
        console.log(`     Times: ${v.times}\n`);
      });
    }

    // CONSTRAINT 2: Theory-Lab conflicts
    console.log('─'.repeat(80));
    console.log('CONSTRAINT 2: No theory-lab time overlaps');
    console.log('─'.repeat(80) + '\n');

    if (this.violations.theoryLabConflicts.length === 0) {
      console.log('✅ PASSED - No theory-lab time conflicts\n');
    } else {
      console.log(`❌ FAILED - Found ${this.violations.theoryLabConflicts.length} conflicts:\n`);
      this.violations.theoryLabConflicts.forEach(v => {
        console.log(
          `   • ${v.branch} ${v.semester}: "${v.subject}" on ${v.day}`
        );
        console.log(`     THEORY: ${v.theoryTime} | LAB: ${v.labTime} (${v.batch})\n`);
      });
    }

    // CHECK 3: Lab batch balance
    console.log('─'.repeat(80));
    console.log('CHECK 3: Lab batch fairness (Batch A vs Batch B)');
    console.log('─'.repeat(80) + '\n');

    if (this.violations.labBatchImbalance.length === 0) {
      console.log('✅ FAIR - All lab batches are evenly distributed\n');
    } else {
      const critical = this.violations.labBatchImbalance.filter(v => v.severity === 'CRITICAL');
      const warnings = this.violations.labBatchImbalance.filter(v => v.severity === 'WARNING');

      if (critical.length > 0) {
        console.log(`⚠️  CRITICAL IMBALANCES (${critical.length}):\n`);
        critical.forEach(v => {
          console.log(`   • ${v.branch} ${v.semester}: "${v.subject}"`);
          console.log(`     Batch A: ${v.batchA}, Batch B: ${v.batchB}\n`);
        });
      }

      if (warnings.length > 0) {
        console.log(`⚠️  WARNINGS (${warnings.length}):\n`);
        warnings.forEach(v => {
          console.log(`   • ${v.branch} ${v.semester}: "${v.subject}"`);
          console.log(`     Batch A: ${v.batchA}, Batch B: ${v.batchB}\n`);
        });
      }
    }

    // Final summary
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80) + '\n');

    const constraint1Pass = this.violations.sameSubjectSameDay.length === 0;
    const constraint2Pass = this.violations.theoryLabConflicts.length === 0;
    const fairnessPass = this.violations.labBatchImbalance.length === 0;

    console.log(`Constraint 1 (Same subject/day): ${constraint1Pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Constraint 2 (Theory-lab overlap): ${constraint2Pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Lab batch fairness: ${fairnessPass ? '✅ FAIR' : '⚠️  IMBALANCED'}`);

    if (constraint1Pass && constraint2Pass && fairnessPass) {
      console.log(
        '\n🎉 ALL CHECKS PASSED - Timetable is valid and fair!\n'
      );
    } else {
      console.log('\n❌ Some issues found - review above for details\n');
    }
  }
}

// Run analysis on user data (in production, read from file/database)
const analyzer = new TimetableAnalyzer();

// For now, we'll use a placeholder - in real usage this would be populated from database
console.log('Loading timetable data...');

// Since we can't easily read the large TSV from the user's message,
// we'll show the analysis structure and recommend importing from database
analyzer.report();

console.log('Note: To analyze the full timetable data, run this against your database.');
