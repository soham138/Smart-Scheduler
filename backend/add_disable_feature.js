const pool = require('./src/config/db');

async function addProfessorDisableFeature() {
  try {
    console.log('[DB] Adding disable feature to professors...\n');

    // 1. Check if column exists
    const checkColumn = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='professors' AND column_name='is_active'
    `);

    if (checkColumn.rows.length === 0) {
      // Add is_active column
      await pool.query(`
        ALTER TABLE professors ADD COLUMN is_active BOOLEAN DEFAULT true;
      `);
      console.log('✅ Added is_active column to professors table');
    } else {
      console.log('ℹ️  Column is_active already exists');
    }

    // 2. Check if subjects table has is_active column
    const checkSubjectColumn = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='subjects' AND column_name='is_active'
    `);

    if (checkSubjectColumn.rows.length === 0) {
      // Add is_active column to subjects
      await pool.query(`
        ALTER TABLE subjects ADD COLUMN is_active BOOLEAN DEFAULT true;
      `);
      console.log('✅ Added is_active column to subjects table');
    } else {
      console.log('ℹ️  Column is_active already exists in subjects');
    }

    // 3. Show current professors
    console.log('\n📊 Current Professors Status:');
    const profs = await pool.query(`SELECT professor_id, name, is_active FROM professors`);
    profs.rows.forEach(p => {
      console.log(`   ${p.name} - Status: ${p.is_active ? '✅ Active' : '❌ Disabled'}`);
    });

    console.log('\n✅ Migration complete!');
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addProfessorDisableFeature();
