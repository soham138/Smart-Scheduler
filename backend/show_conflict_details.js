const { Pool } = require('pg');
const db = require('./src/config/db');

// Color codes for output
const colors = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

async function showProfessorConflicts() {
  console.log(`\n${colors.bold}${colors.magenta}════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}PROFESSOR DOUBLE-BOOKING CONFLICTS (Top 10)${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}════════════════════════════════════════════════════════════${colors.reset}`);

  const query = `
    SELECT 
      p.name as professor_name,
      p.id as professor_id,
      b1.name as branch1,
      b2.name as branch2,
      t1.semester as semester1,
      t2.semester as semester2,
      t1.day_of_week as day,
      t1.time_slot_start,
      t1.time_slot_end,
      s1.name as subject1,
      s2.name as subject2,
      bat1.name as batch1,
      bat2.name as batch2
    FROM timetable t1
    INNER JOIN timetable t2 ON t1.professor_id = t2.professor_id
      AND t1.day_of_week = t2.day_of_week
      AND t1.time_slot_start = t2.time_slot_start
      AND t1.timetable_id < t2.timetable_id
    LEFT JOIN professor p ON t1.professor_id = p.id
    LEFT JOIN subject s1 ON t1.subject_id = s1.id
    LEFT JOIN subject s2 ON t2.subject_id = s2.id
    LEFT JOIN branch b1 ON t1.branch_id = b1.id
    LEFT JOIN branch b2 ON t2.branch_id = b2.id
    LEFT JOIN batch bat1 ON t1.batch_id = bat1.id
    LEFT JOIN batch bat2 ON t2.batch_id = bat2.id
    LIMIT 10;
  `;

  try {
    const result = await db.query(query);
    if (result.rows.length === 0) {
      console.log(`${colors.green}✅ No professor double-booking conflicts found!${colors.reset}\n`);
    } else {
      console.log(`${colors.yellow}Found ${result.rows.length} professor conflicts:${colors.reset}\n`);
      result.rows.forEach((conflict, idx) => {
        console.log(`${colors.cyan}Conflict #${idx + 1}:${colors.reset}`);
        console.log(`  ${colors.red}❌ Professor: ${conflict.professor_name} (${conflict.professor_id.substring(0, 8)}...)${colors.reset}`);
        console.log(`  Time: ${conflict.day} ${conflict.time_slot_start}-${conflict.time_slot_end}`);
        console.log(`  Conflict 1: ${colors.bold}${conflict.branch1}${colors.reset} Sem ${conflict.semester1} | ${conflict.subject1}`);
        if (conflict.batch1) console.log(`               Batch: ${conflict.batch1}`);
        console.log(`  Conflict 2: ${colors.bold}${conflict.branch2}${colors.reset} Sem ${conflict.semester2} | ${conflict.subject2}`);
        if (conflict.batch2) console.log(`               Batch: ${conflict.batch2}`);
        console.log();
      });
    }
  } catch (err) {
    console.error(`${colors.red}Error fetching professor conflicts:${colors.reset}`, err.message);
  }
}

