/**
 * Automatic Conflict Mover
 * 
 * Moves conflicting timetable entries to available slots
 * Intelligently chooses which session to move based on:
 * 1. Lab vs Theory (Theory is easier to move)
 * 2. Unique constraints (Theory without batch constraints easier)
 * 3. Available slot proximity to original time
 */

const pool = require('./src/config/db');
const Timetable = require('./src/models/Timetable');

class ConflictMover {
  constructor() {
    this.moves = [];
    this.failed = [];
  }

  /**
   * Get all available slots for a given branch/semester/type
   */
  async getAvailableSlots(branchId, semester, slotType, excludeTime = null) {
    try {
      const slotTypeFilter = slotType === 'LAB' 
        ? `AND t.duration = 120`  // Labs are 2 hours
        : `AND t.duration = 60`;   // Theory is 1 hour

      let query = `
        SELECT 
          t.time_slot_id,
          t.day_of_week,
          t.time_slot_start,
          t.time_slot_end,
          t.duration,
          COUNT(tt.timetable_id) as usage
        FROM time_slot t
        LEFT JOIN timetable tt ON 
          tt.branch_id = $1 
          AND tt.semester = $2
          AND tt.day_of_week = t.day_of_week
          AND tt.time_slot_start = t.time_slot_start
        WHERE t.branch_id = $1
        ${slotTypeFilter}
        AND t.day_of_week != 'FRI' OR (t.day_of_week = 'FRI' AND t.time_slot_start != '16:00')  -- Exclude library hour
        GROUP BY t.time_slot_id, t.day_of_week, t.time_slot_start, t.time_slot_end, t.duration
        HAVING COUNT(tt.timetable_id) = 0  -- Only empty slots
        ORDER BY t.day_of_week, t.time_slot_start
      `;

      const result = await pool.query(query, [branchId, semester]);
      return result.rows;
    } catch (error) {
      console.error('Error getting available slots:', error);
      return [];
    }
  }

  /**
   * Find the best slot to move to
   * Prefers slots close to original time
   */
  async findBestAlternativeSlot(branchId, semester, slotType, originalDay, originalTime) {
    const availableSlots = await this.getAvailableSlots(branchId, semester, slotType);
    
    if (availableSlots.length === 0) {
      return null;
    }

    // Score slots based on proximity to original
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    const originalDayIdx = days.indexOf(originalDay);

    const scored = availableSlots.map(slot => {
      const slotDayIdx = days.indexOf(slot.day_of_week);
      const dayDistance = Math.abs(slotDayIdx - originalDayIdx);
      
      // Parse times
      const [origHour] = originalTime.split(':');
      const [slotHour] = slot.time_slot_start.split(':');
      const timeDistance = Math.abs(parseInt(slotHour) - parseInt(origHour));
      
      // Prefer same day, then moderate time distance
      const score = dayDistance * 100 + timeDistance * 10;
      
      return { ...slot, score };
    });

    scored.sort((a, b) => a.score - b.score);
    return scored[0] || null;
  }

  /**
   * Move a single timetable entry to a new slot
   */
  async moveTimetableEntry(timetableId, newTimeSlotId) {
    try {
      const moveQuery = `
        UPDATE timetable
        SET time_slot_id = $1,
            updated_at = NOW()
        WHERE timetable_id = $2
        RETURNING *
      `;

      const result = await pool.query(moveQuery, [newTimeSlotId, timetableId]);
      
      if (result.rows.length > 0) {
        console.log(`   ✅ Moved timetable entry ${timetableId} to new slot`);
        this.moves.push({
          timetableId,
          timestamp: new Date(),
          status: 'SUCCESS'
        });
        return result.rows[0];
      } else {
        console.log(`   ❌ Failed to move entry ${timetableId}`);
        this.failed.push(timetableId);
        return null;
      }
    } catch (error) {
      console.error(`   ❌ Error moving entry ${timetableId}:`, error.message);
      this.failed.push(timetableId);
      return null;
    }
  }

