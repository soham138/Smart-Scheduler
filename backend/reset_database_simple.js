#!/usr/bin/env node
/**
 * RESET DATABASE WITH NEW DATA STRUCTURE - SIMPLIFIED
 */

const pool = require('./src/config/db');

async function clearAndInsert() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║          DATABASE RESET & DATA INSERTION                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // ========================================================================
    // STEP 1: CLEAR ALL DATA
    // ========================================================================
    console.log('🗑️  STEP 1: CLEARING ALL DATA\n');

    await pool.query('DELETE FROM timetable');
    await pool.query('DELETE FROM subjects');
    await pool.query('DELETE FROM batches');
    await pool.query('DELETE FROM professors');
    await pool.query('DELETE FROM branches');
    
    console.log('   ✓ All data cleared\n');

    // ========================================================================
    // STEP 2: INSERT BRANCHES
    // ========================================================================
    console.log('🏢 STEP 2: INSERTING BRANCHES\n');

    const branches = [
      { id: '243337b3-deeb-4023-ac29-5c55db8356d1', name: 'Computer Science', code: 'CS' },
      { id: '8e1571fa-1234-5678-abcd-ef1234567890', name: 'IoT Engineering', code: 'IoT' },
      { id: '941a4552-9876-5432-dcba-1234567890ab', name: 'AIML', code: 'AIML' }
    ];

    for (const branch of branches) {
      await pool.query('INSERT INTO branches (branch_id, name, code) VALUES ($1, $2, $3)', [branch.id, branch.name, branch.code]);
      console.log(`   ✓ ${branch.name}`);
    }
    console.log();

    // ========================================================================
    // STEP 3: INSERT PROFESSORS (30)
    // ========================================================================
    console.log('👨‍🏫 STEP 3: INSERTING 30 PROFESSORS\n');

    const professorNames = [
      'Dr. Rajesh Kumar', 'Dr. Priya Sharma', 'Dr. Amit Patel', 'Dr. Sneha Kulkarni', 'Dr. Vikram Desai',
      'Dr. Isha Kapoor', 'Dr. Rohit Singh', 'Dr. Nidhi Arora', 'Dr. Anil Kumar', 'Dr. Divya Pandey',
      'Dr. Sameer Malik', 'Dr. Pooja Saxena', 'Dr. Harsh Dixit', 'Dr. Kavya Nair', 'Dr. Rahul Deshmukh',
      'Dr. Meera Joshi', 'Dr. Akshay Singh', 'Dr. Ritu Bansal', 'Dr. Neha Singh', 'Dr. Vivek Mishra',
      'Dr. Anjali Gupta', 'Dr. Rohan Verma', 'Dr. Sanjay Chopra', 'Dr. Hari Patel', 'Dr. Minal Gupta',
      'Dr. Arjun Singh', 'Dr. Priya Verma', 'Dr. Karan Sharma', 'Dr. Deepak Kumar', 'Dr. Mansi Joshi'
    ];

    for (let i = 0; i < professorNames.length; i++) {
      const profId = '10000000-0000-0000-0000-' + String(10000 + i).padStart(12, '0');
      const email = `prof${i + 1}@smarttt.edu`;
      await pool.query('INSERT INTO professors (professor_id, name, email) VALUES ($1, $2, $3)', [profId, professorNames[i], email]);
    }
    console.log(`   ✓ Inserted 30 professors\n`);

    // ========================================================================
    // STEP 4: INSERT SUBJECTS
    // ========================================================================
    console.log('📚 STEP 4: INSERTING SUBJECTS\n');

    let subjId = 0;
    const subjects = [];

    // Helper function to determine subject type
    const getSubjectType = (name) => name.includes('Lab:') ? 'LAB' : 'THEORY';

    // Semester 1-2: 5 subjects (all branches same)
    console.log('   Semesters 1-2: 5 subjects (4 theory+lab, 1 lab-only)\n');
    const sem12SubjectNames = [
      'Programming Fundamentals', 'Data Structures', 'Database Basics', 'Web Development', 'Lab: Programming'
    ];
    
    for (let sem = 1; sem <= 2; sem++) {
      for (const name of sem12SubjectNames) {
        const id = '20000000-0000-0000-0000-' + String(20000 + subjId).padStart(12, '0');
        const type = getSubjectType(name);
        await pool.query('INSERT INTO subjects (subject_id, name, type, semester) VALUES ($1, $2, $3, $4)', [id, name, type, sem]);
        subjects.push({ id, sem, name });
        subjId++;
      }
      console.log(`     ✓ Added to Semester ${sem}`);
    }
    console.log();

    // Semester 3-4: 5 subjects (Computer & IoT same, AIML different)
    console.log('   Semesters 3-4: 5 subjects (CS/IoT same, AIML different)\n');
    const ciot34SubjectNames = [
      'Data Structures', 'Algorithms', 'Operating Systems', 'Networks', 'Lab: Advanced Programming'
    ];
    
    for (let sem = 3; sem <= 4; sem++) {
      for (const name of ciot34SubjectNames) {
        const id = '20000000-0000-0000-0000-' + String(20000 + subjId).padStart(12, '0');
        const type = getSubjectType(name);
        await pool.query('INSERT INTO subjects (subject_id, name, type, semester) VALUES ($1, $2, $3, $4)', [id, name, type, sem]);
        subjects.push({ id, sem, name, branch: 'CS/IoT' });
        subjId++;
      }
      console.log(`     ✓ Added to Semester ${sem} (CS/IoT)`);
    }

    // AIML different for Sem 3-4
    const aiml34SubjectNames = [
      'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'Lab: ML Frameworks'
    ];
    
    for (let sem = 3; sem <= 4; sem++) {
      for (const name of aiml34SubjectNames) {
        const id = '20000000-0000-0000-0000-' + String(20000 + subjId).padStart(12, '0');
        const type = getSubjectType(name);
        await pool.query('INSERT INTO subjects (subject_id, name, type, semester) VALUES ($1, $2, $3, $4)', [id, name, type, sem]);
        subjects.push({ id, sem, name, branch: 'AIML' });
        subjId++;
      }
      console.log(`     ✓ Added to Semester ${sem} (AIML)`);
    }
    console.log();

    // Semester 5-6: 5 subjects (different per branch)
    console.log('   Semesters 5-6: 5 subjects (different per branch)\n');
    
    const branchNames = ['Computer', 'IoT', 'AIML'];
    for (let sem = 5; sem <= 6; sem++) {
      for (const branch of branchNames) {
        const branchSubjects = [
          `Advanced ${branch} Architecture`, `${branch} Security`, `${branch} Optimization`, 
          `${branch} Frameworks`, `Lab: ${branch} Advanced`
        ];
        for (const name of branchSubjects) {
          const id = '20000000-0000-0000-0000-' + String(20000 + subjId).padStart(12, '0');
          const type = getSubjectType(name);
          await pool.query('INSERT INTO subjects (subject_id, name, type, semester) VALUES ($1, $2, $3, $4)', [id, name, type, sem]);
          subjects.push({ id, sem, name, branch });
          subjId++;
        }
        console.log(`     ✓ Added ${branch} subjects to Semester ${sem}`);
      }
    }
    console.log();

    // Semester 7-8: 4 subjects (3 theory+lab, 1 theory-only, different per branch)
    console.log('   Semesters 7-8: 4 subjects (3 theory+lab, 1 theory-only)\n');
    
    for (let sem = 7; sem <= 8; sem++) {
      for (const branch of branchNames) {
        const branchSubjects = [
          `Advanced ${branch} Topics`, `${branch} Standards`, `${branch} Integration`, 
          `${branch} Seminar` // Theory-only
        ];
        for (const name of branchSubjects) {
          const id = '20000000-0000-0000-0000-' + String(20000 + subjId).padStart(12, '0');
          const type = getSubjectType(name);
          await pool.query('INSERT INTO subjects (subject_id, name, type, semester) VALUES ($1, $2, $3, $4)', [id, name, type, sem]);
          subjects.push({ id, sem, name, branch });
          subjId++;
        }
        console.log(`     ✓ Added ${branch} subjects to Semester ${sem}`);
      }
    }
    console.log();

    // ========================================================================
    // STEP 5: INSERT BATCHES
    // ========================================================================
    console.log('👥 STEP 5: INSERTING BATCHES\n');

    let batchId = 0;
    for (const branch of branches) {
      for (let batchNum = 1; batchNum <= 2; batchNum++) {
        for (let sem = 1; sem <= 8; sem++) {
          const id = '30000000-0000-0000-0000-' + String(30000 + batchId).padStart(12, '0');
          await pool.query(
            'INSERT INTO batches (batch_id, branch_id, batch_number, semester) VALUES ($1, $2, $3, $4)',
            [id, branch.id, batchNum, sem]
          );
          batchId++;
        }
      }
      console.log(`   ✓ ${branch.name}: 2 batches (16 batch-semester records)`);
    }
    console.log();

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  ✅ SUCCESS                               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📊 Data Inserted:');
    console.log('   • 3 Branches (Computer, IoT, AIML)');
    console.log('   • 30 Professors');
    console.log(`   • ${subjId} Subjects`);
    console.log('   • 6 Batches (2 per branch)');
    console.log('\n📚 Subject Structure:');
    console.log('   ✓ Sem 1-2: 5 subjects (4 theory+lab, 1 lab-only) - All branches');
    console.log('   ✓ Sem 3-4: 5 subjects (4 theory+lab, 1 lab-only) - CS/IoT same, AIML different');
    console.log('   ✓ Sem 5-6: 5 subjects (4 theory+lab, 1 lab-only) - Different per branch');
    console.log('   ✓ Sem 7-8: 4 subjects (3 theory+lab, 1 theory-only) - Different per branch\n');

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

clearAndInsert();
