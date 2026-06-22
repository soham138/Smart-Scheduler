#!/usr/bin/env node
/**
 * Query actual backend conflict endpoint
 */
const http = require('http');

async function checkConflicts(branchId, semester) {
  return new Promise((resolve, reject) => {
    const path = `/api/timetable/check-conflicts/${branchId}/${semester}`;
    
    const req = http.get(
      {
        hostname: 'localhost',
        port: 5000,
        path: path,
        timeout: 8000
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch(e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        });
      }
    );
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

(async () => {
  try {
    console.log('🔍 Querying backend for branch conflicts\n');
    
    // Get branches first
    const branchesRes = await new Promise((resolve, reject) => {
      const req = http.get(
        { hostname: 'localhost', port: 5000, path: '/api/branches', timeout: 5000 },
        (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        }
      );
      req.on('error', reject);
    });

    const branches = branchesRes.data || [];
    console.log(`Found ${branches.length} branches\n`);

    let totalConflicts = 0;

    for (const branch of branches) {
      for (let sem = 1; sem <= 8; sem++) {
        try {
          const result = await checkConflicts(branch.branch_id, sem);
          
          if (result && result.conflicts && result.conflicts.length > 0) {
            console.log(`\n${branch.name} - Semester ${sem}:`);
            console.log(`  ⚠️  Found ${result.conflicts.length} conflicts\n`);
            
            // Show sample conflicts
            result.conflicts.slice(0, 3).forEach((c, i) => {
              console.log(`  ${i+1}. ${c.type}: ${c.message}`);
            });
            
            if (result.conflicts.length > 3) {
              console.log(`  ... and ${result.conflicts.length - 3} more`);
            }

            totalConflicts += result.conflicts.length;
          }
        } catch(e) {
          console.log(`  Error checking ${branch.name} Sem ${sem}: ${e.message}`);
        }
      }
    }

    console.log('\n' + '═'.repeat(50));
    console.log(`\n📊 TOTAL CONFLICTS FROM API: ${totalConflicts}`);

  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
