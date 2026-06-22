#!/usr/bin/env node
/**
 * Clear all data and add lab_count column to subjects table
 */

const pool = require('./src/config/db');

async function clearAndAddLabCount() {
  const client = await pool.connect();
  
  try {
    console.log('🗑️  Clearing all data...');
    
    await client.query('DELETE FROM professors_subjects');
    console.log('✅ Cleared professors_subjects');
    
    await client.query('DELETE FROM subjects_branches');
    console.log('✅ Cleared subjects_branches');
    
    await client.query('DELETE FROM timetable');
    console.log('✅ Cleared timetable');
    
    await client.query('DELETE FROM subjects');
    console.log('✅ Cleared subjects');
    
    await client.query('DELETE FROM professors');
    console.log('✅ Cleared professors');
    
    await client.query('DELETE FROM batches');
    console.log('✅ Cleared batches');

    console.log('\n📋 Adding lab_count column to subjects table...');
    
    // Add column if not exists
    await client.query(`
      ALTER TABLE subjects 
      ADD COLUMN IF NOT EXISTS lab_count INTEGER DEFAULT 2 CHECK (lab_count >= 0 AND lab_count <= 5)
    `);
    console.log('✅ Added lab_count column');

    console.log('\n📊 Current subjects table structure:');
    const columns = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'subjects' 
      ORDER BY ordinal_position
    `);
    
    console.log('Columns:');
    columns.rows.forEach(col => {
      console.log(`  • ${col.column_name}: ${col.data_type} (default: ${col.column_default || 'none'}, nullable: ${col.is_nullable})`);
    });

    console.log('\n📈 Data counts:');
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM professors) as professors,
        (SELECT COUNT(*) FROM subjects) as subjects,
        (SELECT COUNT(*) FROM professors_subjects) as professor_subjects,
        (SELECT COUNT(*) FROM branches) as branches
    `);
    
    console.log(`  • Professors: ${counts.rows[0].professors}`);
    console.log(`  • Subjects: ${counts.rows[0].subjects}`);
    console.log(`  • Professor-Subject mappings: ${counts.rows[0].professor_subjects}`);
    console.log(`  • Branches: ${counts.rows[0].branches}`);

    console.log('\n✅ Database cleared and lab_count column added successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

clearAndAddLabCount();
