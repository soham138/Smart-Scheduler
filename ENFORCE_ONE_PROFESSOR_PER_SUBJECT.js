#!/usr/bin/env node
/**
 * Enforce ONE professor per subject (exclusive assignment)
 * With 31 subjects and 32 professors: 31 get 1 subject, 1 gets 0 (which is OK)
 */

require('./backend/node_modules/dotenv').config({ path: './backend/.env' });
const pool = require('./backend/src/config/db');

async function enforceOnePerSubject() {
  try {
    console.log('\n🔧 ENFORCING: ONE PROFESSOR PER SUBJECT (Exclusive Assignment)\n');

    // Step 1: Get stats
    const subjectsCount = await pool.query(`SELECT COUNT(*) as count FROM subjects`);
    const profsCount = await pool.query(`SELECT COUNT(*) as count FROM professors`);
    const totalSubjects = subjectsCount.rows[0].count;
    const totalProfs = profsCount.rows[0].count;

    console.log(`📊 System Stats:`);
    console.log(`   Total subjects: ${totalSubjects}`);
    console.log(`   Total professors: ${totalProfs}`);
    console.log(`   Fair distribution: ${totalSubjects} professors get 1 subject, ${totalProfs - totalSubjects} get 0\n`);

    // Step 2: Clear all assignments
    await pool.query(`DELETE FROM professors_subjects`);
    console.log(`✓ Cleared all existing assignments\n`);

    // Step 3: Get all subjects and professors
    const subjects = await pool.query(`
      SELECT subject_id, code, name, semester FROM subjects ORDER BY code
    `);

    const professors = await pool.query(`
      SELECT professor_id, name FROM professors ORDER BY name  
    `);

    // Step 4: Assign each subject to exactly one professor (round-robin)
    console.log(`🔄 Assigning subjects to professors (one-to-one):\n`);

    for (let i = 0; i < subjects.rows.length; i++) {
      const subject = subjects.rows[i];
      const professor = professors.rows[i]; // Round-robin assignment

      await pool.query(`
        INSERT INTO professors_subjects (professor_id, subject_id)
        VALUES ($1, $2)
      `, [professor.professor_id, subject.subject_id]);

      console.log(`   ✓ ${subject.code.padEnd(6)} → ${professor.name}`);
    }

    console.log(`\n🎯 Assignment Complete!\n`);

    // Step 5: Verify final state
    const verify = await pool.query(`
      SELECT 
        p.name,
        COUNT(ps.subject_id) as subject_count,
        STRING_AGG(s.code, ', ' ORDER BY s.code) as subjects
      FROM professors p
      LEFT JOIN professors_subjects ps ON p.professor_id = ps.professor_id
      LEFT JOIN subjects s ON ps.subject_id = s.subject_id
      GROUP BY p.professor_id, p.name
      ORDER BY subject_count DESC, p.name
    `);

    console.log(`✅ FINAL DISTRIBUTION (One Subject Per Professor):\n`);
    console.log(`Professor`.padEnd(30) + `Subjects  Teaching`);
    console.log(`═`.repeat(70));

    let withSubject = 0;
    let withoutSubject = 0;

    verify.rows.forEach(prof => {
      const status = prof.subject_count === 1 ? '✅' : prof.subject_count === 0 ? '⚠️' : '❌';
      const subjects = prof.subjects || '(unassigned)';
      console.log(`${status} ${prof.name.padEnd(28)} ${prof.subject_count || 0}         ${subjects}`);
      
      if (prof.subject_count === 1) withSubject++;
      if (prof.subject_count === 0) withoutSubject++;
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Professors with 1 subject: ${withSubject}`);
    console.log(`   Professors with 0 subjects (OK): ${withoutSubject}`);
    console.log(`   Total assignments: ${totalSubjects}`);

    // Verify no subject has multiple professors
    const multiAssigned = await pool.query(`
      SELECT 
        s.code, 
        s.name,
        COUNT(ps.professor_id) as prof_count,
        STRING_AGG(p.name, ', ') as professors
      FROM subjects s
      LEFT JOIN professors_subjects ps ON s.subject_id = ps.subject_id
      LEFT JOIN professors p ON ps.professor_id = p.professor_id
      GROUP BY s.subject_id, s.code, s.name
      HAVING COUNT(ps.professor_id) > 1
    `);

    if (multiAssigned.rows.length > 0) {
      console.log(`\n⚠️  WARNING: Found subjects assigned to multiple professors!`);
      multiAssigned.rows.forEach(row => {
        console.log(`   ${row.code}: ${row.professors}`);
      });
    } else {
      console.log(`\n✅ VERIFIED: No subject is assigned to multiple professors!`);
    }

    console.log(`\n✅ Distribution enforced successfully!\n`);

  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  process.exit(0);
}

enforceOnePerSubject();
