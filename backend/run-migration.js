const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db');

async function runMigration() {
  try {
    console.log('🔄 Running migration: Create auth_users table...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations/001_create_auth_users.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await pool.query(migration);
    
    console.log('✅ Migration completed successfully!');
    console.log('✅ auth_users table created');
    
    // Now insert the default admin user
    console.log('\n🔄 Inserting default admin user...');
    
    const insertQuery = `
      INSERT INTO auth_users (username, password_hash, role, reference_id, email, is_active)
      VALUES ('admin', '$2b$10$Xa8O9pLJI.7hYPdoNu3l0eVQZmY9XQZqK5vQnZr4KkDYZrmF5fR0K', 'admin', 1, 'admin@college.edu', true)
      ON CONFLICT (username) DO NOTHING;
    `;
    
    const result = await pool.query(insertQuery);
    
    if (result.rowCount > 0) {
      console.log('✅ Default admin user created successfully!');
      console.log('   Username: admin');
      console.log('   Password: admin123');
      console.log('   Hash: $2b$10$Xa8O9pLJI.7hYPdoNu3l0eVQZmY9XQZqK5vQnZr4KkDYZrmF5fR0K');
    } else {
      console.log('ℹ️  Default admin user already exists (skipped)');
    }
    
    // Verify the user was created
    const verifyQuery = 'SELECT user_id, username, role, is_active FROM auth_users WHERE username = $1';
    const verifyResult = await pool.query(verifyQuery, ['admin']);
    
    if (verifyResult.rows.length > 0) {
      console.log('\n✅ Verification successful:');
      console.log('   User ID: ' + verifyResult.rows[0].user_id);
      console.log('   Username: ' + verifyResult.rows[0].username);
      console.log('   Role: ' + verifyResult.rows[0].role);
      console.log('   Active: ' + verifyResult.rows[0].is_active);
    }
    
    console.log('\n✅ Setup complete! All users ready for authentication.');
    console.log('\n🎯 Next steps:');
    console.log('   1. Start backend: npm start');
    console.log('   2. Start frontend: npm start');
    console.log('   3. Navigate to: http://localhost:3000');
    console.log('   4. Select Developer Panel');
    console.log('   5. Login with: admin / admin123');
    console.log('   6. Create other users (professors, students) via Developer Panel');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
