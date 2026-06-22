#!/usr/bin/env node
/**
 * INTELLIGENT GLOBAL LAB DISTRIBUTOR
 * 
 * Solves: Labs scheduled at same time across branches
 * Strategy: Redistribute labs across available time slots while:
 * - Keeping per-branch schedule intact (per-branch constraints)
 * - Respecting global 7-lab/time-slot limit
 * - No professor conflicts
 * - No batch conflicts
 */

const pool = require('./src/config/db');

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const LAB_SLOTS = [
  { start: '09:00', end: '11:00' },
  { start: '11:15', end: '13:15' },
  { start: '14:00', end: '16:00' }
];

class LabDistributor {
  constructor() {
    this.allLabs = [];
    this.timeSlotUsage = new Map(); // "DAY-START" -> count
    this.labAssignments = new Map(); // timetable_id -> { old_slot, new_slot }
    this.conflicts = [];
  }

  /**
   * STEP 1: Load all labs and compute current global usage
   */
  async loadAndAnalyze() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║    STEP 1: LOADING LABS & ANALYZING GLOBAL USAGE            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const result = await pool.query(`
      SELECT 
        timetable_id,
        day_of_week,
        time_slot_start,
        time_slot_end,
        subject_id,
        batch_id,
        professor_id,
        branch_id,
        semester,
        slot_type
      FROM timetable
      WHERE slot_type = 'LAB'
      ORDER BY day_of_week, time_slot_start
    `);

    this.allLabs = result.rows;

    // Calculate current usage per slot
    for (const lab of this.allLabs) {
      const key = `${lab.day_of_week}-${lab.time_slot_start}`;
      this.timeSlotUsage.set(key, (this.timeSlotUsage.get(key) || 0) + 1);
    }

    console.log(`✓ Loaded ${this.allLabs.length} labs\n`);

    // Show overloaded slots
    const overloaded = Array.from(this.timeSlotUsage.entries())
      .filter(([_, count]) => count > 7)
      .sort((a, b) => b[1] - a[1]);

    if (overloaded.length === 0) {
      console.log('✅ All slots within capacity (≤7 labs)\n');
      return true;
    }

