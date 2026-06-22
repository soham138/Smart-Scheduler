// Run database migration to add hours_per_week column
const pool = require('./src/config/db');

async function runMigration() {
  try {
    console.log('🔄 Starting migration: Adding hours_per_week to professors table...\n');

    // Add column to professors table
    await pool.query(`
      ALTER TABLE professors 
      ADD COLUMN IF NOT EXISTS hours_per_week INTEGER DEFAULT 30 CHECK (hours_per_week > 0 AND hours_per_week <= 40);
    `);
    console.log('✅ Column added successfully');

    // Update existing professors
    const updateResult = await pool.query(`
      UPDATE professors 
      SET hours_per_week = 30 
      WHERE hours_per_week IS NULL;
    `);
    console.log(`✅ Updated ${updateResult.rowCount} existing professors with default 30 hours/week`);

    // Verify the migration
    const verifyResult = await pool.query(`
      SELECT COUNT(*) as total_professors, 
             COUNT(CASE WHEN hours_per_week IS NOT NULL THEN 1 END) as with_hours,
             AVG(hours_per_week) as avg_hours,
             MIN(hours_per_week) as min_hours,
             MAX(hours_per_week) as max_hours
      FROM professors;
    `);
    
    const stats = verifyResult.rows[0];
    console.log('\n📊 Verification Results:');
    console.log(`   Total professors: ${stats.total_professors}`);
    console.log(`   Professors with hours: ${stats.with_hours}`);
    console.log(`   Average hours: ${stats.avg_hours ? parseFloat(stats.avg_hours).toFixed(2) : 'N/A'}`);
    console.log(`   Min hours: ${stats.min_hours} | Max hours: ${stats.max_hours}`);

    console.log('\n✅ Migration completed successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
