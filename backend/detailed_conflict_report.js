#!/usr/bin/env node

/**
 * Detailed Conflict Analysis Report Generator
 * Extracts specific instances of each conflict type with professor names, subjects, times, batches
 */

const pool = require('./src/config/db');

class DetailedConflictAnalyzer {
  constructor() {
    this.conflicts = {
      professorDoubleBooking: [],
      labTheoryOverlap: [],
      batchTimeConflict: [],
      reservedTimeViolation: []
    };
  }

  async analyze() {
    console.log(`
╔════════════════════════════════════════════════════════════════════╗
║          DETAILED CONFLICT ANALYSIS REPORT GENERATOR                ║
║                                                                     ║
║ Generating specific conflict examples with full details:            ║
║ ✓ Professor double-bookings with names & subjects                  ║
║ ✓ Lab + Theory overlaps with batch info                            ║
║ ✓ Batch time conflicts with both subjects                          ║
║ ✓ Reserved time violations                                         ║
╚════════════════════════════════════════════════════════════════════╝
    `);

    try {
      // Fetch all timetable data with professor & subject details
      console.log('\n[1/4] Fetching complete timetable data with relationships...');
      const entries = await this.fetchCompleteData();
      console.log(`✓ Loaded ${entries.length} slots\n`);

      // Analyze each conflict type
      console.log('[2/4] Analyzing professor double-bookings...');
      await this.analyzeProfessorConflicts(entries);

      console.log('[3/4] Analyzing lab + theory overlaps...');
      await this.analyzeLabTheoryConflicts(entries);

      console.log('[4/4] Analyzing batch time conflicts & reserved time violations...');
      await this.analyzeBatchAndReservedConflicts(entries);

      // Generate report
      this.generateDetailedReport();

      return true;
    } catch (error) {
      console.error('Error:', error.message);
      return false;
    }
  }

  async fetchCompleteData() {
    const query = `
      SELECT 
        t.timetable_id as id,
        t.branch_id,
        b.name as branch_name,
        t.semester,
        t.day_of_week as day,
        t.time_slot_start as start_time,
        t.time_slot_end as end_time,
        t.slot_type as type,
        s.subject_name,
        s.subject_code,
        p.professor_name,
        p.professor_id,
        bat.batch_letter,
        t.room_id
      FROM timetable t
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN batches bat ON t.batch_id = bat.batch_id
      ORDER BY t.branch_id, t.semester, t.day_of_week, t.time_slot_start
    `;

    const result = await pool.query(query);
    return result.rows;
  }

  async analyzeProfessorConflicts(entries) {
    const profDaySchedule = new Map();

    // Group by professor-day
    entries.forEach(entry => {
      if (!entry.professor_id) return;
      const key = `${entry.professor_id}-${entry.day}`;
      if (!profDaySchedule.has(key)) {
        profDaySchedule.set(key, []);
      }
      profDaySchedule.get(key).push(entry);
    });

    // Find conflicts
    for (const [key, schedule] of profDaySchedule) {
      for (let i = 0; i < schedule.length; i++) {
        for (let j = i + 1; j < schedule.length; j++) {
          const e1 = schedule[i];
          const e2 = schedule[j];

          if (this.timesOverlap(e1.start_time, e1.end_time, e2.start_time, e2.end_time)) {
            // Only report once per conflict pair
            if (i < j) {
              this.conflicts.professorDoubleBooking.push({
                professor: e1.professor_name || 'Unknown',
                day: e1.day,
                time: `${this.formatTime(e1.start_time)}-${this.formatTime(e1.end_time)}`,
                conflict1: {
                  branch: e1.branch_name,
                  semester: e1.semester,
                  subject: e1.subject_name || 'N/A',
                  type: e1.type
                },
                conflict2: {
                  branch: e2.branch_name,
                  semester: e2.semester,
                  subject: e2.subject_name || 'N/A',
                  type: e2.type
                },
                severity: 'CRITICAL'
              });
            }
          }
        }
      }
    }
  }

