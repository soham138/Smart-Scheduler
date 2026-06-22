#!/usr/bin/env node
/**
 * Comprehensive conflict check: ALL branches, ALL semesters
 */
require('dotenv').config();

const pool = require('./src/config/db');
const ConflictDetector = require('./src/services/ConflictDetector');

async function test() {
  try {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  COMPREHENSIVE CONFLICT CHECK - ALL SEMESTERS      ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // Get all branches
    const branches = await pool.query('SELECT * FROM branches ORDER BY name');
    
    let globalConflictCount = 0;
    let globalWarningCount = 0;
    let checkedCombinations = 0;

    for (const branch of branches.rows) {
      console.log(`\n📚 Branch: ${branch.name} (${branch.branch_id})`);
      
      let branchConflicts = 0;
      let branchWarnings = 0;

      // Check all 8 semesters
      for (let sem = 1; sem <= 8; sem++) {
        process.stdout.write(`  Sem ${sem}: `);
        
        try {
          const detector = new ConflictDetector(branch.branch_id, sem);
          const result = await detector.detectAll();
          
          if (result.conflictCount > 0 || result.warningCount > 0) {
            console.log(`⚠️  ${result.conflictCount} conflicts, ${result.warningCount} warnings`);
            branchConflicts += result.conflictCount;
            branchWarnings += result.warningCount;
          } else {
            console.log('✓ OK');
          }
          
          checkedCombinations++;
        } catch (err) {
          console.log(`✗ Error: ${err.message}`);
        }
      }
      
      if (branchConflicts > 0 || branchWarnings > 0) {
        console.log(`  → Branch Total: ${branchConflicts} conflicts, ${branchWarnings} warnings`);
        globalConflictCount += branchConflicts;
        globalWarningCount += branchWarnings;
      } else {
        console.log(`  → Branch Total: ✅ NO CONFLICTS`);
      }
    }

    console.log('\n' + '═'.repeat(55));
    console.log('📊 FINAL RESULTS:');
    console.log(`  ✓ Checked: ${checkedCombinations} branch/semester combinations`);
    console.log(`  ⚠️  Total Conflicts: ${globalConflictCount}`);
    console.log(`  ⚠️  Total Warnings: ${globalWarningCount}`);
    
    if (globalConflictCount === 0) {
      console.log('\n✅ SUCCESS: All conflicts resolved! 🎉');
    } else {
      console.log(`\n❌ ISSUE: Still ${globalConflictCount} conflicts detected`);
      console.log('   Solution 1 partially success but needs improvement');
    }

    console.log('\n💡 Comparison to baseline:');
    console.log('  Before: 33 conflicts');
    console.log(`  After:  ${globalConflictCount} conflicts`);
    console.log(`  Reduction: ${((33 - globalConflictCount) / 33 * 100).toFixed(1)}%`);

    await pool.end();
    process.exit(globalConflictCount === 0 ? 0 : 1);
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

test();