    console.log(`❌ Found ${overloaded.length} overloaded slots:\n`);
    for (const [slot, count] of overloaded) {
      console.log(`   ${slot}: ${count} labs (excess: ${count - 7})`);
    }
    console.log();
    return false;
  }

  /**
   * STEP 2: Identify labs that should be moved
   * Strategy: Move labs from fullest slots to emptiest slots
   */
  async selectLabsToMove() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║    STEP 2: SELECTING LABS TO REDISTRIBUTE                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const overloadedSlots = Array.from(this.timeSlotUsage.entries())
      .filter(([_, count]) => count > 7)
      .sort((a, b) => b[1] - a[1]); // Fullest first

    if (overloadedSlots.length === 0) {
      console.log('✅ No labs need redistribution\n');
      return [];
    }

    const labsToMove = [];

    for (const [slotKey, count] of overloadedSlots) {
      const excess = count - 7;
      const [day, time] = slotKey.split('-');

      // Get labs in this slot, sorted by move priority
      const slotLabs = this.allLabs
        .filter(l => l.day_of_week === day && l.time_slot_start === time)
        .sort((a, b) => this.getMovePriority(a) - this.getMovePriority(b));

      console.log(`🔧 Slot ${day} ${time} (${count} labs, need to move ${excess}):`);

      // Select excess labs for moving
      for (let i = 0; i < excess && i < slotLabs.length; i++) {
        const lab = slotLabs[i];
        labsToMove.push({
          timetable_id: lab.timetable_id,
          current_slot: `${day}-${time}`,
          subject_id: lab.subject_id,
          batch_id: lab.batch_id,
          professor_id: lab.professor_id,
          branch_id: lab.branch_id,
          priority: this.getMovePriority(lab)
        });
        console.log(`   - Lab ${lab.timetable_id.substring(0, 8)}... (priority: ${this.getMovePriority(lab)})`);
      }
      console.log();
    }

    return labsToMove;
  }

  /**
   * Get move priority (lower = move first)
   * 1 = elective/optional
   * 2 = practical/lab courses
   * 3 = core courses
   */
  getMovePriority(lab) {
    const subjectId = lab.subject_id?.toLowerCase() || '';
    
    if (subjectId.includes('elective') || subjectId.includes('optional')) return 1;
    if (subjectId.includes('practical') || subjectId.includes('workshop')) return 2;
    return 3;
  }

  /**
   * STEP 3: Find best alternative slot for each lab
   */
  async findBestSlots(labsToMove) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║    STEP 3: FINDING BEST ALTERNATIVE SLOTS                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    let moved = 0;
    let failed = 0;

    for (const lab of labsToMove) {
      // Find alternative slots, prioritized:
      // 1. Same day, different time
      // 2. Different day, same time band
      // 3. Different day, different time
      
      const [currentDay, currentTime] = lab.current_slot.split('-');
      let found = false;

      // Try all day-time combinations, sorted by preference
      const slots = this.generateSlotCandidates(currentDay, currentTime);

      for (const { day, time } of slots) {
        const slotKey = `${day}-${time}`;
        const currentCount = this.timeSlotUsage.get(slotKey) || 0;

        // Check if slot has capacity
        if (currentCount >= 7) continue;

        // Check constraints
        const canMove = await this.canMoveLab(lab, day, time);
        if (!canMove) continue;

        // Move the lab!
        await pool.query(
          'UPDATE timetable SET day_of_week = $1, time_slot_start = $2 WHERE timetable_id = $3',
          [day, time, lab.timetable_id]
        );

        // Update usage tracking
        this.timeSlotUsage.set(lab.current_slot, this.timeSlotUsage.get(lab.current_slot) - 1);
        this.timeSlotUsage.set(slotKey, currentCount + 1);

        this.labAssignments.set(lab.timetable_id, {
          from: lab.current_slot,
          to: slotKey
        });

        console.log(`✅ Lab ${lab.timetable_id.substring(0, 8)}... → ${day} ${time}`);
        moved++;
        found = true;
        break;
      }

      if (!found) {
        console.log(`❌ Lab ${lab.timetable_id.substring(0, 8)}... → NO SLOT AVAILABLE`);
        failed++;
      }
    }

    console.log(`\n📊 Results: ${moved} moved, ${failed} failed\n`);
    return { moved, failed };
  }

  /**
   * Generate slot candidates in priority order
   */
  generateSlotCandidates(currentDay, currentTime) {
    const dayIndex = DAYS.indexOf(currentDay);
    const candidates = [];

    // Priority 1: Same day, different times
    for (const slot of LAB_SLOTS) {
      if (slot.start !== currentTime) {
        candidates.push({ day: currentDay, time: slot.start, priority: 1 });
      }
    }

    // Priority 2: Adjacent days, same time
    if (dayIndex > 0) {
      candidates.push({ day: DAYS[dayIndex - 1], time: currentTime, priority: 2 });
    }
    if (dayIndex < DAYS.length - 1) {
      candidates.push({ day: DAYS[dayIndex + 1], time: currentTime, priority: 2 });
    }

    // Priority 3: Other days, same time
    for (const day of DAYS) {
      if (day !== currentDay && 
          !candidates.some(c => c.day === day && c.time === currentTime)) {
        candidates.push({ day, time: currentTime, priority: 3 });
      }
    }

    // Priority 4: Other days, different times
    for (const day of DAYS) {
      if (day !== currentDay) {
        for (const slot of LAB_SLOTS) {
          if (slot.start !== currentTime) {
            candidates.push({ day, time: slot.start, priority: 4 });
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Check if lab can be moved to target slot
   */
  async canMoveLab(lab, day, time) {
    // CONSTRAINT 1: Professor availability
    const profCheck = await pool.query(`
      SELECT COUNT(*) as cnt FROM timetable
      WHERE professor_id = $1 AND day_of_week = $2 AND time_slot_start = $3
        AND timetable_id != $4
    `, [lab.professor_id, day, time, lab.timetable_id]);

    if ((profCheck.rows[0]?.cnt || 0) > 0) return false;

    // CONSTRAINT 2: Batch availability
    const batchCheck = await pool.query(`
      SELECT COUNT(*) as cnt FROM timetable
      WHERE batch_id = $1 AND day_of_week = $2 AND time_slot_start = $3
        AND timetable_id != $4
    `, [lab.batch_id, day, time, lab.timetable_id]);

    if ((batchCheck.rows[0]?.cnt || 0) > 0) return false;

    return true;
  }

  /**
   * STEP 4: Verify final state
   */
  async verifyFinalState() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         STEP 4: VERIFYING FINAL STATE                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const slots = await pool.query(`
      SELECT day_of_week, time_slot_start, COUNT(*) as cnt
      FROM timetable WHERE slot_type = 'LAB'
      GROUP BY day_of_week, time_slot_start
      ORDER BY day_of_week, time_slot_start
    `);

    let allValid = true;
    console.log('Final lab distribution:\n');

    for (const row of slots.rows) {
      const status = row.cnt <= 7 ? '✅' : '❌';
      console.log(`${status} ${row.day_of_week} ${row.time_slot_start}: ${row.cnt} labs`);
      if (row.cnt > 7) allValid = false;
    }

    console.log();
    if (allValid) {
      console.log('✅ ALL SLOTS VALID - No slot exceeds 7 labs\n');
    } else {
      console.log('⚠️ Some slots still overloaded\n');
    }

    return allValid;
  }

  /**
   * Run full distribution process
   */
  async run() {
    try {
      const isValid = await this.loadAndAnalyze();
      
      if (isValid) {
        console.log('✨ Timetable is already valid!\n');
        await pool.end();
        process.exit(0);
      }

      const labsToMove = await this.selectLabsToMove();
      const result = await this.findBestSlots(labsToMove);
      const finalValid = await this.verifyFinalState();

      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║              DISTRIBUTION COMPLETE                         ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');

      console.log(`Labs redistributed: ${result.moved}`);
      console.log(`Labs unresolved: ${result.failed}`);
      console.log(`Status: ${finalValid ? '✅ VALID' : '⚠️ PARTIAL'}\n`);

      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error('❌ Error:', error.message);
      await pool.end();
      process.exit(1);
    }
  }
}

const distributor = new LabDistributor();
distributor.run();