  async analyzeLabTheoryConflicts(entries) {
    const byBranchSemDay = new Map();

    entries.forEach(entry => {
      const key = `${entry.branch_id}-${entry.semester}-${entry.day}`;
      if (!byBranchSemDay.has(key)) {
        byBranchSemDay.set(key, []);
      }
      byBranchSemDay.get(key).push(entry);
    });

    for (const [key, dayEntries] of byBranchSemDay) {
      const byTime = new Map();
      dayEntries.forEach(entry => {
        const timeKey = `${entry.start_time}-${entry.end_time}`;
        if (!byTime.has(timeKey)) {
          byTime.set(timeKey, []);
        }
        byTime.get(timeKey).push(entry);
      });

      for (const [timeKey, timeEntries] of byTime) {
        const types = new Set(timeEntries.map(e => e.type));
        if (types.has('LAB') && types.has('THEORY')) {
          const labs = timeEntries.filter(e => e.type === 'LAB');
          const theories = timeEntries.filter(e => e.type === 'THEORY');

          theories.forEach(theory => {
            this.conflicts.labTheoryOverlap.push({
              branch: theory.branch_name,
              semester: theory.semester,
              day: theory.day,
              time: `${this.formatTime(theory.start_time)}-${this.formatTime(theory.end_time)}`,
              theory: {
                subject: theory.subject_name,
                professor: theory.professor_name,
                batch: theory.batch_letter || 'COMMON'
              },
              concurrentLabs: labs.map(l => ({
                subject: l.subject_name,
                batch: l.batch_letter,
                professor: l.professor_name
              })),
              issue: 'Same batch cannot attend lab and theory simultaneously',
              severity: 'CRITICAL'
            });
          });
        }
      }
    }
  }

  async analyzeBatchAndReservedConflicts(entries) {
    // Batch time conflicts
    const byBatchDayTime = new Map();
    entries.forEach(entry => {
      if (!entry.batch_letter) return;
      const key = `${entry.branch_id}-${entry.semester}-${entry.batch_letter}-${entry.day}-${entry.start_time}-${entry.end_time}`;
      if (!byBatchDayTime.has(key)) {
        byBatchDayTime.set(key, []);
      }
      byBatchDayTime.get(key).push(entry);
    });

    for (const [key, activities] of byBatchDayTime) {
      if (activities.length > 1) {
        this.conflicts.batchTimeConflict.push({
          branch: activities[0].branch_name,
          semester: activities[0].semester,
          batch: activities[0].batch_letter,
          day: activities[0].day,
          time: `${this.formatTime(activities[0].start_time)}-${this.formatTime(activities[0].end_time)}`,
          activities: activities.map(a => ({
            subject: a.subject_name,
            type: a.type,
            professor: a.professor_name
          })),
          issue: 'Batch assigned multiple concurrent activities',
          severity: 'CRITICAL'
        });
      }
    }

    // Reserved time violations
    const reserved = entries.filter(e => ['LIBRARY', 'PROJECT', 'BREAK', 'RECESS'].includes(e.type));
    const classes = entries.filter(e => ['THEORY', 'LAB'].includes(e.type));

    classes.forEach(cls => {
      reserved.forEach(res => {
        if (cls.day === res.day && this.timesOverlap(cls.start_time, cls.end_time, res.start_time, res.end_time)) {
          this.conflicts.reservedTimeViolation.push({
            branch: cls.branch_name,
            semester: cls.semester,
            day: cls.day,
            time: `${this.formatTime(cls.start_time)}-${this.formatTime(cls.end_time)}`,
            classActivity: {
              subject: cls.subject_name,
              type: cls.type,
              batch: cls.batch_letter || 'ALL'
            },
            reservedTime: res.type,
            issue: `${cls.type} scheduled during exclusive ${res.type} hour`,
            severity: 'WARNING'
          });
        }
      });
    });
  }

