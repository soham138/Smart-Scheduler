/**
 * Remove Duplicate LAB Entries
 * Keeps the first occurrence, deletes all others
 */

const pool = require('./backend/src/config/db');

async function removeDuplicates() {
  let client;
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔧 REMOVING DUPLICATE LAB ENTRIES');
    console.log('='.repeat(80) + '\n');

    client = await pool.connect();

    // Find duplicates - identify which IDs to delete (keep first, delete rest)
    const findRes = await client.query(`
      WITH ranked_labs AS (
        SELECT 
          timetable_id,
          subject_id,
          batch_id,
          semester,
          ROW_NUMBER() OVER (PARTITION BY subject_id, batch_id, semester ORDER BY timetable_id) as rn
        FROM timetable
        WHERE slot_type = 'LAB'
      )
      SELECT timetable_id FROM ranked_labs WHERE rn > 1;
    `);

    const dupIds = findRes.rows.map(r => r.timetable_id);

    if (dupIds.length === 0) {
      console.log('✅ No duplicates to remove!\n');
      client.release();
      process.exit(0);
    }

    // Preview what we'll delete
    console.log(`Found ${dupIds.length} duplicate entries to delete:\n`);
    
    const previewRes = await client.query(`
      SELECT 
        t.timetable_id,
        s.name as subject_name,
        bat.batch_number,
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end
      FROM timetable t
      LEFT JOIN subjects s ON s.subject_id = t.subject_id
      LEFT JOIN batches bat ON bat.batch_id = t.batch_id
      WHERE t.timetable_id = ANY($1::uuid[])
      ORDER BY s.name, bat.batch_number;
    `, [dupIds]);

    previewRes.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ❌ DELETE: ${row.subject_name} (${row.batch_number})`);
      console.log(`   ${row.day_of_week} ${row.time_slot_start}-${row.time_slot_end}`);
      console.log(`   ID: ${row.timetable_id}\n`);
    });

    // Perform deletion
    console.log('🗑️  Deleting duplicate entries...\n');
    
    const deleteRes = await client.query(
      `DELETE FROM timetable WHERE timetable_id = ANY($1::uuid[]) RETURNING timetable_id;`,
      [dupIds]
    );

    console.log(`✅ Successfully deleted ${deleteRes.rows.length} duplicate entries!\n`);

    // Verify
    const verifyRes = await client.query(`
      WITH ranked_labs AS (
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE rn > 1) as remaining_dups
        FROM (
          SELECT 
            ROW_NUMBER() OVER (PARTITION BY subject_id, batch_id, semester ORDER BY timetable_id) as rn
          FROM timetable
          WHERE slot_type = 'LAB'
        ) sub
      )
      SELECT * FROM ranked_labs;
    `);

    const verify = verifyRes.rows[0];
    console.log(`📊 Verification: ${verify.remaining_dups} duplicates remaining`);
    
    if (verify.remaining_dups === 0) {
      console.log('✅ All duplicates removed successfully!\n');
    } else {
      console.log('⚠️ Warning: Some duplicates still remain\n');
    }

    client.release();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (client) client.release();
    process.exit(1);
  }
}

removeDuplicates();
