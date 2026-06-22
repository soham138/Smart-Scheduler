const pool = require('./src/config/db');

async function fixDevRef() {
  try {
    // Check current value
    const check = await pool.query('SELECT reference_id FROM auth_users WHERE role = $1', ['developer']);
    console.log('Current dev ref_id:', check.rows[0].reference_id);

    // Update to 1
    await pool.query('UPDATE auth_users SET reference_id = 1 WHERE role = $1', ['developer']);
    
    // Verify
    const verify = await pool.query('SELECT reference_id FROM auth_users WHERE role = $1', ['developer']);
    console.log('After update:', verify.rows[0].reference_id);
    
    // Show all
    const all = await pool.query('SELECT username, role, reference_id FROM auth_users ORDER BY role, reference_id');
    console.log('\nAll users:');
    all.rows.forEach(r => {
      console.log(`  ${r.role.padEnd(10)} | ${r.username.padEnd(15)} | Ref ID: ${r.reference_id}`);
    });
    
    await pool.end();
  } catch (e) {
    console.error(e);
  }
}

fixDevRef();