async function showLabTheoryConflicts() {
  console.log(`\n${colors.bold}${colors.magenta}════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}LAB + THEORY OVERLAPS (Same Batch, Same Time - Top 10)${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}════════════════════════════════════════════════════════════${colors.reset}`);

  const query = `
    SELECT 
      b.name as branch,
      t1.semester,
      t1.day_of_week as day,
      t1.time_slot_start,
      t1.time_slot_end,
      t1.batch_id,
      bat.name as batch_name,
      s1.name as theory_subject,
      s2.name as lab_subject,
      p1.name as theory_professor,
      p2.name as lab_professor
    FROM timetable t1
    INNER JOIN timetable t2 ON t1.batch_id = t2.batch_id
      AND t1.branch_id = t2.branch_id
      AND t1.semester = t2.semester
      AND t1.day_of_week = t2.day_of_week
      AND t1.time_slot_start = t2.time_slot_start
      AND t1.slot_type = 'THEORY'
      AND t2.slot_type = 'LAB'
      AND t1.timetable_id < t2.timetable_id
    LEFT JOIN branch b ON t1.branch_id = b.id
    LEFT JOIN batch bat ON t1.batch_id = bat.id
    LEFT JOIN subject s1 ON t1.subject_id = s1.id
    LEFT JOIN subject s2 ON t2.subject_id = s2.id
    LEFT JOIN professor p1 ON t1.professor_id = p1.id
    LEFT JOIN professor p2 ON t2.professor_id = p2.id
    LIMIT 10;
  `;

  try {
    const result = await db.query(query);
    if (result.rows.length === 0) {
      console.log(`${colors.green}✅ No lab+theory overlaps found!${colors.reset}\n`);
    } else {
      console.log(`${colors.yellow}Found ${result.rows.length} lab+theory overlaps:${colors.reset}\n`);
      result.rows.forEach((conflict, idx) => {
        console.log(`${colors.cyan}Overlap #${idx + 1}:${colors.reset}`);
        console.log(`  ${colors.red}❌ Same Batch: ${conflict.batch_name}${colors.reset}`);
        console.log(`  Branch: ${conflict.branch} | Semester: ${conflict.semester}`);
        console.log(`  Time: ${colors.bold}${conflict.day} ${conflict.time_slot_start}-${conflict.time_slot_end}${colors.reset}`);
        console.log(`  THEORY: ${conflict.theory_subject} (Prof: ${conflict.theory_professor || 'N/A'})`);
        console.log(`  LAB:    ${conflict.lab_subject} (Prof: ${conflict.lab_professor || 'N/A'})`);
        console.log();
      });
    }
  } catch (err) {
    console.error(`${colors.red}Error fetching lab+theory conflicts:${colors.reset}`, err.message);
  }
}

async function showBatchTimeConflicts() {
  console.log(`\n${colors.bold}${colors.magenta}════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}BATCH TIME CONFLICTS (Multiple Activities Same Time - Top 5)${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}════════════════════════════════════════════════════════════${colors.reset}`);

  const query = `
    WITH batch_conflicts AS (
      SELECT 
        t1.batch_id,
        t1.branch_id,
        t1.semester,
        t1.day_of_week,
        t1.time_slot_start,
        count(*) as activity_count
      FROM timetable t1
      GROUP BY t1.batch_id, t1.branch_id, t1.semester, t1.day_of_week, t1.time_slot_start
      HAVING count(*) > 1
    )
    SELECT 
      bc.batch_id,
      bat.name as batch_name,
      b.name as branch,
      bc.semester,
      bc.day_of_week as day,
      bc.time_slot_start,
      bc.time_slot_end,
      bc.activity_count,
      array_agg(DISTINCT s.name) as subjects,
      array_agg(DISTINCT t.slot_type) as types
    FROM batch_conflicts bc
    LEFT JOIN batch bat ON bc.batch_id = bat.id
    LEFT JOIN branch b ON bc.branch_id = b.id
    LEFT JOIN timetable t ON bc.batch_id = t.batch_id 
      AND bc.day_of_week = t.day_of_week 
      AND bc.time_slot_start = t.time_slot_start
      AND bc.semester = t.semester
      AND bc.branch_id = t.branch_id
    LEFT JOIN subject s ON t.subject_id = s.id
    GROUP BY bc.batch_id, bat.name, b.name, bc.semester, bc.day_of_week, bc.time_slot_start, bc.time_slot_end, bc.activity_count
    LIMIT 5;
  `;

  try {
    const result = await db.query(query);
    if (result.rows.length === 0) {
      console.log(`${colors.green}✅ No batch time conflicts found!${colors.reset}\n`);
    } else {
      console.log(`${colors.yellow}Found ${result.rows.length} batch time conflicts:${colors.reset}\n`);
      result.rows.forEach((conflict, idx) => {
        console.log(`${colors.cyan}Batch Conflict #${idx + 1}:${colors.reset}`);
        console.log(`  ${colors.red}❌ Batch: ${conflict.batch_name}${colors.reset}`);
        console.log(`  Branch: ${conflict.branch} | Semester: ${conflict.semester}`);
        console.log(`  Time: ${conflict.day} ${conflict.time_slot_start}`);
        console.log(`  Activities (${conflict.activity_count}): ${conflict.subjects ? conflict.subjects.join(', ') : 'N/A'}`);
        console.log(`  Types: ${conflict.types ? conflict.types.join(', ') : 'N/A'}`);
        console.log();
      });
    }
  } catch (err) {
    console.error(`${colors.red}Error fetching batch time conflicts:${colors.reset}`, err.message);
  }
}

