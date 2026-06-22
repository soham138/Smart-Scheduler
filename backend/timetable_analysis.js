/**
 * COMPREHENSIVE TIMETABLE ANALYSIS AND CORRECTION REPORT
 * Analyzes current timetable for conflicts, missing allocations, and duplicates
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'smarttt',
});

const fs = require('fs');
const path = require('path');

// Color codes
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  bg_red: '\x1b[41m',
  bg_green: '\x1b[42m',
};

function log(msg, color = 'reset') {
  console.log(`${c[color]}${msg}${c.reset}`);
}

function header(msg) {
  console.log(`\n${c.bold}${c.cyan}${'='.repeat(60)}${c.reset}`);
  console.log(`${c.bold}${c.cyan}${msg}${c.reset}`);
  console.log(`${c.bold}${c.cyan}${'='.repeat(60)}${c.reset}\n`);
}

function subheader(msg) {
  console.log(`\n${c.bold}${c.blue}▶ ${msg}${c.reset}\n`);
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function timesOverlap(start1, end1, start2, end2) {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  return s1 < e2 && s2 < e1;
}

function fmt(time) {
  return time ? time.substring(0, 5) : 'N/A';
}

async function getTimetable() {
  const result = await pool.query(`
    SELECT 
      t.timetable_id,
      t.day_of_week,
      t.time_slot_start,
      t.time_slot_end,
      t.slot_type,
      br.branch_name,
      s.subject_name,
      p.professor_name,
      COALESCE(b.batch_number, 0) as batch,
      COALESCE(b.batch_id, 0) as batch_id,
      t.semester
    FROM timetables t
    JOIN branches br ON t.branch_id = br.branch_id
    JOIN subjects s ON t.subject_id = s.subject_id
    JOIN professors p ON t.professor_id = p.professor_id
    LEFT JOIN batches b ON t.batch_id = b.batch_id
    WHERE t.semester = 6 AND br.branch_name = 'Computer Science'
    ORDER BY t.day_of_week, t.time_slot_start
  `);
  
  return result.rows;
}

function analyzeDuplicates(timetable) {
  const seen = new Set();
  const duplicates = [];
  
  timetable.forEach(entry => {
    const key = `${entry.day_of_week}_${entry.time_slot_start}_${entry.subject_name}_${entry.batch}`;
    if (seen.has(key)) {
      duplicates.push({
        day: entry.day_of_week,
        time: fmt(entry.time_slot_start),
        subject: entry.subject_name,
        batch: entry.batch === 0 ? 'Theory' : `Batch ${entry.batch}`,
        professor: entry.professor_name,
      });
    }
    seen.add(key);
  });
  
  return duplicates;
}

function analyzeBatchCoverage(timetable) {
  const coverage = { 1: [], 2: [], 0: [] };
  
  timetable.forEach(entry => {
    if (entry.slot_type === 'LAB') {
      if (!coverage[entry.batch].includes(entry.subject_name)) {
        coverage[entry.batch].push(entry.subject_name);
      }
    }
  });
  
  return coverage;
}

function findProfessorConflicts(timetable) {
  const profSchedule = {};
  const conflicts = [];
  
  timetable.forEach(entry => {
    if (!profSchedule[entry.professor_name]) {
      profSchedule[entry.professor_name] = [];
    }
    profSchedule[entry.professor_name].push(entry);
  });
  
  Object.keys(profSchedule).forEach(prof => {
    const schedule = profSchedule[prof];
    for (let i = 0; i < schedule.length; i++) {
      for (let j = i + 1; j < schedule.length; j++) {
        const e1 = schedule[i];
        const e2 = schedule[j];
        
        if (e1.day_of_week === e2.day_of_week &&
            timesOverlap(e1.time_slot_start, e1.time_slot_end, e2.time_slot_start, e2.time_slot_end)) {
          conflicts.push({
            professor: prof,
            day: e1.day_of_week,
            time1: `${fmt(e1.time_slot_start)}-${fmt(e1.time_slot_end)}`,
            time2: `${fmt(e2.time_slot_start)}-${fmt(e2.time_slot_end)}`,
            subject1: e1.subject_name,
            subject2: e2.subject_name,
            batch1: e1.batch === 0 ? 'Theory' : `Batch ${e1.batch}`,
            batch2: e2.batch === 0 ? 'Theory' : `Batch ${e2.batch}`,
          });
        }
      }
    }
  });
  
  return conflicts;
}

function findBatchConflicts(timetable) {
  const batchSchedule = { 1: [], 2: [] };
  const conflicts = [];
  
  timetable.forEach(entry => {
    if (entry.slot_type === 'LAB' && entry.batch > 0) {
      batchSchedule[entry.batch].push(entry);
    }
  });
  
  Object.keys(batchSchedule).forEach(batch => {
    const schedule = batchSchedule[batch];
    for (let i = 0; i < schedule.length; i++) {
      for (let j = i + 1; j < schedule.length; j++) {
        const e1 = schedule[i];
        const e2 = schedule[j];
        
        if (e1.day_of_week === e2.day_of_week &&
            timesOverlap(e1.time_slot_start, e1.time_slot_end, e2.time_slot_start, e2.time_slot_end)) {
          conflicts.push({
            batch: `Batch ${batch}`,
            day: e1.day_of_week,
            time: `${fmt(e1.time_slot_start)}-${fmt(e1.time_slot_end)}`,
            subject1: e1.subject_name,
            subject2: e2.subject_name,
          });
        }
      }
    }
  });
  
  return conflicts;
}

async function regenerateTimetable() {
  try {
    // Get branch ID
    const branchRes = await pool.query(
      `SELECT branch_id FROM branches WHERE branch_name = 'Computer Science' LIMIT 1`
    );
    
    if (branchRes.rows.length === 0) {
      log('Computer Science branch not found', 'red');
      return false;
    }
    
    const branchId = branchRes.rows[0].branch_id;
    
    // Delete old timetable
    log('Deleting old timetable...', 'yellow');
    await pool.query(`DELETE FROM timetables WHERE branch_id = $1 AND semester = 6`, [branchId]);
    
    // Generate new timetable
    log('Regenerating with fixed algorithm...', 'yellow');
      const TimetableAlgorithm = require('./src/algorithms/TimetableAlgorithm');
    const algorithm = new TimetableAlgorithm(pool);
    const result = await algorithm.generateTimetable(branchId, 6);
    
    if (result.success) {
      log('✓ Timetable regenerated successfully', 'green');
      return true;
    } else {
      log(`✗ Failed to regenerate: ${result.error}`, 'red');
      return false;
    }
  } catch (err) {
    log(`Error: ${err.message}`, 'red');
    return false;
  }
}

async function main() {
  try {
    header('TIMETABLE ANALYSIS & CORRECTION REPORT');
    
    // Get current timetable
    subheader('Step 1: Fetching Current Timetable');
    const timetable = await getTimetable();
    
    if (timetable.length === 0) {
      log('No timetable found for Computer Science, Semester 6', 'yellow');
      log('Need to generate one first via Admin Panel', 'yellow');
      process.exit(0);
    }
    
    log(`Found ${timetable.length} timetable entries`, 'green');
    
    // Analyze current state
    subheader('Step 2: Analyzing Timetable');
    const duplicates = analyzeDuplicates(timetable);
    const coverage = analyzeBatchCoverage(timetable);
    const profConflicts = findProfessorConflicts(timetable);
    const batchConflicts = findBatchConflicts(timetable);
    
    // Display timetable statistics
    subheader('Timetable Statistics');
    log(`Total Entries: ${timetable.length}`, 'cyan');
    log(`Theory Classes: ${timetable.filter(t => t.batch === 0).length}`, 'cyan');
    log(`Batch 1 (A) Labs: ${timetable.filter(t => t.batch === 1 && t.slot_type === 'LAB').length}`, 'cyan');
    log(`Batch 2 (B) Labs: ${timetable.filter(t => t.batch === 2 && t.slot_type === 'LAB').length}`, 'cyan');
    
    // Display batch coverage
    subheader('Batch Lab Coverage');
    console.log('Batch 1 (A) Subjects:', coverage[1].length > 0 ? coverage[1].join(', ') : 'NONE');
    console.log('Batch 2 (B) Subjects:', coverage[2].length > 0 ? coverage[2].join(', ') : 'NONE');
    
    // Display issues found
    subheader('Step 3: Conflict Analysis');
    
    let issueCount = 0;
    
    // Check batch coverage
    if (coverage[1].length === 0) {
      log('✗ CRITICAL: Batch A (1) has NO labs assigned', 'red');
      issueCount++;
    } else {
      log(`✓ Batch A (1): ${coverage[1].length} subjects with labs`, 'green');
    }
    
    if (coverage[2].length === 0) {
      log('✗ CRITICAL: Batch B (2) has NO labs assigned', 'red');
      issueCount++;
    } else {
      log(`✓ Batch B (2): ${coverage[2].length} subjects with labs`, 'green');
    }
    
    // Check duplicates
    if (duplicates.length === 0) {
      log('✓ No duplicate entries', 'green');
    } else {
      log(`✗ ${duplicates.length} duplicate entries found`, 'red');
      issueCount += duplicates.length;
      console.log('\nDuplicate Details:');
      console.table(duplicates);
    }
    
    // Check professor conflicts
    if (profConflicts.length === 0) {
      log('✓ No professor scheduling conflicts', 'green');
    } else {
      log(`✗ ${profConflicts.length} professor conflicts found`, 'red');
      issueCount += profConflicts.length;
      console.log('\nProfessor Conflicts:');
      console.table(profConflicts);
    }
    
    // Check batch time conflicts
    if (batchConflicts.length === 0) {
      log('✓ No batch time conflicts', 'green');
    } else {
      log(`✗ ${batchConflicts.length} batch conflicts found`, 'red');
      issueCount += batchConflicts.length;
      console.log('\nBatch Conflicts:');
      console.table(batchConflicts);
    }
    
    // Display full timetable organized by time
    subheader('Step 4: Full Timetable View');
    const organized = {};
    timetable.forEach(entry => {
      const key = `${entry.day_of_week} ${fmt(entry.time_slot_start)}`;
      if (!organized[key]) {
        organized[key] = [];
      }
      organized[key].push(entry);
    });
    
    Object.keys(organized).sort().forEach(timeSlot => {
      console.log(`\n${c.bold}${timeSlot}${c.reset}`);
      const display = organized[timeSlot].map(e => ({
        Subject: e.subject_name,
        Type: e.slot_type,
        Batch: e.batch === 0 ? 'Theory' : `Batch ${e.batch}`,
        Professor: e.professor_name,
        'End Time': fmt(e.time_slot_end),
      }));
      console.table(display);
    });
    
    // Final verdict
    header(`VERDICT - Total Issues: ${issueCount}`);
    
    if (issueCount === 0) {
      log('✓✓✓ TIMETABLE IS CORRECT ✓✓✓', 'green');
      log('Both batches have labs scheduled at different times.', 'green');
      log('No conflicts or duplicates detected.', 'green');
    } else {
      log('✗✗✗ TIMETABLE NEEDS CORRECTION ✗✗✗', 'red');
      log(`Found ${issueCount} issues that need fixing.`, 'red');
      
      subheader('Fixing Timetable');
      const success = await regenerateTimetable();
      
      if (success) {
        log('\n✓ Timetable regenerated with fixed algorithm', 'green');
        log('Re-run this script to verify the fix', 'green');
      } else {
        log('✗ Failed to regenerate timetable', 'red');
      }
    }
    
    await pool.end();
    process.exit(issueCount === 0 ? 0 : 1);
    
  } catch (err) {
    log(`Fatal error: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
  }
}

main();