  generateDetailedReport() {
    console.log('\n\n' + '═'.repeat(80));
    console.log('DETAILED CONFLICT ANALYSIS REPORT');
    console.log('═'.repeat(80) + '\n');

    // Section 1: Professor Double-Bookings
    console.log('📍 SECTION 1: PROFESSOR DOUBLE-BOOKING CONFLICTS');
    console.log('─'.repeat(80));
    console.log(`Total: ${this.conflicts.professorDoubleBooking.length} instances\n`);

    if (this.conflicts.professorDoubleBooking.length > 0) {
      // Show first 10 examples
      this.conflicts.professorDoubleBooking.slice(0, 10).forEach((conf, idx) => {
        console.log(`${idx + 1}. Professor: ${conf.professor}`);
        console.log(`   Day: ${conf.day} at ${conf.time}`);
        console.log(`   Conflict 1: ${conf.conflict1.branch} Sem ${conf.conflict1.semester}`);
        console.log(`              ${conf.conflict1.subject} (${conf.conflict1.type})`);
        console.log(`   Conflict 2: ${conf.conflict2.branch} Sem ${conf.conflict2.semester}`);
        console.log(`              ${conf.conflict2.subject} (${conf.conflict2.type})`);
        console.log(`   Status: ❌ CRITICAL - Professor cannot teach both classes\n`);
      });

      if (this.conflicts.professorDoubleBooking.length > 10) {
        console.log(`... and ${this.conflicts.professorDoubleBooking.length - 10} more professor conflicts\n`);
      }
    }

    // Section 2: Lab + Theory Overlaps
    console.log('\n' + '═'.repeat(80));
    console.log('📍 SECTION 2: LAB + THEORY OVERLAP CONFLICTS');
    console.log('─'.repeat(80));
    console.log(`Total: ${this.conflicts.labTheoryOverlap.length} instances\n`);

    if (this.conflicts.labTheoryOverlap.length > 0) {
      this.conflicts.labTheoryOverlap.slice(0, 10).forEach((conf, idx) => {
        console.log(`${idx + 1}. ${conf.branch} Semester ${conf.semester} - Batch ${conf.theory.batch || 'COMMON'}`);
        console.log(`   Day: ${conf.day} at ${conf.time}`);
        console.log(`   THEORY: ${conf.theory.subject}`);
        console.log(`   Concurrent LABS:`);
        conf.concurrentLabs.forEach(lab => {
          console.log(`     - ${lab.subject} (Batch ${lab.batch})`);
        });
        console.log(`   Status: ❌ CRITICAL - ${conf.issue}\n`);
      });

      if (this.conflicts.labTheoryOverlap.length > 10) {
        console.log(`... and ${this.conflicts.labTheoryOverlap.length - 10} more lab+theory conflicts\n`);
      }
    }

    // Section 3: Batch Time Conflicts
    console.log('\n' + '═'.repeat(80));
    console.log('📍 SECTION 3: BATCH TIME ASSIGNMENT CONFLICTS');
    console.log('─'.repeat(80));
    console.log(`Total: ${this.conflicts.batchTimeConflict.length} instances\n`);

    if (this.conflicts.batchTimeConflict.length > 0) {
      this.conflicts.batchTimeConflict.slice(0, 5).forEach((conf, idx) => {
        console.log(`${idx + 1}. ${conf.branch} Sem ${conf.semester} - Batch ${conf.batch}`);
        console.log(`   Day: ${conf.day} at ${conf.time}`);
        console.log(`   Multiple Activities Assigned:`);
        conf.activities.forEach(act => {
          console.log(`     - ${act.subject} (${act.type})`);
        });
        console.log(`   Status: ❌ CRITICAL - ${conf.issue}\n`);
      });

      if (this.conflicts.batchTimeConflict.length > 5) {
        console.log(`... and ${this.conflicts.batchTimeConflict.length - 5} more batch conflicts\n`);
      }
    }

    // Section 4: Reserved Time Violations
    console.log('\n' + '═'.repeat(80));
    console.log('📍 SECTION 4: RESERVED TIME SLOT VIOLATIONS');
    console.log('─'.repeat(80));
    console.log(`Total: ${this.conflicts.reservedTimeViolation.length} instances\n`);

    if (this.conflicts.reservedTimeViolation.length > 0) {
      this.conflicts.reservedTimeViolation.slice(0, 10).forEach((conf, idx) => {
        console.log(`${idx + 1}. ${conf.branch} Semester ${conf.semester}`);
        console.log(`   Day: ${conf.day} at ${conf.time}`);
        console.log(`   Class: ${conf.classActivity.subject} (${conf.classActivity.type})`);
        console.log(`   Reserved For: ${conf.reservedTime} (EXCLUSIVE)`);
        console.log(`   Status: ⚠️ WARNING - ${conf.issue}\n`);
      });

      if (this.conflicts.reservedTimeViolation.length > 10) {
        console.log(`... and ${this.conflicts.reservedTimeViolation.length - 10} more reserved time violations\n`);
      }
    }

    // Summary
    console.log('═'.repeat(80));
    console.log('CONFLICT SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Professor Double-Bookings:    ${this.conflicts.professorDoubleBooking.length}`);
    console.log(`Lab + Theory Overlaps:        ${this.conflicts.labTheoryOverlap.length}`);
    console.log(`Batch Time Conflicts:         ${this.conflicts.batchTimeConflict.length}`);
    console.log(`Reserved Time Violations:     ${this.conflicts.reservedTimeViolation.length}`);
    console.log(`─`.repeat(80));
    console.log(`TOTAL CONFLICT INSTANCES:     ${
      this.conflicts.professorDoubleBooking.length + 
      this.conflicts.labTheoryOverlap.length + 
      this.conflicts.batchTimeConflict.length + 
      this.conflicts.reservedTimeViolation.length
    }\n`);

    console.log('STATUS: ❌ UNRESOLVED');
    console.log('ACTION: Run "node regenerate_all_timetables.js" to fix all conflicts\n');
  }

  // Helpers
  timesOverlap(start1, end1, start2, end2) {
    return start1 < end2 && start2 < end1;
  }

  formatTime(time) {
    if (typeof time === 'string') {
      return time.substring(0, 5); // HH:MM
    }
    return time;
  }
}

// Main
const analyzer = new DetailedConflictAnalyzer();
analyzer.analyze()
  .then(() => {
    console.log('✅ Report generation complete\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
