const pool = require('./src/config/db');

async function fixDeveloperRefId() {
  try {
    console.log('[DB] Connecting to: localhost:5432/smarttt as postgres');
    
    // Update developer user to have reference_id = 1
    const result = await pool.query(
      'UPDATE auth_users SET reference_id = 1 WHERE role = $1 AND reference_id IS NULL RETURNING user_id, username, role, reference_id',
      ['developer']
    );

    if (result.rowCount > 0) {
      console.log('✅ Updated developer user reference_id');
      console.log('  User:', result.rows[0].username, 'now has reference_id:', result.rows[0].reference_id);
    } else {
      console.log('ℹ️  Developer already has reference_id');
    }

    // Show all role-specific IDs
    console.log('\n📊 ROLE-SPECIFIC IDs:');
    console.log('═'.repeat(50));
    
    const allUsers = await pool.query(
      `SELECT role, reference_id, username 
       FROM auth_users 
       WHERE reference_id IS NOT NULL
       ORDER BY role, reference_id`
    );

    const byRole = {};
    allUsers.rows.forEach(u => {
      if (!byRole[u.role]) byRole[u.role] = [];
      byRole[u.role].push(u);
    });

    const roleEmojis = { admin: '👨‍💼', professor: '👨‍🏫', student: '👨‍🎓', developer: '🔧' };
    
    for (const [role, users] of Object.entries(byRole)) {
      console.log(`\n${roleEmojis[role]} ${role.toUpperCase()}:`);
      users.forEach(u => {
        console.log(`   ${u.reference_id}️⃣  ${u.username}`);
      });
    }

    console.log('\n✅ Setup complete!');
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixDeveloperRefId();
