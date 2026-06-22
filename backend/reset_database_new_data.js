#!/usr/bin/env node
/**
 * CLEAR & RESET DATABASE WITH NEW DATA STRUCTURE
 * 
 * Data Structure:
 * - 30 Professors
 * - Subjects by semester (as specified)
 * - 3 branches: Computer, IoT, AIML
 * - New timetable entries
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
    console.log('   ✓ Cleared timetable');

    await pool.query('DELETE FROM subjects');
    console.log('   ✓ Cleared subjects');

    await pool.query('DELETE FROM batches');
    console.log('   ✓ Cleared batches');

    // Try to clear professor_subject assignments first
    try {
      await pool.query('DELETE FROM professors_subjects');
      console.log('   ✓ Cleared professors_subjects');
    } catch (e) {
      console.log('   ⓘ professors_subjects table not found (skipped)');
    }

    // Try to clear subjects_branches mapping
    try {
      await pool.query('DELETE FROM subjects_branches');
      console.log('   ✓ Cleared subjects_branches');
    } catch (e) {
      console.log('   ⓘ subjects_branches table not found (skipped)');
    }

    // Try to clear branch_subjects if it exists
    try {
      await pool.query('DELETE FROM branch_subjects');
      console.log('   ✓ Cleared branch_subjects');
    } catch (e) {
      console.log('   ⓘ branch_subjects table not found (skipped)');
    }

    await pool.query('DELETE FROM professors');
    console.log('   ✓ Cleared professors');

    await pool.query('DELETE FROM branches');
    console.log('   ✓ Cleared branches\n');

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
      await pool.query(
        'INSERT INTO branches (branch_id, name, code) VALUES ($1, $2, $3)',
        [branch.id, branch.name, branch.code]
      );
      console.log(`   ✓ Inserted ${branch.name}`);
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
      await pool.query(
        'INSERT INTO professors (professor_id, name, email) VALUES ($1, $2, $3)',
        [profId, professorNames[i], email]
      );
    }
    console.log(`   ✓ Inserted ${professorNames.length} professors\n`);

    // ========================================================================
    // STEP 4: INSERT SUBJECTS
    // ========================================================================
    console.log('📚 STEP 4: INSERTING SUBJECTS\n');

    // Helper function to generate subject IDs
    let subjectCounter = 0;
    function getSubjectId() {
      const id = '20000000-0000-0000-0000-' + String(20000 + subjectCounter).padStart(12, '0');
      subjectCounter++;
      return id;
    }

    // Helper function to get professor ID
    function getProfId(index) {
      return '10000000-0000-0000-0000-' + String(10000 + index).padStart(12, '0');
    }

    // Helper function to get random lecture count (3-4)
    function getRandomLectureCount() {
      return Math.random() < 0.5 ? 3 : 4;
    }

    // Store all subject IDs for professor assignment
    const allSubjectIds = [];
    const subjectBranchMappings = []; // Track which subjects belong to which branches

    // Semester 1, 2: 5 subjects (4 both + 1 labonly, same for all branches)
    console.log('   Semesters 1-2: 5 subjects (4 theory+lab, 1 lab-only)\n');
    const sem12Subjects = [
      { name: 'Programming Fundamentals', semester: 1, type: 'BOTH', hasLab: true },
      { name: 'Data Structures', semester: 1, type: 'BOTH', hasLab: true },
      { name: 'Database Basics', semester: 1, type: 'BOTH', hasLab: true },
      { name: 'Web Development', semester: 1, type: 'BOTH', hasLab: true },
      { name: 'Lab: Programming', semester: 1, type: 'LAB', hasLab: true }
    ];

    const sem12SubjectIds = {};
    for (let i = 0; i < sem12Subjects.length; i++) {
      const subId = getSubjectId();
      const lectureCount = sem12Subjects[i].type === 'LAB' ? 0 : getRandomLectureCount();
      const labCount = sem12Subjects[i].hasLab ? 3 : 0;

      await pool.query(
        'INSERT INTO subjects (subject_id, name, semester, type, weekly_lecture_count, weekly_lab_count) VALUES ($1, $2, $3, $4, $5, $6)',
        [subId, sem12Subjects[i].name, sem12Subjects[i].semester, sem12Subjects[i].type, lectureCount, labCount]
      );

      sem12SubjectIds[i] = subId;
      allSubjectIds.push(subId);
      // Sem 1-2 subjects belong to ALL branches
      subjectBranchMappings.push({ subjectId: subId, branches: ['CS', 'IoT', 'AIML'] });
      console.log(`     ✓ ${sem12Subjects[i].name} (Sem ${sem12Subjects[i].semester}, ${lectureCount} lectures/week)`);
    }

    // Semester 2 (same subjects, different semester)
    const sem2SubjectIds = {};
    console.log('\n   Semester 2: 5 subjects (same structure)\n');
    for (let i = 0; i < sem12Subjects.length; i++) {
      const subId = getSubjectId();
      const lectureCount = sem12Subjects[i].type === 'LAB' ? 0 : getRandomLectureCount();
      const labCount = sem12Subjects[i].hasLab ? 3 : 0;

      await pool.query(
        'INSERT INTO subjects (subject_id, name, semester, type, weekly_lecture_count, weekly_lab_count) VALUES ($1, $2, $3, $4, $5, $6)',
        [subId, sem12Subjects[i].name, 2, sem12Subjects[i].type, lectureCount, labCount]
      );

      sem2SubjectIds[i] = subId;
      allSubjectIds.push(subId);
      // Sem 1-2 subjects belong to ALL branches
      subjectBranchMappings.push({ subjectId: subId, branches: ['CS', 'IoT', 'AIML'] });
      console.log(`     ✓ ${sem12Subjects[i].name} (Sem 2, ${lectureCount} lectures/week)`);
    }

    // Semester 3, 4: 5 subjects (Computer & IoT same, AIML different)
    console.log('\n   Semesters 3-4: 5 subjects (Computer/IoT same, AIML different)\n');
    const sem34Subjects = [
      { name: 'Data Structures', semester: 3, type: 'BOTH', hasLab: true },
      { name: 'Algorithms', semester: 3, type: 'BOTH', hasLab: true },
      { name: 'Operating Systems', semester: 3, type: 'BOTH', hasLab: true },
      { name: 'Networks', semester: 3, type: 'BOTH', hasLab: true },
      { name: 'Lab: Advanced Programming', semester: 3, type: 'LAB', hasLab: true }
    ];

    const sem34SubjectIds = {};
    for (let i = 0; i < sem34Subjects.length; i++) {
      const subId = getSubjectId();
      const lectureCount = sem34Subjects[i].type === 'LAB' ? 0 : getRandomLectureCount();
      const labCount = sem34Subjects[i].hasLab ? 3 : 0;

      await pool.query(
        'INSERT INTO subjects (subject_id, name, semester, type, weekly_lecture_count, weekly_lab_count) VALUES ($1, $2, $3, $4, $5, $6)',
        [subId, sem34Subjects[i].name, sem34Subjects[i].semester, sem34Subjects[i].type, lectureCount, labCount]
      );

      sem34SubjectIds[i] = subId;
      allSubjectIds.push(subId);
      // Sem 3-4 CS/IoT subjects belong to CS and IoT only
      subjectBranchMappings.push({ subjectId: subId, branches: ['CS', 'IoT'] });
      console.log(`     ✓ ${sem34Subjects[i].name} (Sem ${sem34Subjects[i].semester}, ${lectureCount} lectures/week)`);
    }

    // Semester 4 (same as 3 for Computer & IoT)
    const sem4SubjectIds = {};
    console.log('\n   Semester 4: (Computer/IoT same as Sem 3)\n');
    for (let i = 0; i < sem34Subjects.length; i++) {
      const subId = getSubjectId();
      const lectureCount = sem34Subjects[i].type === 'LAB' ? 0 : getRandomLectureCount();
      const labCount = sem34Subjects[i].hasLab ? 3 : 0;

      await pool.query(
        'INSERT INTO subjects (subject_id, name, semester, type, weekly_lecture_count, weekly_lab_count) VALUES ($1, $2, $3, $4, $5, $6)',
        [subId, sem34Subjects[i].name, 4, sem34Subjects[i].type, lectureCount, labCount]
      );

      sem4SubjectIds[i] = subId;
      allSubjectIds.push(subId);
      // Sem 4 CS/IoT subjects belong to CS and IoT only
      subjectBranchMappings.push({ subjectId: subId, branches: ['CS', 'IoT'] });
      console.log(`     ✓ ${sem34Subjects[i].name} (Sem 4, ${lectureCount} lectures/week)`);
    }

    // AIML different for Sem 3, 4
    console.log('\n   Semesters 3-4: AIML different subjects\n');
    const aimlSem34Subjects = [
      { name: 'Machine Learning', semester: 3, type: 'BOTH', hasLab: true },
      { name: 'Deep Learning', semester: 3, type: 'BOTH', hasLab: true },
      { name: 'NLP', semester: 3, type: 'BOTH', hasLab: true },
      { name: 'Computer Vision', semester: 3, type: 'BOTH', hasLab: true },
      { name: 'Lab: ML Frameworks', semester: 3, type: 'LAB', hasLab: true }
    ];

    const aimlSem34SubjectIds = {};
    for (let i = 0; i < aimlSem34Subjects.length; i++) {
      const subId = getSubjectId();
      const lectureCount = aimlSem34Subjects[i].type === 'LAB' ? 0 : getRandomLectureCount();
      const labCount = aimlSem34Subjects[i].hasLab ? 3 : 0;

      await pool.query(
        'INSERT INTO subjects (subject_id, name, semester, type, weekly_lecture_count, weekly_lab_count) VALUES ($1, $2, $3, $4, $5, $6)',
        [subId, aimlSem34Subjects[i].name, aimlSem34Subjects[i].semester, aimlSem34Subjects[i].type, lectureCount, labCount]
      );

      aimlSem34SubjectIds[i] = subId;
      allSubjectIds.push(subId);
      // AIML Sem 3-4 subjects belong to AIML only
      subjectBranchMappings.push({ subjectId: subId, branches: ['AIML'] });
      console.log(`     ✓ ${aimlSem34Subjects[i].name} (Sem ${aimlSem34Subjects[i].semester}, ${lectureCount} lectures/week)`);
    }

    // Semester 4 AIML
    const aimlSem4SubjectIds = {};
    console.log('\n   Semester 4: AIML different subjects\n');
    for (let i = 0; i < aimlSem34Subjects.length; i++) {
      const subId = getSubjectId();
      const lectureCount = aimlSem34Subjects[i].type === 'LAB' ? 0 : getRandomLectureCount();
      const labCount = aimlSem34Subjects[i].hasLab ? 3 : 0;

      await pool.query(
        'INSERT INTO subjects (subject_id, name, semester, type, weekly_lecture_count, weekly_lab_count) VALUES ($1, $2, $3, $4, $5, $6)',
        [subId, aimlSem34Subjects[i].name, 4, aimlSem34Subjects[i].type, lectureCount, labCount]
      );

      aimlSem4SubjectIds[i] = subId;
      allSubjectIds.push(subId);
      // AIML Sem 4 subjects belong to AIML only
      subjectBranchMappings.push({ subjectId: subId, branches: ['AIML'] });
      console.log(`     ✓ ${aimlSem34Subjects[i].name} (Sem 4, ${lectureCount} lectures/week)`);
    }

    // Semester 5, 6: 5 subjects (different for all branches)
    console.log('\n   Semesters 5-6: 5 subjects (different for all branches)\n');

    const branches_list = ['Computer', 'IoT', 'AIML'];
    const branches_map = { 'Computer': 'CS', 'IoT': 'IoT', 'AIML': 'AIML' };
    const sem56SubjectIds = { Computer: {}, IoT: {}, AIML: {} };

    for (const branch of branches_list) {
      console.log(`     ${branch} Branch:`);
      const sem56Subjects = [
        { name: `Advanced ${branch} Architecture`, semester: 5, type: 'BOTH', hasLab: true },
        { name: `${branch} Security`, semester: 5, type: 'BOTH', hasLab: true },
        { name: `${branch} Optimization`, semester: 5, type: 'BOTH', hasLab: true },
        { name: `${branch} Frameworks`, semester: 5, type: 'BOTH', hasLab: true },
        { name: `Lab: ${branch} Advanced`, semester: 5, type: 'LAB', hasLab: true }
      ];

      for (let i = 0; i < sem56Subjects.length; i++) {
        const subId = getSubjectId();
        const lectureCount = sem56Subjects[i].type === 'LAB' ? 0 : getRandomLectureCount();
        const labCount = sem56Subjects[i].hasLab ? 3 : 0;

        await pool.query(
          'INSERT INTO subjects (subject_id, name, semester, type, weekly_lecture_count, weekly_lab_count) VALUES ($1, $2, $3, $4, $5, $6)',
          [subId, sem56Subjects[i].name, sem56Subjects[i].semester, sem56Subjects[i].type, lectureCount, labCount]
        );

        sem56SubjectIds[branch][i] = subId;
        allSubjectIds.push(subId);
        // Sem 5-6 subjects belong only to their own branch
        subjectBranchMappings.push({ subjectId: subId, branches: [branches_map[branch]] });
        console.log(`       ✓ ${sem56Subjects[i].name} (Sem 5, ${lectureCount} lectures/week)`);
      }
    }

    // Semester 6 (different for all branches)
    console.log('\n     Semester 6:\n');
    const sem6SubjectIds = { Computer: {}, IoT: {}, AIML: {} };

    for (const branch of branches_list) {
      console.log(`     ${branch} Branch:`);
      const sem6Subjects = [
        { name: `Advanced ${branch} Cloud`, semester: 6, type: 'BOTH', hasLab: true },
        { name: `${branch} Analytics`, semester: 6, type: 'BOTH', hasLab: true },
        { name: `${branch} Applications`, semester: 6, type: 'BOTH', hasLab: true },
        { name: `${branch} Systems`, semester: 6, type: 'BOTH', hasLab: true },
        { name: `Lab: ${branch} Project`, semester: 6, type: 'LAB', hasLab: true }
      ];

      for (let i = 0; i < sem6Subjects.length; i++) {
        const subId = getSubjectId();
        const lectureCount = sem6Subjects[i].type === 'LAB' ? 0 : getRandomLectureCount();
        const labCount = sem6Subjects[i].hasLab ? 3 : 0;

        await pool.query(
          'INSERT INTO subjects (subject_id, name, semester, type, weekly_lecture_count, weekly_lab_count) VALUES ($1, $2, $3, $4, $5, $6)',
          [subId, sem6Subjects[i].name, sem6Subjects[i].semester, sem6Subjects[i].type, lectureCount, labCount]
        );

        sem6SubjectIds[branch][i] = subId;
        allSubjectIds.push(subId);
        // Sem 6 subjects belong only to their own branch
        subjectBranchMappings.push({ subjectId: subId, branches: [branches_map[branch]] });
        console.log(`       ✓ ${sem6Subjects[i].name} (Sem 6, ${lectureCount} lectures/week)`);
      }
    }

    // Semester 7, 8: 4 subjects (3 both + 1 theoryonly, different for all branches)
    console.log('\n   Semesters 7-8: 4 subjects (3 theory+lab, 1 theory-only)\n');
    const sem78SubjectIds = { Computer: {}, IoT: {}, AIML: {} };

    for (const branch of branches_list) {
      console.log(`     ${branch} Branch:`);
      const sem7Subjects = [
        { name: `Advanced ${branch} Topics`, semester: 7, type: 'BOTH', hasLab: true },
        { name: `${branch} Standards`, semester: 7, type: 'BOTH', hasLab: true },
        { name: `${branch} Integration`, semester: 7, type: 'BOTH', hasLab: true },
        { name: `${branch} Seminar`, semester: 7, type: 'THEORY', hasLab: false }
      ];

      for (let i = 0; i < sem7Subjects.length; i++) {
        const subId = getSubjectId();
        const lectureCount = getRandomLectureCount();
        const labCount = sem7Subjects[i].hasLab ? 3 : 0;

        await pool.query(
          'INSERT INTO subjects (subject_id, name, semester, type, weekly_lecture_count, weekly_lab_count) VALUES ($1, $2, $3, $4, $5, $6)',
          [subId, sem7Subjects[i].name, sem7Subjects[i].semester, sem7Subjects[i].type, lectureCount, labCount]
        );

        sem78SubjectIds[branch][i] = subId;
        allSubjectIds.push(subId);
        // Sem 7-8 subjects belong only to their own branch
        subjectBranchMappings.push({ subjectId: subId, branches: [branches_map[branch]] });
        const typeStr = sem7Subjects[i].type === 'THEORY' ? ' (Theory only)' : '';
        console.log(`       ✓ ${sem7Subjects[i].name} (Sem 7, ${lectureCount} lectures/week)${typeStr}`);
      }
    }

    // Semester 8
    console.log('\n     Semester 8:\n');
    const sem8SubjectIds = { Computer: {}, IoT: {}, AIML: {} };

    for (const branch of branches_list) {
      console.log(`     ${branch} Branch:`);
      const sem8Subjects = [
        { name: `Advanced ${branch} Research`, semester: 8, type: 'BOTH', hasLab: true },
        { name: `${branch} Innovation`, semester: 8, type: 'BOTH', hasLab: true },
        { name: `${branch} Capstone`, semester: 8, type: 'BOTH', hasLab: true },
        { name: `${branch} Industry`, semester: 8, type: 'THEORY', hasLab: false }
      ];

      for (let i = 0; i < sem8Subjects.length; i++) {
        const subId = getSubjectId();
        const lectureCount = getRandomLectureCount();
        const labCount = sem8Subjects[i].hasLab ? 3 : 0;

        await pool.query(
          'INSERT INTO subjects (subject_id, name, semester, type, weekly_lecture_count, weekly_lab_count) VALUES ($1, $2, $3, $4, $5, $6)',
          [subId, sem8Subjects[i].name, sem8Subjects[i].semester, sem8Subjects[i].type, lectureCount, labCount]
        );

        sem8SubjectIds[branch][i] = subId;
        allSubjectIds.push(subId);
        // Sem 8 subjects belong only to their own branch
        subjectBranchMappings.push({ subjectId: subId, branches: [branches_map[branch]] });
        const typeStr = sem8Subjects[i].type === 'THEORY' ? ' (Theory only)' : '';
        console.log(`       ✓ ${sem8Subjects[i].name} (Sem 8, ${lectureCount} lectures/week)${typeStr}`);
      }
    }

    console.log();

    // ========================================================================
    // STEP 5: MAP SUBJECTS TO BRANCHES
    // ========================================================================
    console.log('🔗 STEP 5: MAPPING SUBJECTS TO BRANCHES\n');

    let branchMappingCount = 0;
    for (const mapping of subjectBranchMappings) {
      for (const branchCode of mapping.branches) {
        // Find branch ID by code
        let branchId;
        if (branchCode === 'CS') branchId = '243337b3-deeb-4023-ac29-5c55db8356d1';
        else if (branchCode === 'IoT') branchId = '8e1571fa-1234-5678-abcd-ef1234567890';
        else if (branchCode === 'AIML') branchId = '941a4552-9876-5432-dcba-1234567890ab';

        try {
          await pool.query(
            'INSERT INTO subjects_branches (subject_id, branch_id, is_applicable) VALUES ($1, $2, $3)',
            [mapping.subjectId, branchId, true]
          );
          branchMappingCount++;
        } catch (e) {
          // Ignore duplicate mappings
        }
      }
    }

    console.log(`   ✓ Created ${branchMappingCount} subject-branch mappings\n`);

    // ========================================================================
    // STEP 6: ASSIGN PROFESSORS TO SUBJECTS (Max 5 per professor)
    // ========================================================================
    console.log('👨‍🏫 STEP 6: ASSIGNING PROFESSORS TO SUBJECTS\n');
    console.log('   Max 5 subjects per professor\n');

    // Shuffle array randomly
    const shuffleArray = (arr) => {
      const newArr = [...arr];
      for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
      }
      return newArr;
    };

    // Shuffle subjects for random distribution
    const shuffledSubjects = shuffleArray(allSubjectIds);
    
    // Assign subjects to professors (max 5 per professor)
    const maxSubjectsPerProf = 5;
    const totalSubjects = shuffledSubjects.length;
    const totalProfessors = professorNames.length;
    
    console.log(`   📊 Distributing ${totalSubjects} subjects among ${totalProfessors} professors`);
    console.log(`   Each professor gets: ${Math.ceil(totalSubjects / totalProfessors)} subjects max\n`);

    let subjectIndex = 0;
    const profAssignments = {};

    for (let profIndex = 0; profIndex < totalProfessors; profIndex++) {
      const profId = getProfId(profIndex);
      profAssignments[profId] = 0;

      // Each professor gets max 5 subjects (or fewer if not enough subjects)
      const subjectsToAssign = Math.min(maxSubjectsPerProf, totalSubjects - subjectIndex);

      for (let i = 0; i < subjectsToAssign; i++) {
        if (subjectIndex >= shuffledSubjects.length) break;

        const subjectId = shuffledSubjects[subjectIndex];
        
        try {
          await pool.query(
            'INSERT INTO professors_subjects (professor_id, subject_id) VALUES ($1, $2)',
            [profId, subjectId]
          );
          profAssignments[profId]++;
          subjectIndex++;
        } catch (e) {
          // Skip if duplicate assignment
          subjectIndex++;
        }
      }

      if (profAssignments[profId] > 0) {
        console.log(`   ✓ Prof ${profIndex + 1}: ${profAssignments[profId]} subjects assigned`);
      }
    }

    console.log(`\n   ✅ Total assignments: ${subjectIndex}/${totalSubjects} subjects\n`);

    // ========================================================================
    // STEP 7: INSERT BATCHES
    // ========================================================================
    console.log('📚 STEP 7: INSERTING BATCHES\n');

    const batchIds = {};
    let batchCounter = 0;

    for (const branch of branches) {
      batchIds[branch.id] = [];
      for (let batchNum = 1; batchNum <= 2; batchNum++) {
        for (let sem = 1; sem <= 8; sem++) {
          const batchId = '30000000-0000-0000-0000-' + String(30000 + batchCounter).padStart(12, '0');
          await pool.query(
            'INSERT INTO batches (batch_id, branch_id, batch_number, semester) VALUES ($1, $2, $3, $4)',
            [batchId, branch.id, batchNum, sem]
          );
          batchIds[branch.id].push(batchId);
          batchCounter++;
        }
      }
      console.log(`   ✓ ${branch.name}: 2 batches (16 semester entries)`);
    }

    console.log();

    // ========================================================================
    // STEP 8: SUMMARY
    // ========================================================================
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  SUMMARY                                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('✅ Database reset complete!\n');
    console.log('📊 Data inserted:');
    console.log('   • 3 Branches');
    console.log('   • 30 Professors');
    console.log(`   • ${subjectCounter} Subjects (with type and lecture counts)`);
    console.log(`   • ${branchMappingCount} Subject-Branch mappings`);
    console.log('   • Professor-Subject assignments (max 5 per professor)');
    console.log('   • 6 Batches (2 per branch × 8 semesters each)');
    console.log('\n📚 Subject Structure:');
    console.log('   • Sem 1-2: 5 subjects (4 theory+lab, 1 lab-only) - All branches');
    console.log('   • Sem 3-4: 5 subjects (4 theory+lab, 1 lab-only) - CS/IoT same, AIML different');
    console.log('   • Sem 5-6: 5 subjects (4 theory+lab, 1 lab-only) - Different per branch');
    console.log('   • Sem 7-8: 4 subjects (3 theory+lab, 1 theory-only) - Different per branch');
    console.log('\n🎓 Professor Assignments:');
    console.log('   • Max 5 subjects per professor');
    console.log('   • Random distribution across all professors');
    console.log('   • Theory lectures: 3-4 per week (random)');
    console.log('\n🔗 Branch-Subject Mappings:');
    console.log(`   • ${branchMappingCount} mappings created - All subjects mapped to appropriate branches\n`);

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

// Run
console.log('\n⚠️  WARNING: This will DELETE all data from the database!');
console.log('Make sure you have a backup.\n');

clearAndInsert();