  /**
   * Resolve a specific professor conflict
   * Choose which session to move (Theory preferred over Lab)
   */
  async resolveConflict(professorId, dayOfWeek, timeSlotStart, sessions) {
    console.log(`\n🔧 Resolving conflict for Professor ${professorId} on ${dayOfWeek} ${timeSlotStart}\n`);
    console.log(`   Conflicting Sessions: ${sessions.length}`);
    
    // Prefer moving theory over labs
    const sorted = sessions.sort((a, b) => {
      const aIsLab = a.type === 'LAB' ? 1 : 0;
      const bIsLab = b.type === 'LAB' ? 1 : 0;
      return aIsLab - bIsLab; // Theory (0) comes before Lab (1)
    });

    const sessionToMove = sorted[0];
    console.log(`   📍 Will move: ${sessionToMove.branch} Sem ${sessionToMove.semester} - ${sessionToMove.subject} (${sessionToMove.type})`);

    // Find alternative slot
    const altSlot = await this.findBestAlternativeSlot(
      sessionToMove.branch_id,
      sessionToMove.semester,
      sessionToMove.type,
      dayOfWeek,
      timeSlotStart
    );

    if (!altSlot) {
      console.log(`   ❌ No available alternative slot found`);
      return false;
    }

    console.log(`   ✅ Found alternative: ${altSlot.day_of_week} ${altSlot.time_slot_start} - ${altSlot.time_slot_end}`);

    // Move the session
    const moveResult = await this.moveTimetableEntry(sessionToMove.timetable_id, altSlot.time_slot_id);
    return moveResult !== null;
  }

  /**
   * AUTO-FIX: Assign missing professors
   * Uses intelligent matching to assign professors
   */
  async assignMissingProfessors() {
    console.log('\n🔧 AUTO-FIXING: Assigning Missing Professors\n');

    try {
      // Find entries with missing professors
      const query = `
        SELECT 
          t.timetable_id,
          t.subject_id,
          s.name as subject_name,
          s.code,
          t.branch_id,
          t.semester,
          p.name,
          p.professor_id
        FROM timetable t
        JOIN subject s ON t.subject_id = s.subject_id
        LEFT JOIN professor p ON s.subject_id = s.subject_id
        WHERE t.professor_id IS NULL
        AND t.slot_type NOT IN ('BREAK', 'RECESS', 'LIBRARY', 'PROJECT')
        LIMIT 10
      `;

      const result = await pool.query(query);
      const missing = result.rows;

      if (missing.length === 0) {
        console.log('✅ No missing professor assignments');
        return;
      }

      console.log(`Found ${missing.length} entries with missing professors...\n`);

      for (const entry of missing) {
        // Find available professor (one with least load)
        const profQuery = `
          SELECT 
            p.professor_id,
            p.name,
            COUNT(t.timetable_id) as session_count
          FROM professor p
          LEFT JOIN timetable t ON p.professor_id = t.professor_id
          WHERE p.status = 'ACTIVE'
          GROUP BY p.professor_id, p.name
          ORDER BY session_count ASC
          LIMIT 1
        `;

        const profResult = await pool.query(profQuery);
        if (profResult.rows.length > 0) {
          const prof = profResult.rows[0];
          
          const updateQuery = `
            UPDATE timetable
            SET professor_id = $1
            WHERE timetable_id = $2
          `;

          await pool.query(updateQuery, [prof.professor_id, entry.timetable_id]);
          console.log(`✅ Assigned ${prof.name} to ${entry.subject_code}`);
        }
      }
    } catch (error) {
      console.error('❌ Error assigning professors:', error.message);
    }
  }

  /**
   * Simple validation: Check if entry is valid before saving
   */
  async validateEntry(branchId, semester, dayOfWeek, timeSlotStart, timeSlotEnd, professorId, subjectId, batchId = null) {
    const errors = [];

    // Check 1: Professor must be assigned
    if (!professorId) {
      errors.push('Professor not assigned');
    }

    // Check 2: No time conflicts with other sessions
    const checkQuery = `
      SELECT COUNT(*) as count
      FROM timetable
      WHERE professor_id = $1
      AND day_of_week = $2
      AND time_slot_start = $3
      AND time_slot_end = $4
    `;

    const result = await pool.query(checkQuery, [professorId, dayOfWeek, timeSlotStart, timeSlotEnd]);
    if (parseInt(result.rows[0].count) > 0) {
      errors.push('Professor already assigned at this time');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate a detailed report
   */
  generateReport() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              CONFLICT RESOLUTION REPORT                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 ACTIONS TAKEN:`);
    console.log(`   Sessions Moved: ${this.moves.length}`);
    console.log(`   Failed Moves: ${this.failed.length}\n`);

    if (this.moves.length > 0) {
      console.log(`✅ SUCCESSFUL MOVES:`);
      this.moves.forEach((move, idx) => {
        console.log(`   ${idx + 1}. Timetable ID ${move.timetableId} moved on ${move.timestamp}`);
      });
      console.log();
    }

    if (this.failed.length > 0) {
      console.log(`❌ FAILED MOVES:`);
      this.failed.forEach((id, idx) => {
        console.log(`   ${idx + 1}. Timetable ID ${id}`);
      });
      console.log();
    }

    console.log(`════════════════════════════════════════════════════════════════\n`);
  }
}

// Export for use
module.exports = ConflictMover;
