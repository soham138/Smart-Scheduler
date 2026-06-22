#!/usr/bin/env node
/**
 * SOLUTION 1: REGENERATE TIMETABLE WITH ENHANCED THEORY-LAB CONFLICT PREVENTION
 * 
 * This script:
 * 1. Clears all existing timetables (removes 33 conflicted entries)
 * 2. Regenerates all branch/semester combinations with FIXED algorithm
 * 3. Uses the enhanced detectAndFixBatchConflicts() that PREVENTS conflicts
 * 4. Does NOT delete THEORY slots (keeps lecture hours intact)
 * 
 * Execution: node regenerate_with_enhanced_fix.js
 */

const http = require('http');

// Branch IDs (CORRECT from database)
const BRANCHES = [
  { id: '941a4552-f070-4f7b-a861-43be279967b9', name: 'Artificial Intelligence' },
  { id: '8e1571fa-2298-49c7-871c-ccdfdd9a6b18', name: 'Computer Engineering' },
  { id: '243337b3-deeb-4023-ac29-5c55db8356d1', name: 'Internet of Things' }
];

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8]; // All semesters

const LOCALHOST = 'http://localhost:5000';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clearBranchSemester(branchId, semester) {
  return new Promise((resolve, reject) => {
    const url = `${LOCALHOST}/api/timetable/clear/${branchId}/${semester}`;
    const req = http.request(url, {method: 'DELETE'}, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          resolve({ message: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function generateTimetable(branchId, semester) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      branchId: branchId,
      semester: semester
    });

    const req = http.request(`${LOCALHOST}/api/timetable/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          resolve({ message: data });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runRegeneration() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  SOLUTION 1: REGENERATE WITH ENHANCED CONFLICT FIX      ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  let totalCleared = 0;
  let totalGenerated = 0;
  let totalFailed = 0;

  // Step 1: CLEAR ALL TIMETABLES
  console.log('📋 STEP 1: CLEARING ALL TIMETABLES\n');
  
  for (const branch of BRANCHES) {
    console.log(`\n🔍 Branch: ${branch.name}`);
    for (const semester of SEMESTERS) {
      process.stdout.write(`  Sem ${semester}... `);
      try {
        const result = await clearBranchSemester(branch.id, semester);
        if (result.success || result.message === 'Timetable cleared' || result.rowCount) {
          console.log('✓ Cleared');
          totalCleared++;
        } else {
          console.log('⚠  No entries to clear');
        }
        await delay(100); // Small delay between requests
      } catch (error) {
        console.log(`✗ Error: ${error.message}`);
      }
    }
  }

  console.log(`\n✅ Total cleared: ${totalCleared} branch/semester combinations\n`);

  // Step 2: REGENERATE ALL TIMETABLES
  console.log('═'.repeat(55));
  console.log('📝 STEP 2: REGENERATING TIMETABLES WITH ENHANCED FIX\n');
  
  for (const branch of BRANCHES) {
    console.log(`\n🔍 Branch: ${branch.name}`);
    for (const semester of SEMESTERS) {
      process.stdout.write(`  Sem ${semester}... `);
      try {
        const result = await generateTimetable(branch.id, semester);
        
        if (result.success) {
          const slotCount = result.data?.slotsGenerated || '?';
          console.log(`✓ Generated (${slotCount} slots)`);
          totalGenerated++;
        } else if (result.message && result.message.includes('Timetable generated')) {
          console.log('✓ Generated');
          totalGenerated++;
        } else {
          console.log(`✗ Failed: ${result.message || 'Unknown error'}`);
          totalFailed++;
        }
        await delay(200); // Longer delay for generation (slower process)
      } catch (error) {
        console.log(`✗ Error: ${error.message}`);
        totalFailed++;
      }
    }
  }

  console.log(`\n✅ Total generated: ${totalGenerated} branch/semester combinations`);
  if (totalFailed > 0) {
    console.log(`⚠  Failed: ${totalFailed} branch/semester combinations`);
  }

  console.log('\n' + '═'.repeat(55));
  console.log('✅ REGENERATION COMPLETE!\n');
  console.log('📊 RESULTS:');
  console.log(`  ✓ Cleared: ${totalCleared} entries`);
  console.log(`  ✓ Generated: ${totalGenerated} new timetables`);
  if (totalFailed > 0) {
    console.log(`  ✗ Failed: ${totalFailed}`);
  }
  console.log('\n🔄 NEXT STEP: Verify conflicts are resolved');
  console.log('   Run: node check_all_branches.js\n');
}

// Main execution
runRegeneration().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
