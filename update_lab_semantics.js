const pool = require('./backend/src/config/db');

async function updateLabCounts() {
  try {
    console.log('Updating lab counts from 2 to 1 (semantics: 1 = both batches)...\n');

    // Update all LAB and BOTH type subjects
    const result1 = await pool.query(`
      UPDATE subjects 
      SET weekly_lab_count = 1 
      WHERE type IN ('LAB', 'BOTH')
      RETURNING subject_id, name, code, type, weekly_lab_count
    `);

    console.log(`✓ Updated ${result1.rows.length} LAB/BOTH subjects to weekly_lab_count = 1`);
    result1.rows.slice(0, 10).forEach(s => {
      console.log(`  - ${s.code} (${s.name})`);
    });

    // Update MAJ7 specifically if it still has wrong value
    const result2 = await pool.query(`
      UPDATE subjects 
      SET weekly_lab_count = 1 
      WHERE code = 'MAJ7' AND weekly_lab_count != 1
      RETURNING subject_id, name, code, type, weekly_lab_count
    `);

    if (result2.rows.length > 0) {
      console.log(`\n✓ Updated Major Project subject:`);
      result2.rows.forEach(s => {
        console.log(`  - ${s.code} (${s.name}): weekly_lab_count = ${s.weekly_lab_count}`);
      });
    }

    // Verify
    const verify = await pool.query(`
      SELECT weekly_lab_count, COUNT(*) as count
      FROM subjects
      WHERE type IN ('LAB', 'BOTH')
      GROUP BY weekly_lab_count
      ORDER BY weekly_lab_count DESC
    `);

    console.log(`\nVerification:`)
    verify.rows.forEach(row => {
      console.log(`  weekly_lab_count = ${row.weekly_lab_count}: ${row.count} subjects`);
    });

    console.log(`\n✓ All lab subjects now use semantic: 1 = both batches (Batch A + Batch B)`);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

updateLabCounts();
