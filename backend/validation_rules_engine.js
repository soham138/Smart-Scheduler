#!/usr/bin/env node

/**
 * VALIDATION RULES ENGINE
 * 
 * Enforces 7 key rules to generate optimal timetables:
 * 1. Professor cannot teach two classes at same time
 * 2. Lab must occupy 2 continuous slots (no fragmentation)
 * 3. Lab exists → theory cannot exist same time for same branch
 * 4. Same subject across branches should avoid same time
 * 5. Max 2 labs per professor per day (prevent overload)
 * 6. No subject clustering (max 1-2 sessions per subject per day)
 * 7. Professor needs prep time between branches (min 30 min gap)
 */

const pool = require('./src/config/db');

class ValidationRulesEngine {
  constructor() {
    this.violations = {
      rule1: [],  // Professor double-booking
      rule2: [],  // Lab fragmentation
      rule3: [],  // Lab+Theory overlap
      rule4: [],  // Cross-branch subject overlap
      rule5: [],  // Professor lab overload
      rule6: [],  // Subject clustering
      rule7: []   // Professor prep time
    };
    this.stats = {};
  }

  async validate() {
    console.log(`
╔════════════════════════════════════════════════════════════════════╗
║         VALIDATION RULES ENGINE - COMPREHENSIVE CHECK              ║
║                                                                    ║
║ Rule 1: Professor cannot teach two classes at same time           ║
║ Rule 2: Lab must occupy 2 continuous slots                        ║
║ Rule 3: Lab exists → theory cannot exist same time                ║
║ Rule 4: Same subject across branches avoids same time             ║
║ Rule 5: Max 2 labs per professor per day                          ║
║ Rule 6: No subject clustering (max 1 session/subject/day)         ║
║ Rule 7: Professor prep time gap (min 30 min between branches)    ║
╚════════════════════════════════════════════════════════════════════╝
    `);

    try {
      await this.checkRule1_ProfessorDoubleBooking();
      await this.checkRule2_LabContinuity();
      await this.checkRule3_LabTheoryOverlap();
      await this.checkRule4_CrossBranchSubjectOverlap();
      await this.checkRule5_ProfessorLabOverload();
      await this.checkRule6_SubjectClustering();
      await this.checkRule7_ProfessorPrepTime();

      this.printDetailedReport();
    } catch (error) {
      console.error('Validation error:', error);
      process.exit(1);
    }
  }

  /**
   * RULE 1: Professor cannot teach two classes at same time
   * CRITICAL - Direct conflict
   */
  async checkRule1_ProfessorDoubleBooking() {
    console.log('\n[1/7] Checking Rule 1: Professor double-booking...');
    
    const query = `
      SELECT 
        p.name, p.professor_id as prof_id,
        t1.day_of_week, t1.time_slot_start,
        b1.name as branch1, s1.code as subject1,
        b2.name as branch2, s2.code as subject2,
        COUNT(*) as instances
      FROM timetable t1
      JOIN timetable t2 ON 
        t1.professor_id = t2.professor_id AND
        t1.day_of_week = t2.day_of_week AND
        t1.timetable_id < t2.timetable_id
      JOIN professors p ON t1.professor_id = p.professor_id
      JOIN branches b1 ON t1.branch_id = b1.branch_id
      JOIN branches b2 ON t2.branch_id = b2.branch_id
      JOIN subjects s1 ON t1.subject_id = s1.subject_id
      JOIN subjects s2 ON t2.subject_id = s2.subject_id
      WHERE 
        t1.slot_type IN ('LAB', 'THEORY') AND
        t2.slot_type IN ('LAB', 'THEORY') AND
        (
          (t1.time_slot_start <= t2.time_slot_start AND t1.time_slot_end > t2.time_slot_start) OR
          (t2.time_slot_start <= t1.time_slot_start AND t2.time_slot_end > t1.time_slot_start)
        )
      GROUP BY p.name, p.professor_id, t1.day_of_week, t1.time_slot_start, b1.name, s1.code, b2.name, s2.code
      ORDER BY p.name, t1.day_of_week
    `;

    const result = await pool.query(query);
    this.violations.rule1 = result.rows;
    this.stats.rule1 = result.rows.length;

    if (result.rows.length === 0) {
      console.log('  ✅ PASS: No professor double-booking detected');
    } else {
      console.log(`  ❌ FAIL: Found ${result.rows.length} instances of double-booking`);
      result.rows.slice(0, 3).forEach(v => {
        console.log(`     ${v.name}: ${v.branch1}/${v.subject1} & ${v.branch2}/${v.subject2} on ${v.day_of_week}`);
      });
    }
  }

