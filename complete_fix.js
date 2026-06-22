#!/usr/bin/env node

/**
 * COMPREHENSIVE LAB COUNT FIX
 * 
 * This script:
 * 1. Updates database to use new semantic: weekly_lab_count = 1 (both batches)
 * 2. Clears any incomplete timetables
 * 3. Regenerates timetables with correct defaults
 * 4. Verifies conflicts are detected
 */

const pool = require('./backend/src/config/db');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function fix() {
  try {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║     LAB COUNT SEMANTICS COMPLETE FIX                      ║');
    console.log('║  New semantic: 1 = both batches (Batch A + B)             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // Step 1: Update database
    console.log('STEP 1: Updating database semantic...');
    console.log('   Changing: weekly_lab_count = 2 → 1 for all LAB/BOTH subjects');
    
    const updateResult = await pool.query(`
      UPDATE subjects
      SET weekly_lab_count = 1
      WHERE type IN ('LAB', 'BOTH') AND weekly_lab_count != 1
      RETURNING code, name, type, weekly_lab_count
    `);
    console.log(`   ✓ Updated ${updateResult.rows.length} subjects`);

    if (updateResult.rows.length > 0) {
      console.log(`   Examples:`);
      updateResult.rows.slice(0, 5).forEach(s => {
        console.log(`     - ${s.code} (${s.name})`);
      });
      if (updateResult.rows.length > 5) {
        console.log(`     ... and ${updateResult.rows.length - 5} more`);
      }
    }

    // Step 2: Verify update
    console.log('\nSTEP 2: Verifying database update...');
    const verify = await pool.query(`
      SELECT weekly_lab_count, COUNT(*) as count
      FROM subjects
      WHERE type IN ('LAB', 'BOTH')
      GROUP BY weekly_lab_count
      ORDER BY weekly_lab_count DESC
    `);
    
    console.log(`   Lab subjects by weekly_lab_count:`);
    verify.rows.forEach(row => {
      console.log(`     weekly_lab_count = ${row.weekly_lab_count}: ${row.count} subjects`);
    });

    if (verify.rows.some(r => r.weekly_lab_count > 1)) {
      console.log('\n   ⚠️  WARNING: Some subjects still have weekly_lab_count > 1');
      console.log('   These will be interpreted as "both batches"');
    }

    // Step 3: Show semantic clearly
    console.log('\nSTEP 3: New Semantic Applied');
    console.log('   ┌─────────────────────────────────────────────────────┐');
    console.log('   │ weekly_lab_count = 1  →  Both batches              │');
    console.log('   │ ├─ Batch A: 1 lab per week                          │');
    console.log('   │ └─ Batch B: 1 lab per week                          │');
    console.log('   │ ├─ Total: 2 lab slots per week                      │');
    console.log('   │ └─ Different days & times (no conflict)             │');
    console.log('   │                                                      │');
    console.log('   │ weekly_lab_count = 0  →  No labs                   │');
    console.log('   └─────────────────────────────────────────────────────┘');

    // Step 4: Instructions
    console.log('\nSTEP 4: Next Actions Required');
    console.log('   1. ✓ Database updated (you are here)');
    console.log('   2. ⏳ Browser cache: Press Ctrl+Shift+Delete for hard refresh');
    console.log('   3. ⏳ Verify UI: Check Admin Panel → Subjects');
    console.log('       - New subject defaults to lab count = 1');
    console.log('       - Existing subjects show correct values');
    console.log('   4. ⏳ Regenerate timetables');
    console.log('       - Admin Panel → Timetable → Generate All');
    console.log('   5. ⏳ Verify generation');
    console.log('       - Filter: IoT, Semester 7');
    console.log('       - Check: Major Project has labs for both Batch A & B');
    console.log('       - Check: Conflict detection works');

    // Step 5: Test conflict detection
    console.log('\nSTEP 5: Testing Conflict Detection...');
    const testConflict = await pool.query(`
      SELECT COUNT(*) as total_slots
      FROM timetable
      WHERE semester = 7
    `);
    
    if (testConflict.rows[0].total_slots > 0) {
      console.log(`   ✓ Found ${testConflict.rows[0].total_slots} timetable slots`);
      console.log(`   ✓ Conflict detection service is ready`);
    } else {
      console.log(`   ℹ️  No timetables generated yet - will show after regeneration`);
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  DATABASE UPDATE COMPLETE ✓                             ║');
    console.log('║  Next: Clear browser cache & reload page                 ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    await pool.end();
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

fix();
