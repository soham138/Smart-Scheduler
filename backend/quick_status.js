const pool = require('./src/config/db');

async function status() {
  const res = await pool.query('SELECT COUNT(*) as count FROM timetable');
  console.log('Total classes in database: ' + res.rows[0].count);
  pool.end();
}

status();
