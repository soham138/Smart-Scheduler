const pool = require('./src/config/db');
const bcrypt = require('bcryptjs');

async function createDeveloperUser() {
  try {
    console.log('Creating developer user...\n');

    // Hash the password
    const password = 'developer123';
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert developer user
    const result = await pool.query(
      `INSERT INTO auth_users (username, password_hash, role, reference_id, email, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (username) DO UPDATE SET password_hash = $2
       RETURNING user_id, username, role, email, is_active`,
      ['developer', passwordHash, 'developer', 1, 'developer@college.edu']
    );

    console.log('✅ Developer user created/updated:\n');
    console.table(result.rows[0]);
    console.log('\n📋 Developer Panel Credentials:');
    console.log('Username: developer');
    console.log('Password: developer123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createDeveloperUser();