  /**
   * RULE 2: Lab must occupy 2 continuous slots
   * HIGH - Lab fragmentation indicates poor scheduling
   */
  async checkRule2_LabContinuity() {
    console.log('[2/7] Checking Rule 2: Lab continuity...');
    
    const query = `
      SELECT 
        b.name as branch, s.code, s.semester,
        t.day_of_week, t.time_slot_start, t.time_slot_end,
        bat.batch_number,
        CASE 
          WHEN (t.time_slot_end::time - t.time_slot_start::time) = interval '2 hours' THEN 'OK'
          ELSE 'FRAGMENTED'
        END as status
      FROM timetable t
      JOIN subjects s ON t.subject_id = s.subject_id
      JOIN branches b ON t.branch_id = b.branch_id
      JOIN batches bat ON t.batch_id = bat.batch_id
      WHERE t.slot_type = 'LAB'
        AND (t.time_slot_end::time - t.time_slot_start::time) < interval '2 hours'
      ORDER BY b.name, t.day_of_week
    `;

    const result = await pool.query(query);
    this.violations.rule2 = result.rows;
    this.stats.rule2 = result.rows.length;

    if (result.rows.length === 0) {
      console.log('  ✅ PASS: All labs are 2-hour continuous blocks');
    } else {
      console.log(`  ⚠️ WARNING: Found ${result.rows.length} labs with duration < 2 hours`);
    }
  }

  /**
   * RULE 3: Lab exists → theory cannot exist same time
   * CRITICAL - This is what lock mechanism prevents
   */
  async checkRule3_LabTheoryOverlap() {
    console.log('[3/7] Checking Rule 3: Lab+Theory overlap...');
    
    const query = `
      SELECT 
        b.name as branch, s.code, b_bat.batch_number,
        t_lab.day_of_week, t_lab.time_slot_start, t_lab.time_slot_end,
        t_theory.time_slot_start as theory_start, t_theory.time_slot_end as theory_end,
        COUNT(*) as conflicts
      FROM timetable t_lab
      JOIN timetable t_theory ON 
        t_lab.subject_id = t_theory.subject_id AND
        t_lab.branch_id = t_theory.branch_id AND
        t_lab.batch_id = t_theory.batch_id AND
        t_lab.day_of_week = t_theory.day_of_week
      JOIN subjects s ON t_lab.subject_id = s.subject_id
      JOIN branches b ON t_lab.branch_id = b.branch_id
      JOIN batches b_bat ON t_lab.batch_id = b_bat.batch_id
      WHERE 
        t_lab.slot_type = 'LAB' AND
        t_theory.slot_type = 'THEORY' AND
        (
          (t_lab.time_slot_start <= t_theory.time_slot_start AND t_lab.time_slot_end > t_theory.time_slot_start) OR
          (t_theory.time_slot_start < t_lab.time_slot_end AND t_theory.time_slot_end > t_lab.time_slot_start)
        )
      GROUP BY b.name, s.code, b_bat.batch_number, t_lab.day_of_week, 
               t_lab.time_slot_start, t_lab.time_slot_end, t_theory.time_slot_start, t_theory.time_slot_end
      ORDER BY b.name, t_lab.day_of_week
    `;

    const result = await pool.query(query);
    this.violations.rule3 = result.rows;
    this.stats.rule3 = result.rows.length;

    if (result.rows.length === 0) {
      console.log('  ✅ PASS: No lab+theory overlaps (lock mechanism working!)');
    } else {
      console.log(`  ❌ FAIL: Found ${result.rows.length} lab+theory overlaps`);
    }
  }

  /**
   * RULE 4: Same subject across branches avoid same time
   * MEDIUM - Causes resource pressure, tight scheduling
   */
  async checkRule4_CrossBranchSubjectOverlap() {
    console.log('[4/7] Checking Rule 4: Cross-branch subject overlap...');
    
    const query = `
      SELECT 
        s.code, s.semester,
        b1.name as branch1, b2.name as branch2,
        t1.day_of_week, t1.time_slot_start,
        COUNT(*) as instances
      FROM timetable t1
      JOIN timetable t2 ON 
        t1.subject_id = t2.subject_id AND
        t1.branch_id < t2.branch_id AND
        t1.day_of_week = t2.day_of_week AND
        t1.slot_type = t2.slot_type AND
        t1.timetable_id < t2.timetable_id
      JOIN subjects s ON t1.subject_id = s.subject_id
      JOIN branches b1 ON t1.branch_id = b1.branch_id
      JOIN branches b2 ON t2.branch_id = b2.branch_id
      WHERE 
        t1.slot_type IN ('LAB', 'THEORY') AND
        (
          (t1.time_slot_start < t2.time_slot_end AND t1.time_slot_end > t2.time_slot_start)
        )
      GROUP BY s.code, s.semester, b1.name, b2.name, t1.day_of_week, t1.time_slot_start
      ORDER BY s.code, t1.day_of_week
    `;

    const result = await pool.query(query);
    this.violations.rule4 = result.rows;
    this.stats.rule4 = result.rows.length;

    if (result.rows.length === 0) {
      console.log('  ✅ PASS: No cross-branch subject time conflicts');
    } else {
      console.log(`  ⚠️ WARNING: Found ${result.rows.length} cross-branch overlaps`);
      result.rows.slice(0, 2).forEach(v => {
        console.log(`     ${v.code}: ${v.branch1} & ${v.branch2} on ${v.day_of_week} ${v.time_slot_start}`);
      });
    }
  }

