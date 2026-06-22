const pool = require('./src/config/db');

async function updateLabCounts() {
  try {
    console.log('\n=== UPDATING LAB COUNTS ===\n');

    const labCounts = {
      // Semester 6
      'AI': 2,
      'CC': 2,
      'CSS': 2,
      'MC': 2,
      'SPCC': 2,
      // Semester 8
      'DC': 2,
      'DL': 2,
      'SMA': 2,
    };

    for (const [subjectName, labCount] of Object.entries(labCounts)) {
      const updateQuery = `
        UPDATE subjects 
        SET weekly_lab_count = $1 
        WHERE name = $2
        RETURNING name, weekly_lecture_count, weekly_lab_count;
      `;
      const result = await pool.query(updateQuery, [labCount, subjectName]);
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        console.log(`✓ ${row.name}: Theory=${row.weekly_lecture_count}, Lab=${row.weekly_lab_count}`);
      }
    }

    console.log('\n✅ Lab counts updated successfully!\n');

    // Verify
    const verify = await pool.query(`
      SELECT name, type, weekly_lecture_count, weekly_lab_count FROM subjects 
      WHERE semester IN (6, 8)
      ORDER BY semester, name
    `);

    console.log('=== VERIFICATION ===\n');
    verify.rows.forEach(row => {
      console.log(`${row.name.padEnd(15)} | ${row.type.padEnd(6)} | Theory: ${row.weekly_lecture_count} | Lab: ${row.weekly_lab_count}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

updateLabCounts();
