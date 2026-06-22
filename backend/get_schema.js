require('dotenv').config({ path: './backend/.env' });
const pool = require('./src/config/db');

(async () => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name='timetable' 
      ORDER BY ordinal_position
    `);
    console.log('Timetable columns:\n');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name} (${row.data_type})`);
    });
    client.release();
    process.exit(0);
  } catch(err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