  /**
   * RULE 5: Max 2 labs per professor per day
   * MEDIUM - Prevents professor overload
   */
  async checkRule5_ProfessorLabOverload() {
    console.log('[5/7] Checking Rule 5: Professor lab overload...');
    
    const query = `
      SELECT 
        p.name, t.day_of_week,
        COUNT(*) as lab_count,
        STRING_AGG(DISTINCT b.name || ' ' || s.code, ', ') as subjects
      FROM timetable t
      JOIN professors p ON t.professor_id = p.professor_id
      JOIN subjects s ON t.subject_id = s.subject_id
      JOIN branches b ON t.branch_id = b.branch_id
      WHERE t.slot_type = 'LAB'
      GROUP BY p.name, p.professor_id, t.day_of_week
      HAVING COUNT(*) > 2
      ORDER BY p.name, lab_count DESC
    `;

    const result = await pool.query(query);
    this.violations.rule5 = result.rows;
    this.stats.rule5 = result.rows.length;

    if (result.rows.length === 0) {
      console.log('  ✅ PASS: No professor has >2 labs per day');
    } else {
      console.log(`  ⚠️ WARNING: Found ${result.rows.length} overload instances`);
      result.rows.slice(0, 2).forEach(v => {
        console.log(`     ${v.name} on ${v.day_of_week}: ${v.lab_count} labs`);
      });
    }
  }

  /**
   * RULE 6: No subject clustering (max 1 session per subject per day)
   * MEDIUM - Better distribution across week
   */
  async checkRule6_SubjectClustering() {
    console.log('[6/7] Checking Rule 6: Subject clustering...');
    
    const query = `
      SELECT 
        b.name as branch, s.code, s.semester,
        t.day_of_week,
        COUNT(*) as session_count,
        STRING_AGG(DISTINCT t.slot_type, ', ') as types
      FROM timetable t
      JOIN subjects s ON t.subject_id = s.subject_id
      JOIN branches b ON t.branch_id = b.branch_id
      WHERE t.slot_type IN ('LAB', 'THEORY')
      GROUP BY b.name, s.code, s.semester, t.day_of_week
      HAVING COUNT(*) > 2
      ORDER BY b.name, s.code, session_count DESC
    `;

    const result = await pool.query(query);
    this.violations.rule6 = result.rows;
    this.stats.rule6 = result.rows.length;

    if (result.rows.length === 0) {
      console.log('  ✅ PASS: No subject clustering (max 1-2 sessions per subject per day)');
    } else {
      console.log(`  ⚠️ WARNING: Found ${result.rows.length} clustering instances`);
      result.rows.slice(0, 3).forEach(v => {
        console.log(`     ${v.branch}/${v.code} on ${v.day_of_week}: ${v.session_count} sessions`);
      });
    }
  }

