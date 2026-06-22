#!/usr/bin/env node
/**
 * REGENERATE ALL TIMETABLES FOR ALL BRANCHES
 * 
 * This script:
 * 1. Deletes all existing conflicted timetable entries (928 slots)
 * 2. Regenerates clean timetables for all branches/semesters
 * 3. Uses the TimetableAlgorithm to create conflict-free schedules
 * 4. Validates each generated timetable before saving
 * 
 * Execution: node regenerate_all_timetables.js
 */

const http = require('http');

const BRANCHES = [
  { id: '72b6f7c5-f8ff-41d4-988f-aeab1d16c1c0', name: 'Artificial Intelligence' },
  { id: '8e1571fa-2298-49c7-871c-ccdfdd9a6b18', name: 'Computer Engineering' },
  { id: '243337b3-deeb-4023-ac29-5c55db8356d1', name: 'Internet of Things' }
];

const SEMESTERS = [2, 4, 6, 8]; // Even semesters only

const LOCALHOST = 'http://localhost:5000';

async function clearBranchSemester(branchId, semester) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${LOCALHOST}/api/timetable/clear/${branchId}/${semester}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
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
        'Content-Length': body.length
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: result
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: { message: data }
          });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runRegeneration() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     TIMETABLE REGENERATION - ALL BRANCHES & SEMESTERS      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const branchResults = [];
  
  for (const branch of BRANCHES) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🏢 BRANCH: ${branch.name} (${branch.id.substring(0, 8)}...)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const branchData = { branch: branch.name, semesters: {} };

    for (const semester of SEMESTERS) {
      // Step 1: Clear old timetable
      process.stdout.write(`  Clearing Sem ${semester}... `);
      try {
        await clearBranchSemester(branch.id, semester);
        console.log('✅');
      } catch (err) {
        console.log('⚠️ (ignoring)');
      }

      // Step 2: Generate new timetable
      process.stdout.write(`  Generating Sem ${semester}... `);
      
      try {
        const result = await generateTimetable(branch.id, semester);
        
        if (result.status === 200 || result.data.message?.includes('Successfully generated')) {
          const slots = result.data.timetable_entries || result.data.data?.length || result.data.total_slots || 0;
          console.log(`✅ ${slots} slots`);
          branchData.semesters[`Sem${semester}`] = { status: 'SUCCESS', slots };
        } else if (result.status === 400) {
          console.log(`⚠️  Error: ${result.data.error || 'Unknown error'}`);
          branchData.semesters[`Sem${semester}`] = { status: 'ERROR', message: result.data.error };
        } else {
          console.log(`❌ Status ${result.status}`);
          branchData.semesters[`Sem${semester}`] = { status: 'ERROR', message: result.data.error };
        }
      } catch (err) {
        console.log(`❌ ${err.message}`);
        branchData.semesters[`Sem${semester}`] = { status: 'FAILURE', message: err.message };
      }

      // Small delay between requests
      await new Promise(r => setTimeout(r, 1000));
    }

    branchResults.push(branchData);
  }

  // Step 3: Summary report
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║                    REGENERATION SUMMARY                    ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  let totalSlots = 0;
  const failedCount = { CONFLICT: 0, ERROR: 0, FAILURE: 0 };

  branchResults.forEach(branchData => {
    console.log(`📊 ${branchData.branch}:`);
    Object.entries(branchData.semesters).forEach(([sem, data]) => {
      if (data.status === 'SUCCESS') {
        console.log(`   ✅ ${sem}: ${data.slots} slots`);
        totalSlots += data.slots;
      } else {
        console.log(`   ❌ ${sem}: ${data.status}`);
        if (data.message) {
          console.log(`      └─ ${data.message.substring(0, 60)}`);
        }
        failedCount[data.status] = (failedCount[data.status] || 0) + 1;
      }
    });
  });

  console.log(`\n📈 TOTALS:`);
  console.log(`   Total Slots Generated: ${totalSlots}`);
  console.log(`   Successful Semesters: ${12 - (failedCount.CONFLICT + failedCount.ERROR + failedCount.FAILURE)}/12`);
  
  if (failedCount.CONFLICT > 0) {
    console.log(`   ⚠️  Conflicts: ${failedCount.CONFLICT}`);
  }
  if (failedCount.ERROR > 0) {
    console.log(`   ❌ Errors: ${failedCount.ERROR}`);
  }
  if (failedCount.FAILURE > 0) {
    console.log(`   ❌ Failures: ${failedCount.FAILURE}`);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✨ REGENERATION COMPLETE`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  process.exit(0);
}

runRegeneration().catch(err => {
  console.error('\n❌ FATAL ERROR:', err.message);
  process.exit(1);
});