async function showReservedTimeViolations() {
  console.log(`\n${colors.bold}${colors.magenta}════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}RESERVED TIME VIOLATIONS (Library/Project Hours - Top 10)${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}════════════════════════════════════════════════════════════${colors.reset}`);

  const query = `
    SELECT 
      b.name as branch,
      t.semester,
      t.day_of_week as day,
      t.time_slot_start,
      t.time_slot_end,
      s.name as subject,
      t.slot_type,
      p.name as professor,
      bat.name as batch,
      CASE 
        WHEN t.day_of_week = 'FRI' AND t.time_slot_start >= '16:00' THEN 'LIBRARY HOUR (FRI 16:00)'
        WHEN t.day_of_week = 'THU' AND t.time_slot_start >= '16:00' THEN 'PROJECT HOUR (THU 16:00)'
        ELSE 'UNKNOWN'
      END as reserved_slot
    FROM timetable t
    LEFT JOIN branch b ON t.branch_id = b.id
    LEFT JOIN subject s ON t.subject_id = s.id
    LEFT JOIN professor p ON t.professor_id = p.id
    LEFT JOIN batch bat ON t.batch_id = bat.id
    WHERE 
      (t.day_of_week = 'FRI' AND t.time_slot_start >= '16:00')
      OR (t.day_of_week = 'THU' AND t.time_slot_start >= '16:00')
    ORDER BY b.name, t.semester, t.day_of_week, t.time_slot_start
    LIMIT 10;
  `;

  try {
    const result = await db.query(query);
    if (result.rows.length === 0) {
      console.log(`${colors.green}✅ No reserved time violations found!${colors.reset}\n`);
    } else {
      console.log(`${colors.yellow}Found ${result.rows.length} reserved time violations:${colors.reset}\n`);
      result.rows.forEach((violation, idx) => {
        console.log(`${colors.cyan}Violation #${idx + 1}:${colors.reset}`);
        console.log(`  ${colors.red}❌ ${violation.reserved_slot}${colors.reset}`);
        console.log(`  Class: ${violation.subject} (${violation.slot_type})`);
        console.log(`  Branch: ${violation.branch} | Semester: ${violation.semester} | Batch: ${violation.batch || 'N/A'}`);
        console.log(`  Scheduled: ${violation.day} ${violation.time_slot_start}-${violation.time_slot_end}`);
        console.log(`  Professor: ${violation.professor || 'N/A'}`);
        console.log();
      });
    }
  } catch (err) {
    console.error(`${colors.red}Error fetching reserved time violations:${colors.reset}`, err.message);
  }
}

async function runFullReport() {
  console.log(`\n${colors.bold}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}DETAILED TIMETABLE CONFLICT REPORT${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}Generated: ${new Date().toLocaleString()}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

  await showProfessorConflicts();
  await showLabTheoryConflicts();
  await showBatchTimeConflicts();
  await showReservedTimeViolations();

  console.log(`\n${colors.bold}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}REPORT COMPLETE${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

  process.exit(0);
}

runFullReport().catch(err => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err);
  process.exit(1);
});
