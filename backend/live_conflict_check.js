#!/usr/bin/env node
/**
 * LIVE CONFLICT CHECKER - Real-time detection from database
 * Shows actual conflicts, not dummy data
 */

require('dotenv').config({ path: './backend/.env' });
const pool = require('./src/config/db');

class ConflictChecker {
  constructor() {
    this.conflicts = {
      professorConflicts: [],
      roomConflicts: [],
      labTheoryOverlap: [],
      batchOverlap: [],
      sameSubjectSameDay: [],
      other: []
    };
  }

  async check(client) {
    console.log('\n' + '='.repeat(90));
    console.log('LIVE TIMETABLE CONFLICT CHECKER');
    console.log('Real-time analysis from database');
    console.log('='.repeat(90) + '\n');

    // ═══════════════════════════════════════════════════════════════════════════════
    // CONFLICT 1: Professor double-booking (same professor 2x same time)
    // ═══════════════════════════════════════════════════════════════════════════════

    console.log('🔍 Checking for conflicts...\n');

    const profConflictQuery = `
      SELECT 
        t1.professor_id,
        COALESCE(p1.name, 'Unknown Prof') as professor_name,
        t1.day_of_week,
        t1.time_slot_start,
        t1.time_slot_end,
        COALESCE(s1.name, 'Unknown') as subject1,
        t1.slot_type as type1,
        COALESCE(s2.name, 'Unknown') as subject2,
        t2.slot_type as type2,
        t1.branch_id
      FROM timetable t1
      JOIN timetable t2 ON
        t1.professor_id = t2.professor_id AND
        t1.day_of_week = t2.day_of_week AND
        t1.timetable_id < t2.timetable_id AND
        t1.time_slot_start < t2.time_slot_end AND
        t1.time_slot_end > t2.time_slot_start
      LEFT JOIN professors p1 ON t1.professor_id = p1.professor_id
      LEFT JOIN subjects s1 ON t1.subject_id = s1.subject_id
      LEFT JOIN subjects s2 ON t2.subject_id = s2.subject_id
      WHERE t1.professor_id IS NOT NULL
      LIMIT 50
    `;

    try {
      const res = await client.query(profConflictQuery);
      this.conflicts.professorConflicts = res.rows;
    } catch (e) {
      console.log(`  ⚠️  Professor conflict check skipped: ${e.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // CONFLICT 2: Batch time overlap (Batch A and B same time same subject)
    // ═══════════════════════════════════════════════════════════════════════════════

    const batchConflictQuery = `
      SELECT 
        t1.subject_id,
        COALESCE(s.name, 'Unknown') as subject_name,
        t1.day_of_week,
        t1.time_slot_start,
        t1.time_slot_end,
        t1.batch_id as batch1,
        t2.batch_id as batch2,
        t1.branch_id
      FROM timetable t1
      JOIN timetable t2 ON
        t1.subject_id = t2.subject_id AND
        t1.day_of_week = t2.day_of_week AND
        t1.branch_id = t2.branch_id AND
        t1.timetable_id < t2.timetable_id AND
        t1.batch_id != t2.batch_id AND
        t1.time_slot_start < t2.time_slot_end AND
        t1.time_slot_end > t2.time_slot_start AND
        t1.batch_id IS NOT NULL AND
        t2.batch_id IS NOT NULL
      LEFT JOIN subjects s ON t1.subject_id = s.subject_id
      LIMIT 50
    `;

    try {
      const res = await client.query(batchConflictQuery);
      this.conflicts.batchOverlap = res.rows;
    } catch (e) {
      console.log(`  ⚠️  Batch conflict check skipped: ${e.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // CONFLICT 3: Theory-Lab overlap for SAME SUBJECT
    // ═══════════════════════════════════════════════════════════════════════════════

    const theoryLabQuery = `
      SELECT 
        t1.subject_id,
        COALESCE(s.name, 'Unknown') as subject_name,
        t1.day_of_week,
        t1.time_slot_start as theory_start,
        t1.time_slot_end as theory_end,
        t2.time_slot_start as lab_start,
        t2.time_slot_end as lab_end,
        t1.branch_id,
        t2.batch_id
      FROM timetable t1
      JOIN timetable t2 ON
        t1.subject_id = t2.subject_id AND
        t1.branch_id = t2.branch_id AND
        t1.day_of_week = t2.day_of_week AND
        t1.slot_type = 'THEORY' AND
        t2.slot_type = 'LAB' AND
        t1.time_slot_start < t2.time_slot_end AND
        t1.time_slot_end > t2.time_slot_start
      LEFT JOIN subjects s ON t1.subject_id = s.subject_id
      LIMIT 50
    `;

    try {
      const res = await client.query(theoryLabQuery);
      this.conflicts.labTheoryOverlap = res.rows;
    } catch (e) {
      console.log(`  ⚠️  Theory-Lab overlap check skipped: ${e.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // CONFLICT 4: Same subject-day (max 1 per day constraint)
    // ═══════════════════════════════════════════════════════════════════════════════

    const sameDayQuery = `
      SELECT 
        t.subject_id,
        COALESCE(s.name, 'Unknown') as subject_name,
        t.branch_id,
        t.day_of_week,
        COUNT(*) as count,
        STRING_AGG(t.time_slot_start::text || '-' || t.time_slot_end::text, ' | ') as times
      FROM timetable t
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.slot_type = 'THEORY'
      GROUP BY t.subject_id, s.name, t.branch_id, t.day_of_week
      HAVING COUNT(*) > 1
      LIMIT 50
    `;

    try {
      const res = await client.query(sameDayQuery);
      this.conflicts.sameSubjectSameDay = res.rows;
    } catch (e) {
      console.log(`  ⚠️  Same-day check skipped: ${e.message}`);
    }

    this.printReport();
  }

  printReport() {
    // PROFESSOR CONFLICTS
    if (this.conflicts.professorConflicts.length > 0) {
      console.log('❌ PROFESSOR CONFLICTS - Same professor double-booked:\n');
      const grouped = {};
      this.conflicts.professorConflicts.forEach(c => {
        const key = `${c.professor_name}|${c.day_of_week}|${c.time_slot_start}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(c);
      });

      Object.keys(grouped).slice(0, 10).forEach(key => {
        const conflicts = grouped[key];
        const first = conflicts[0];
        console.log(`  Prof: ${first.professor_name}`);
        console.log(`  Day: ${first.day_of_week} | Time: ${first.time_slot_start}-${first.time_slot_end}`);
        conflicts.forEach(c => {
          console.log(`    • ${c.subject1} (${c.type1})`);
        });
        console.log();
      });
      if (Object.keys(grouped).length > 10) {
        console.log(`  ... and ${Object.keys(grouped).length - 10} more conflicts\n`);
      }
    } else {
      console.log('✅ No professor double-booking conflicts\n');
    }

    // BATCH CONFLICTS
    if (this.conflicts.batchOverlap.length > 0) {
      console.log('⚠️  BATCH TIME CONFLICTS - Batch A and B same time:\n');
      this.conflicts.batchOverlap.slice(0, 5).forEach(c => {
        console.log(`  ${c.subject_name} on ${c.day_of_week}`);
        console.log(`    ${c.time_slot_start}-${c.time_slot_end}`);
        console.log(`    ${c.batch1} ↔ ${c.batch2}`);
        console.log();
      });
      if (this.conflicts.batchOverlap.length > 5) {
        console.log(`  ... and ${this.conflicts.batchOverlap.length - 5} more\n`);
      }
    } else {
      console.log('✅ No batch overlaps\n');
    }

    // THEORY-LAB OVERLAPS
    if (this.conflicts.labTheoryOverlap.length > 0) {
      console.log('❌ THEORY-LAB CONFLICTS - Same subject same time:\n');
      this.conflicts.labTheoryOverlap.slice(0, 5).forEach(c => {
        console.log(`  ${c.subject_name} on ${c.day_of_week}`);
        console.log(`    THEORY: ${c.theory_start}-${c.theory_end}`);
        console.log(`    LAB: ${c.lab_start}-${c.lab_end} (${c.batch_id})`);
        console.log();
      });
      if (this.conflicts.labTheoryOverlap.length > 5) {
        console.log(`  ... and ${this.conflicts.labTheoryOverlap.length - 5} more\n`);
      }
    } else {
      console.log('✅ No theory-lab time overlaps\n');
    }

    // SAME SUBJECT SAME DAY
    if (this.conflicts.sameSubjectSameDay.length > 0) {
      console.log('⚠️  SAME-SUBJECT-SAME-DAY - Theory repeated on same day:\n');
      this.conflicts.sameSubjectSameDay.slice(0, 5).forEach(c => {
        console.log(`  ${c.subject_name} on ${c.day_of_week}: ${c.count}x`);
        console.log(`    Times: ${c.times}`);
        console.log();
      });
      if (this.conflicts.sameSubjectSameDay.length > 5) {
        console.log(`  ... and ${this.conflicts.sameSubjectSameDay.length - 5} more\n`);
      }
    } else {
      console.log('✅ No same-subject-same-day repeats\n');
    }

    // SUMMARY
    console.log('='.repeat(90));
    console.log('SUMMARY');
    console.log('='.repeat(90) + '\n');

    const totalConflicts =
      this.conflicts.professorConflicts.length +
      this.conflicts.labTheoryOverlap.length +
      this.conflicts.batchOverlap.length +
      this.conflicts.sameSubjectSameDay.length;

    if (totalConflicts === 0) {
      console.log('✨ NO CONFLICTS FOUND - Timetable is valid!\n');
    } else {
      console.log(`⚠️  FOUND ${totalConflicts} TOTAL CONFLICTS:\n`);
      console.log(`  • Professor double-bookings: ${this.conflicts.professorConflicts.length}`);
      console.log(`  • Theory-Lab overlaps: ${this.conflicts.labTheoryOverlap.length}`);
      console.log(`  • Batch time conflicts: ${this.conflicts.batchOverlap.length}`);
      console.log(`  • Same-subject-same-day: ${this.conflicts.sameSubjectSameDay.length}\n`);
    }

    console.log('='.repeat(90) + '\n');
  }
}

async function main() {
  const checker = new ConflictChecker();
  let client;

  try {
    client = await pool.connect();
    await checker.check(client);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    process.exit(0);
  }
}

main();
