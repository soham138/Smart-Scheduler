/**
 * Create SAME profile/day/time conflict
 */

const pool = require('./src/config/db');

async function createRealConflict() {
  const client = await pool.connect();
  try {
    // Get first branch and semester
    const branchRes = await client.query(`
      SELECT DISTINCT branch_id, semester FROM timetable WHERE slot_type = 'THEORY' LIMIT 1
    `);

    if (branchRes.rows.length === 0) {
      console.log('No timetable entries found');
      process.exit(1);
    }

    const { branch_id: branchId, semester } = branchRes.rows[0];

    // Get a theory slot
    const slotRes = await client.query(`
      SELECT timetable_id, professor_id, day_of_week, time_slot_start, time_slot_end, subject_id
      FROM timetable
      WHERE branch_id = $1
      AND semester = $2
      AND slot_type = 'THEORY'
      LIMIT 1
    `, [branchId, semester]);

    if (slotRes.rows.length === 0) {
      console.log('No theory slots found');
      process.exit(1);
    }

    const existingSlot = slotRes.rows[0];
    console.log('\nExisting Slot:');
    console.log(`  ID: ${existingSlot.timetable_id}`);
    console.log(`  Prof: ${existingSlot.professor_id}`);
    console.log(`  Time: ${existingSlot.day_of_week} ${existingSlot.time_slot_start}`);
    console.log(`  Subject: ${existingSlot.subject_id}\n`);

    // Create a duplicate at EXACT same time
    const { v4: uuidv4 } = require('uuid');
    const newId = uuidv4();

    const insertRes = await client.query(`
      INSERT INTO timetable (
        timetable_id, semester, branch_id, batch_id, professor_id, subject_id,
        day_of_week, time_slot_start, time_slot_end, slot_type, room_id, lab_id
      ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, 'THEORY', NULL, NULL)
      RETURNING timetable_id
    `, [newId, semester, branchId, existingSlot.professor_id, existingSlot.subject_id,
        existingSlot.day_of_week, existingSlot.time_slot_start, existingSlot.time_slot_end]);

    console.log('New Conflicting Slot Created:');
    console.log(`  ID: ${insertRes.rows[0].timetable_id}`);
    console.log(`  Prof: ${existingSlot.professor_id} (SAME)`);
    console.log(`  Time: ${existingSlot.day_of_week} ${existingSlot.time_slot_start} (SAME)`);
    console.log(`  Subject: ${existingSlot.subject_id}\n`);

    console.log('✓ Real conflict created!\n');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

createRealConflict();
