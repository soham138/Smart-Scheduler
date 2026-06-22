const pool = require('./src/config/db');

async function renumberUserIds() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          🔄 AUTO-RENUMBERING USER IDs                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Get all users ordered by user_id
    const result = await pool.query(
      'SELECT user_id FROM auth_users ORDER BY user_id ASC'
    );

    if (result.rows.length === 0) {
      console.log('❌ No users found\n');
      process.exit(0);
    }

    console.log(`📋 Found ${result.rows.length} users to renumber\n`);
    console.log('BEFORE:');
    const beforeResult = await pool.query(
      'SELECT user_id, username, role FROM auth_users ORDER BY user_id'
    );
    console.table(beforeResult.rows);

    // Start transaction
    await pool.query('BEGIN');

    // Create temporary column to store old IDs
    console.log('\n⏳ Renumbering user IDs...\n');

    // Renumber sequentially
    for (let i = 0; i < result.rows.length; i++) {
      const oldId = result.rows[i].user_id;
      const newId = i + 1;

      // Update the user ID
      await pool.query(
        'UPDATE auth_users SET user_id = $1 WHERE user_id = $2',
        [newId, oldId]
      );

      console.log(`✓ ID ${oldId} → ID ${newId}`);
    }

    // Reset the sequence for next inserts
    await pool.query(
      `SELECT setval('auth_users_user_id_seq', 
        (SELECT MAX(user_id) FROM auth_users))`
    );

    // Commit transaction
    await pool.query('COMMIT');

    console.log('\n✅ AFTER renumbering:');
    const afterResult = await pool.query(
      'SELECT user_id, username, role FROM auth_users ORDER BY user_id'
    );
    console.table(afterResult.rows);

    console.log('\n✅ User IDs renumbered successfully and sequence reset!\n');
    process.exit(0);
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

renumberUserIds();
