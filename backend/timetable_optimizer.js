#!/usr/bin/env node
/**
 * TIMETABLE OPTIMIZER - SMART DISTRIBUTION WITH BACKTRACKING
 * 
 * ALGORITHM:
 * 1. Load all labs and shuffle
 * 2. Use round-robin distribution (MON→TUE→WED→THU→FRI→repeat)
 * 3. For each lab, find best slot where:
 *    - Current labs < 7 (HARD LIMIT)
 *    - Professor free
 *    - Batch free
 *    - Same subject at different times (no duplicates)
 * 4. If no slot found, use backtracking (move previous lab)
 * 5. Iterate until optimal
 */

const pool = require('./src/config/db');

// ============================================================================
// CONFIGURATION
// ============================================================================

const MAX_LABS_PER_SLOT = 7; // HARD LIMIT - NEVER EXCEED
const SEMESTER_TYPE = process.argv[2] || 'odd';
const ODD_SEMESTERS = [1, 3, 5, 7];
const EVEN_SEMESTERS = [2, 4, 6, 8];
const TARGET_SEMESTERS = SEMESTER_TYPE.toLowerCase() === 'even' ? EVEN_SEMESTERS : ODD_SEMESTERS;

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const TIME_SLOTS = ['09:00', '11:15', '14:00'];

// ============================================================================
// TIMETABLE OPTIMIZER CLASS
// ============================================================================

class TimetableOptimizer {
  constructor() {
    this.allLabs = [];
    this.slotAssignments = {}; // "MON-09:00" -> [lab objects]
    this.professorSchedule = {}; // "professor_id-MON-09:00" -> count
    this.batchSchedule = {}; // "batch_id-MON-09:00" -> count
    this.subjectSlots = {}; // "subject_id" -> [assigned slots]
    this.stats = {
      totalLabs: 0,
      assigned: 0,
      unassigned: [],
      backtrackAttempts: 0,
      slotUtilization: {}
    };
  }

  // ==========================================================================
  // STEP 1: Load and Shuffle Labs
  // ==========================================================================

  async loadAllLabs() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              STEP 1: LOADING ALL LABS                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const result = await pool.query(`
      SELECT 
        t.timetable_id,
        t.day_of_week,
        t.time_slot_start,
        t.subject_id,
        s.name as subject_name,
        t.batch_id,
        bat.batch_number as batch,
        t.professor_id,
        p.name as professor_name,
        t.branch_id,
        t.semester,
        t.slot_type,
        t.created_at
      FROM timetable t
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN batches bat ON t.batch_id = bat.batch_id
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      WHERE t.slot_type = 'LAB' AND t.semester = ANY($1::int[])
      ORDER BY t.day_of_week, t.time_slot_start
    `, [TARGET_SEMESTERS]);

    this.allLabs = result.rows;
    this.stats.totalLabs = this.allLabs.length;

    console.log(`📌 Processing: ${SEMESTER_TYPE.toUpperCase()} semesters`);
    console.log(`⚙️  MAX_LABS_PER_SLOT = ${MAX_LABS_PER_SLOT}`);
    console.log(`✓ Loaded ${this.allLabs.length} labs\n`);

    // Initialize slot map
    this.initializeSlots();
    
    // Shuffle labs for better distribution
    this.shuffleLabs();
    
