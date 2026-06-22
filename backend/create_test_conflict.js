/**
 * Create test conflict by adding duplicate professor assignment
 */

const pool = require('./src/config/db');

async function createTestConflict() {
  const client = await pool.connect();
  try {
    // Get first branch and semester with timetable
    const branchRes = await client.query(`
      SELECT DISTINCT branch_id FROM timetable LIMIT 1
    `);

    if (branchRes.rows.length === 0) {
      console.log('No timetable entries found');
      process.exit(1);
    }

    const branchId = branchRes.rows[0].branch_id;

    // Get existing slots
    const slotsRes = await client.query(`
      SELECT t.timetable_id, t.professor_id, t.semester, t.day_of_week, t.time_slot_start, t.time_slot_end, s.name as subject_name
      FROM timetable t
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.branch_id = $1
      AND t.slot_type = 'THEORY'
      LIMIT 5
    `, [branchId]);

    if (slotsRes.rows.length < 2) {
      console.log('Not enough slots to create conflict');
      process.exit(1);
    }

    const slot1 = slotsRes.rows[0];
    const slot2 = slotsRes.rows[1];

    console.log('\n Creating Test Conflict...\n');
    console.log(`Slot 1 (${slot1.timetable_id}): ${slot1.subject_name} with Prof ${slot1.professor_id}`);
    console.log(`  Time: ${slot1.day_of_week} ${slot1.time_slot_start}-${slot1.time_slot_end}\n`);

    // Assign same professor to slot2 to create conflict
    const updateRes = await client.query(`
      UPDATE timetable
      SET professor_id = $1
      WHERE timetable_id = $2
      RETURNING *
    `, [slot1.professor_id, slot2.timetable_id]);

    console.log(`Slot 2 (${slot2.timetable_id}): Updated to use same professor (${slot1.professor_id})`);
    console.log(`  Time: ${slot2.day_of_week} ${updateRes.rows[0].time_slot_start}-${updateRes.rows[0].time_slot_end}\n`);

    console.log('✓ Test conflict created!\n');
    console.log('Now run: Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:5000/api/timetable/check-conflicts/' + branchId + '/1" | Select-Object -ExpandProperty Content | ConvertFrom-Json | Select-Object -ExpandProperty conflicts\n');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

createTestConflict();
