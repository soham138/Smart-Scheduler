const pool = require('./src/config/db');

async function showAuthTableStructure() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║         AUTHENTICATION TABLE STRUCTURE & STORED DATA            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // 1. Show table structure
    console.log('📋 TABLE: auth_users');
    console.log('─'.repeat(70));
    
    const structureQuery = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'auth_users'
      ORDER BY ordinal_position;
    `;
    
    const result = await pool.query(structureQuery);
    
    console.log('\nCOLUMN NAME          | DATA TYPE      | NULLABLE | DEFAULT');
    console.log('─'.repeat(70));
    result.rows.forEach(row => {
      const colName = row.column_name.padEnd(20);
      const dataType = row.data_type.padEnd(14);
      const nullable = row.is_nullable === 'YES' ? 'YES' : 'NO';
      const defaultVal = row.column_default || '-';
      console.log(`${colName} | ${dataType} | ${nullable.padEnd(8)} | ${defaultVal}`);
    });

    // 2. Show all data organized by ROLE
    console.log('\n\n📊 ALL STORED DATA (ORGANIZED BY ROLE)');
    console.log('═'.repeat(70));

    const allDataQuery = `
      SELECT * FROM auth_users ORDER BY role, user_id;
    `;
    
    const allData = await pool.query(allDataQuery);
    
    // Group by role
    let byRole = {};
    allData.rows.forEach(row => {
      if (!byRole[row.role]) byRole[row.role] = [];
      byRole[row.role].push(row);
    });

    if (allData.rows.length === 0) {
      console.log('\nNo users found.');
    } else {
      // Display each role section
      const roleEmojis = {
        admin: '👨‍💼',
        professor: '👨‍🏫',
        student: '👨‍🎓',
        developer: '🔧'
      };

      for (const [role, users] of Object.entries(byRole)) {
        console.log(`\n${roleEmojis[role]} ROLE: ${role.toUpperCase()} (${users.length} users)`);
        console.log('─'.repeat(70));
        
        users.forEach((user, idx) => {
          console.log(`
  ┌─ User ${idx + 1}
  ├─ ID (user_id):        ${user.user_id}
  ├─ Username:            ${user.username}
  ├─ Email:               ${user.email}
  ├─ Reference ID:        ${user.reference_id || 'N/A'}
  ├─ Role:                ${user.role}
  ├─ Status:              ${user.is_active ? '✅ Active' : '❌ Inactive'}
  ├─ Created:             ${new Date(user.created_at).toLocaleDateString()}
  ├─ Last Login:          ${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
  └─ Password Hash:       ${user.password_hash.substring(0, 20)}...`);
        });
      }
    }

    // 3. Show constraints
    console.log('\n\n🔐 TABLE CONSTRAINTS');
    console.log('─'.repeat(70));
    
    const constraintQuery = `
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'auth_users';
    `;
    
    const constraints = await pool.query(constraintQuery);
    constraints.rows.forEach(c => {
      console.log(`  • ${c.constraint_name} (${c.constraint_type})`);
    });

    // 4. Show indices
    console.log('\n\n📑 INDICES');
    console.log('─'.repeat(70));
    
    const indexQuery = `
      SELECT indexname FROM pg_indexes WHERE tablename = 'auth_users';
    `;
    
    const indices = await pool.query(indexQuery);
    indices.rows.forEach(idx => {
      console.log(`  • ${idx.indexname}`);
    });

    // 5. Summary
    console.log('\n\n📈 SUMMARY');
    console.log('═'.repeat(70));
    const totalUsers = allData.rows.length;
    const activeUsers = allData.rows.filter(u => u.is_active).length;
    
    console.log(`  Total Users:         ${totalUsers}`);
    console.log(`  Active Users:        ${activeUsers}`);
    console.log(`  Inactive Users:      ${totalUsers - activeUsers}`);
    
    const roleCount = {};
    Object.entries(byRole).forEach(([role, users]) => {
      roleCount[role] = users.length;
    });
    
    console.log(`\n  Users by Role:`);
    Object.entries(roleCount).forEach(([role, count]) => {
      console.log(`    • ${role}: ${count}`);
    });

    console.log('\n');
    await pool.end();

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

showAuthTableStructure();
