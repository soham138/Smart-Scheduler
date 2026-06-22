const pool = require('./src/config/db');

async function showAllAuthUsers() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          📊 AUTHENTICATION DATABASE - ALL USERS               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const result = await pool.query(
      `SELECT 
        user_id,
        username,
        role,
        reference_id,
        email,
        is_active,
        created_at,
        last_login
      FROM auth_users 
      ORDER BY role, user_id`
    );

    if (result.rows.length === 0) {
      console.log('❌ No users found in database\n');
      process.exit(0);
    }

    // Display all users with detailed formatting
    console.log(`✅ TOTAL USERS: ${result.rows.length}\n`);
    
    result.rows.forEach((user, index) => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`${index + 1}. User ID: ${user.user_id}`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Reference ID: ${user.reference_id}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Status: ${user.is_active ? '✅ Active' : '❌ Inactive'}`);
      console.log(`   Created: ${new Date(user.created_at).toLocaleString()}`);
      console.log(`   Last Login: ${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}`);
    });

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          📈 SUMMARY BY ROLE                                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const adminCount = result.rows.filter(u => u.role === 'admin').length;
    const professorCount = result.rows.filter(u => u.role === 'professor').length;
    const studentCount = result.rows.filter(u => u.role === 'student').length;
    const developerCount = result.rows.filter(u => u.role === 'developer').length;

    console.log(`👨‍💼 Admin:       ${adminCount} user(s)`);
    console.log(`👨‍🏫 Professor:  ${professorCount} user(s)`);
    console.log(`👨‍🎓 Student:    ${studentCount} user(s)`);
    console.log(`🛠️  Developer:   ${developerCount} user(s)`);

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          🔐 ACTIVE STATUS SUMMARY                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const activeCount = result.rows.filter(u => u.is_active === true).length;
    const inactiveCount = result.rows.filter(u => u.is_active === false).length;

    console.log(`✅ Active:   ${activeCount} user(s)`);
    console.log(`❌ Inactive: ${inactiveCount} user(s)`);

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          📋 DETAILED TABLE VIEW                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.table(result.rows.map(u => ({
      'ID': u.user_id,
      'Username': u.username,
      'Role': u.role,
      'Ref ID': u.reference_id,
      'Email': u.email || 'N/A',
      'Active': u.is_active ? '✅' : '❌',
      'Created': new Date(u.created_at).toLocaleDateString()
    })));

    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

showAllAuthUsers();