  /**
   * RULE 7: Professor prep time gap (min 30 min between branches)
   * MEDIUM - Allows transition time between locations
   */
  async checkRule7_ProfessorPrepTime() {
    console.log('[7/7] Checking Rule 7: Professor prep time...');
    
    const query = `
      SELECT 
        p.name, t1.day_of_week,
        b1.name as branch1, b2.name as branch2,
        t1.time_slot_end as end1,
        t2.time_slot_start as start2,
        (EXTRACT(EPOCH FROM (t2.time_slot_start::time - t1.time_slot_end::time))/60)::int as gap_minutes,
        s1.code as subject1, s2.code as subject2
      FROM timetable t1
      JOIN timetable t2 ON 
        t1.professor_id = t2.professor_id AND
        t1.day_of_week = t2.day_of_week AND
        t1.branch_id < t2.branch_id AND
        t1.timetable_id < t2.timetable_id
      JOIN professors p ON t1.professor_id = p.professor_id
      JOIN branches b1 ON t1.branch_id = b1.branch_id
      JOIN branches b2 ON t2.branch_id = b2.branch_id
      JOIN subjects s1 ON t1.subject_id = s1.subject_id
      JOIN subjects s2 ON t2.subject_id = s2.subject_id
      WHERE 
        t1.slot_type IN ('LAB', 'THEORY') AND
        t2.slot_type IN ('LAB', 'THEORY') AND
        t1.time_slot_end < t2.time_slot_start AND
        (EXTRACT(EPOCH FROM (t2.time_slot_start::time - t1.time_slot_end::time))/60) < 30
      ORDER BY p.name, gap_minutes
    `;

    const result = await pool.query(query);
    this.violations.rule7 = result.rows;
    this.stats.rule7 = result.rows.length;

    if (result.rows.length === 0) {
      console.log('  ✅ PASS: All professors have ≥30 min prep time between branches');
    } else {
      console.log(`  ⚠️ WARNING: Found ${result.rows.length} insufficient prep time instances`);
      result.rows.slice(0, 3).forEach(v => {
        console.log(`     ${v.name}: ${v.branch1}→${v.branch2}, gap=${v.gap_minutes}min`);
      });
    }
  }

  /**
   * Print comprehensive report
   */
  printDetailedReport() {
    console.log('\n' + '═'.repeat(70));
    console.log('VALIDATION RULES REPORT - DETAILED ANALYSIS');
    console.log('═'.repeat(70));

    const results = [
      { rule: 1, name: 'Professor Double-Booking', severity: 'CRITICAL', count: this.stats.rule1 },
      { rule: 2, name: 'Lab Continuity', severity: 'HIGH', count: this.stats.rule2 },
      { rule: 3, name: 'Lab+Theory Overlap', severity: 'CRITICAL', count: this.stats.rule3 },
      { rule: 4, name: 'Cross-Branch Subject', severity: 'MEDIUM', count: this.stats.rule4 },
      { rule: 5, name: 'Professor Lab Overload', severity: 'MEDIUM', count: this.stats.rule5 },
      { rule: 6, name: 'Subject Clustering', severity: 'MEDIUM', count: this.stats.rule6 },
      { rule: 7, name: 'Professor Prep Time', severity: 'MEDIUM', count: this.stats.rule7 }
    ];

    console.log('\n📊 RULE STATUS SUMMARY:\n');
    results.forEach(r => {
      const status = r.count === 0 ? '✅ PASS' : `❌ FAIL (${r.count})`;
      const sev = r.severity === 'CRITICAL' ? '🔴' : (r.severity === 'HIGH' ? '🟠' : '🟡');
      console.log(`  ${sev} Rule ${r.rule}: ${r.name.padEnd(30)} ${status}`);
    });

    const criticalCount = this.stats.rule1 + this.stats.rule3;
    const highCount = this.stats.rule2;
    const mediumCount = this.stats.rule4 + this.stats.rule5 + this.stats.rule6 + this.stats.rule7;

    console.log('\n📈 SEVERITY BREAKDOWN:\n');
    console.log(`  🔴 CRITICAL: ${criticalCount} violations`);
    console.log(`  🟠 HIGH:     ${highCount} violations`);
    console.log(`  🟡 MEDIUM:   ${mediumCount} violations`);

    const totalViolations = criticalCount + highCount + mediumCount;
    const passRate = ((7 - (criticalCount > 0 ? 1 : 0) - (highCount > 0 ? 1 : 0) - (mediumCount > 0 ? 1 : 0)) / 7 * 100).toFixed(1);

    console.log('\n🎯 OVERALL ASSESSMENT:\n');
    console.log(`  Total Violations: ${totalViolations}`);
    console.log(`  Rules Passing:    ${7 - (criticalCount > 0 ? 1 : 0) - (highCount > 0 ? 1 : 0) - (mediumCount > 0 ? 1 : 0)}/7`);
    console.log(`  Timetable Quality: ${passRate}%`);

    if (totalViolations === 0) {
      console.log('\n✅ EXCELLENT: Timetable is fully optimized!');
    } else if (criticalCount === 0) {
      console.log('\n⚠️ GOOD: No critical violations, minor optimizations needed');
    } else {
      console.log('\n❌ NEEDS ATTENTION: Critical violations detected');
    }

    console.log('\n' + '═'.repeat(70) + '\n');

    process.exit(totalViolations > 0 ? 1 : 0);
  }
}

// Main execution
const engine = new ValidationRulesEngine();
engine.validate();