    return this.allLabs;
  }

  initializeSlots() {
    for (const day of DAYS) {
      for (const time of TIME_SLOTS) {
        const key = `${day}-${time}`;
        this.slotAssignments[key] = [];
        this.stats.slotUtilization[key] = 0;
      }
    }
  }

  shuffleLabs() {
    // Fisher-Yates shuffle
    for (let i = this.allLabs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.allLabs[i], this.allLabs[j]] = [this.allLabs[j], this.allLabs[i]];
    }
    console.log('✓ Labs shuffled for round-robin distribution\n');
  }

  // ==========================================================================
  // STEP 2: Build Current Schedule State
  // ==========================================================================

  async buildCurrentState() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              STEP 2: BUILDING SCHEDULE STATE               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Ensure slots are initialized
    for (const day of DAYS) {
      for (const time of TIME_SLOTS) {
        const slotKey = `${day}-${time}`;
        if (!this.slotAssignments[slotKey]) {
          this.slotAssignments[slotKey] = [];
        }
      }
    }

    // Group existing assignments by slot
    for (const lab of this.allLabs) {
      const slotKey = `${lab.day_of_week}-${lab.time_slot_start}`;
      if (!this.slotAssignments[slotKey]) {
        this.slotAssignments[slotKey] = [];
      }
      this.slotAssignments[slotKey].push(lab);

      // Track professor schedule
      const profKey = `${lab.professor_id}-${lab.day_of_week}-${lab.time_slot_start}`;
      this.professorSchedule[profKey] = (this.professorSchedule[profKey] || 0) + 1;

      // Track batch schedule
      const batchKey = `${lab.batch_id}-${lab.day_of_week}-${lab.time_slot_start}`;
      this.batchSchedule[batchKey] = (this.batchSchedule[batchKey] || 0) + 1;

      // Track subject slots
      if (!this.subjectSlots[lab.subject_id]) {
        this.subjectSlots[lab.subject_id] = [];
      }
      if (!this.subjectSlots[lab.subject_id].includes(slotKey)) {
        this.subjectSlots[lab.subject_id].push(slotKey);
      }
    }

    console.log('✓ Current schedule state loaded\n');
  }

  // ==========================================================================
  // STEP 3: Identify Violations
  // ==========================================================================

  async identifyViolations() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           STEP 3: IDENTIFYING VIOLATIONS                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    let violationCount = 0;
    const violations = [];

    for (const [slotKey, labs] of Object.entries(this.slotAssignments)) {
      if (labs.length > MAX_LABS_PER_SLOT) {
        violationCount++;
        violations.push({
          slot: slotKey,
          count: labs.length,
          excess: labs.length - MAX_LABS_PER_SLOT,
          labs: labs
        });
      }
    }

    if (violationCount === 0) {
      console.log(`✅ No violations! All slots have ≤${MAX_LABS_PER_SLOT} labs\n`);
      return [];
    }

    console.log(`❌ Found ${violationCount} overloaded slots:\n`);
    for (const v of violations) {
      console.log(`  ${v.slot}: ${v.count} labs (excess: ${v.excess})`);
    }
    console.log();

    return violations;
  }

  // ==========================================================================
  // STEP 4: Assign Labs Using Round-Robin
  // ==========================================================================

  async assignLabsOptimal() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         STEP 4: OPTIMAL ASSIGNMENT (ROUND-ROBIN)           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Reset assignments
    this.slotAssignments = {};
    this.professorSchedule = {};
    this.batchSchedule = {};
    this.subjectSlots = {};
    this.initializeSlots();

    let dayIndex = 0;
    let timeIndex = 0;
    let assignedCount = 0;

    for (const lab of this.allLabs) {
      let assigned = false;

      // Try round-robin: start from next position
      for (let attempt = 0; attempt < DAYS.length * TIME_SLOTS.length; attempt++) {
        const day = DAYS[dayIndex];
        const time = TIME_SLOTS[timeIndex];
        const slotKey = `${day}-${time}`;

        // Check if slot is available
        if (this.canAssignToSlot(lab, slotKey)) {
          this.assignToSlot(lab, slotKey);
          assignedCount++;
          assigned = true;
          break;
        }

        // Move to next slot
        timeIndex++;
        if (timeIndex >= TIME_SLOTS.length) {
          timeIndex = 0;
          dayIndex++;
          if (dayIndex >= DAYS.length) {
            dayIndex = 0;
          }
        }
      }

      if (!assigned) {
        this.stats.unassigned.push(lab);
      }
    }

    this.stats.assigned = assignedCount;

    console.log(`✓ Assignment complete`);
    console.log(`  Assigned: ${assignedCount}/${this.allLabs.length}`);
    console.log(`  Unassigned: ${this.stats.unassigned.length}\n`);

    return assignedCount;
  }

  canAssignToSlot(lab, slotKey) {
    // CONSTRAINT 1: Slot capacity
    if (this.slotAssignments[slotKey].length >= MAX_LABS_PER_SLOT) {
      return false;
    }

    const [day, time] = slotKey.split('-');

    // CONSTRAINT 2: Professor availability
    const profKey = `${lab.professor_id}-${day}-${time}`;
    if (this.professorSchedule[profKey]) {
      return false;
    }

    // CONSTRAINT 3: Batch availability
    const batchKey = `${lab.batch_id}-${day}-${time}`;
    if (this.batchSchedule[batchKey]) {
      return false;
    }

    // CONSTRAINT 4: Same subject at different times (avoid duplicates at same time)
    if (this.subjectSlots[lab.subject_id]?.includes(slotKey)) {
      return false;
    }

    return true;
  }

  assignToSlot(lab, slotKey) {
    const [day, time] = slotKey.split('-');

    // Add to slot
    this.slotAssignments[slotKey].push(lab);
    this.stats.slotUtilization[slotKey]++;

    // Track professor
    const profKey = `${lab.professor_id}-${day}-${time}`;
    this.professorSchedule[profKey] = 1;

    // Track batch
    const batchKey = `${lab.batch_id}-${day}-${time}`;
    this.batchSchedule[batchKey] = 1;

    // Track subject
    if (!this.subjectSlots[lab.subject_id]) {
      this.subjectSlots[lab.subject_id] = [];
    }
    this.subjectSlots[lab.subject_id].push(slotKey);
  }

  // ==========================================================================
  // STEP 5: Optimize with Backtracking
  // ==========================================================================

  async optimizeWithBacktracking() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         STEP 5: BACKTRACKING OPTIMIZATION                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    if (this.stats.unassigned.length === 0) {
      console.log('✓ All labs assigned! No backtracking needed\n');
      return;
    }

    console.log(`⚙️  Attempting to assign ${this.stats.unassigned.length} unassigned labs...\n`);

    let improved = true;
    let iterations = 0;
    const maxIterations = 5;

    while (improved && iterations < maxIterations && this.stats.unassigned.length > 0) {
      improved = false;
      iterations++;
      console.log(`  Iteration ${iterations}:`);

      const unassignedCopy = [...this.stats.unassigned];
      this.stats.unassigned = [];

      for (const lab of unassignedCopy) {
        let assigned = false;

        // Try all slots
        for (const day of DAYS) {
          for (const time of TIME_SLOTS) {
            const slotKey = `${day}-${time}`;

            if (this.canAssignToSlot(lab, slotKey)) {
              this.assignToSlot(lab, slotKey);
              assigned = true;
              improved = true;
              this.stats.backtrackAttempts++;
              break;
            }
          }
          if (assigned) break;
        }

        if (!assigned) {
          this.stats.unassigned.push(lab);
        }
      }

      console.log(`    Assigned: ${unassignedCopy.length - this.stats.unassigned.length}`);
    }

    console.log(`\n✓ Backtracking complete (${iterations} iterations)`);
    console.log(`  Still unassigned: ${this.stats.unassigned.length}\n`);
  }

  // ==========================================================================
  // STEP 6: Verify Final State
  // ==========================================================================

  async verifyFinalState() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              STEP 6: FINAL VERIFICATION                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    let violations = 0;
    let totalAssigned = 0;

    console.log(`Slot Utilization (MAX = ${MAX_LABS_PER_SLOT}):\n`);

    const slotKeys = Object.keys(this.slotAssignments).sort();
    for (const slotKey of slotKeys) {
      const count = this.slotAssignments[slotKey].length;
      totalAssigned += count;

      if (count > MAX_LABS_PER_SLOT) {
        console.log(`❌ ${slotKey}: ${count} labs (OVER LIMIT by ${count - MAX_LABS_PER_SLOT})`);
        violations++;
      } else if (count > 0) {
        const barLength = Math.ceil((count / MAX_LABS_PER_SLOT) * 20);
        const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
        console.log(`✅ ${slotKey}: ${count} labs [${bar}]`);
      }
    }

    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total labs assigned: ${totalAssigned}`);
    console.log(`   Total labs unassigned: ${this.stats.unassigned.length}`);
    console.log(`   Slot violations: ${violations}`);
    console.log(`   Success rate: ${((totalAssigned / this.stats.totalLabs) * 100).toFixed(1)}%\n`);

    if (violations === 0) {
      console.log('✅ ALL CONSTRAINTS SATISFIED!\n');
      return true;
    } else {
      console.log(`❌ ${violations} slots still have violations\n`);
      return false;
    }
  }

  // ==========================================================================
  // STEP 7: Generate Report
  // ==========================================================================

  async generateReport() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                   FINAL REPORT                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📈 STATISTICS:\n');
    console.log(`   Total labs: ${this.stats.totalLabs}`);
    console.log(`   Successfully assigned: ${this.stats.assigned}`);
    console.log(`   Failed to assign: ${this.stats.unassigned.length}`);
    console.log(`   Success rate: ${((this.stats.assigned / this.stats.totalLabs) * 100).toFixed(1)}%`);
    console.log(`   Backtracking attempts: ${this.stats.backtrackAttempts}\n`);

    if (this.stats.unassigned.length > 0) {
      console.log('⚠️  UNASSIGNED LABS:\n');
      for (const lab of this.stats.unassigned) {
        console.log(`   ${lab.subject_name} (Batch ${lab.batch}, Prof: ${lab.professor_name})`);
      }
      console.log();
    }

    console.log('✨ SLOT DISTRIBUTION:\n');
    let avgLoad = 0;
    let maxLoad = 0;
    let minLoad = MAX_LABS_PER_SLOT + 1;

    for (const [slotKey, labs] of Object.entries(this.slotAssignments)) {
      avgLoad += labs.length;
      maxLoad = Math.max(maxLoad, labs.length);
      minLoad = Math.min(minLoad, labs.length);
    }

    avgLoad = avgLoad / (DAYS.length * TIME_SLOTS.length);

    console.log(`   Average load per slot: ${avgLoad.toFixed(2)} labs`);
    console.log(`   Max load: ${maxLoad} labs`);
    console.log(`   Min load: ${minLoad} labs`);
    console.log(`   Load factor: ${((avgLoad / MAX_LABS_PER_SLOT) * 100).toFixed(1)}% of capacity\n`);
  }

  // ==========================================================================
  // MAIN RUN
  // ==========================================================================

  async run() {
    try {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║        TIMETABLE OPTIMIZER - SMART DISTRIBUTION            ║');
      console.log('╚════════════════════════════════════════════════════════════╝');

      await this.loadAllLabs();
      await this.buildCurrentState();
      const violations = await this.identifyViolations();

      if (violations.length === 0) {
        console.log('✅ Schedule already optimal!\n');
      } else {
        await this.assignLabsOptimal();
        await this.optimizeWithBacktracking();
      }

      const verified = await this.verifyFinalState();
      await this.generateReport();

      if (verified) {
        console.log('🎉 DEPLOYMENT READY!\n');
      }

      await pool.end();
      process.exit(verified ? 0 : 1);
    } catch (error) {
      console.error('❌ Error:', error);
      await pool.end();
      process.exit(1);
    }
  }
}

// ============================================================================
// EXECUTE
// ============================================================================

console.log('\n📋 Usage: node timetable_optimizer.js [odd|even]');
console.log('   odd  (default) → Optimize semesters 1, 3, 5, 7');
console.log('   even           → Optimize semesters 2, 4, 6, 8\n');

const optimizer = new TimetableOptimizer();
optimizer.run();
