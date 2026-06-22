/**
 * Professor Availability Matrix
 * 
 * Maintains a real-time matrix of professor availability across all time slots globally.
 * Prevents professor clashes before they happen through instant lookup.
 * 
 * Structure:
 * {
 *   professor_id: {
 *     "MON-09:00": { available: false, entryId: "...", subject: "..." },
 *     "MON-10:00": { available: true },
 *     ...
 *   }
 * }
 */

class ProfessorAvailabilityMatrix {
  constructor() {
    // Master matrix: professor_id -> time_slot -> { available, entryId, subject, branch }
    this.matrix = new Map();
    
    // Professor stats for load balancing
    this.professorStats = new Map(); // professor_id -> { totalSessions, dailySessions, labCount }
    
    // Time slot definitions
    this.timeSlots = [
      'MON-09:00', 'MON-10:00', 'MON-11:00', 'MON-12:00', 'MON-13:00', 'MON-14:00', 'MON-15:00', 'MON-16:00',
      'TUE-09:00', 'TUE-10:00', 'TUE-11:00', 'TUE-12:00', 'TUE-13:00', 'TUE-14:00', 'TUE-15:00', 'TUE-16:00',
      'WED-09:00', 'WED-10:00', 'WED-11:00', 'WED-12:00', 'WED-13:00', 'WED-14:00', 'WED-15:00', 'WED-16:00',
      'THU-09:00', 'THU-10:00', 'THU-11:00', 'THU-12:00', 'THU-13:00', 'THU-14:00', 'THU-15:00', 'THU-16:00',
      'FRI-09:00', 'FRI-10:00', 'FRI-11:00', 'FRI-12:00', 'FRI-13:00', 'FRI-14:00', 'FRI-15:00', 'FRI-16:00'
    ];
  }

  /**
   * Initialize matrix for all professors
   */
  initializeForProfessors(professors) {
    professors.forEach(prof => {
      this.matrix.set(prof.professor_id, new Map());
      this.professorStats.set(prof.professor_id, {
        totalSessions: 0,
        dailySessions: new Map(), // MON, TUE, etc.
        labCount: 0,
        lastSlot: null
      });

      // Initialize all slots as available
      this.timeSlots.forEach(slot => {
        this.matrix.get(prof.professor_id).set(slot, {
          available: true,
          entryId: null,
          subject: null,
          branch: null,
          type: null
        });
      });
    });
  }

  /**
   * MARK SLOT AS BUSY
   * When a session is assigned, mark all overlapping time slots
   */
  markBusy(professorId, dayOfWeek, startTime, endTime, entryId, subject, branch, slotType) {
    if (!this.matrix.has(professorId)) {
      console.warn(`⚠️ Professor ${professorId} not in matrix`);
      return false;
    }

    // Convert times to slot format and get all overlapping slots
    const startHour = parseInt(startTime.split(':')[0]);
    const endHour = parseInt(endTime.split(':')[0]);
    
    const hours = [];
    for (let h = startHour; h < endHour; h++) {
      hours.push(h);
    }

    // Mark each hour as busy
    const profMatrix = this.matrix.get(professorId);
    hours.forEach(hour => {
      const slotKey = `${dayOfWeek}-${String(hour).padStart(2, '0')}:00`;
      
      if (profMatrix.has(slotKey)) {
        profMatrix.set(slotKey, {
          available: false,
          entryId,
          subject: subject.name,
          subjectCode: subject.code,
          branch,
          type: slotType
        });
      }
    });

    // Update stats
    this.updateStats(professorId, dayOfWeek, slotType, 1);
    return true;
  }

  /**
   * CHECK IF SLOT IS AVAILABLE
   * Instant lookup - O(1) complexity
   */
  isAvailable(professorId, dayOfWeek, startTime, endTime) {
    if (!this.matrix.has(professorId)) {
      return { available: false, reason: 'Professor not found' };
    }

    const startHour = parseInt(startTime.split(':')[0]);
    const endHour = parseInt(endTime.split(':')[0]);
    
    const profMatrix = this.matrix.get(professorId);
    let firstConflict = null;

    // Check all overlapping hours
    for (let h = startHour; h < endHour; h++) {
      const slotKey = `${dayOfWeek}-${String(h).padStart(2, '0')}:00`;
      
      if (!profMatrix.has(slotKey)) continue;
      
      const slot = profMatrix.get(slotKey);
      if (!slot.available) {
        firstConflict = {
          slot: slotKey,
          subject: slot.subject,
          branch: slot.branch,
          type: slot.type
        };
        break;
      }
    }

    return {
      available: !firstConflict,
      conflict: firstConflict,
      reason: firstConflict ? `Busy at ${firstConflict.slot} with ${firstConflict.subject}` : null
    };
  }

  /**
   * GET AVAILABLE SLOTS FOR PROFESSOR
   * Returns list of available consecutive slots
   */
  getAvailableSlots(professorId, dayOfWeek, durationHours = 1) {
    if (!this.matrix.has(professorId)) return [];

    const profMatrix = this.matrix.get(professorId);
    const availableSlots = [];
    
    const hours = [9, 10, 11, 12, 13, 14, 15, 16];
    
    for (let i = 0; i < hours.length - (durationHours - 1); i++) {
      let isAvailable = true;
      
      // Check if duration is continuous
      for (let j = 0; j < durationHours; j++) {
        const h = hours[i + j];
        const slotKey = `${dayOfWeek}-${String(h).padStart(2, '0')}:00`;
        
        if (!profMatrix.has(slotKey) || !profMatrix.get(slotKey).available) {
          isAvailable = false;
          break;
        }
      }
      
      if (isAvailable) {
        const startHour = String(hours[i]).padStart(2, '0');
        const endHour = String(hours[i + durationHours]).padStart(2, '0');
        availableSlots.push({
          day: dayOfWeek,
          start: `${startHour}:00`,
          end: `${endHour}:00`,
          score: this.scoreSlot(professorId, dayOfWeek, hours[i])
        });
      }
    }

    // Sort by score (prefer balanced distribution)
    availableSlots.sort((a, b) => a.score - b.score);
    return availableSlots;
  }

  /**
   * SCORE A SLOT for preference
   * Lower scores are better (prefer earlier in week, prefer afternoon for theory)
   */
  scoreSlot(professorId, dayOfWeek, hour) {
    const dayScores = { 'MON': 0, 'TUE': 1, 'WED': 2, 'THU': 3, 'FRI': 4 };
    const dayScore = dayScores[dayOfWeek] * 100;
    
    // Prefer afternoon for theory (14:00+)
    const timeScore = hour < 14 ? (14 - hour) * 10 : (hour - 14) * 5;
    
    // Consider current load
    const stats = this.professorStats.get(professorId);
    const loadScore = stats.totalSessions * 2;
    
    return dayScore + timeScore + loadScore;
  }

  /**
   * UPDATE PROFESSOR STATISTICS
   */
  updateStats(professorId, dayOfWeek, slotType, increment) {
    if (!this.professorStats.has(professorId)) return;
    
    const stats = this.professorStats.get(professorId);
    stats.totalSessions += increment;
    
    if (!stats.dailySessions.has(dayOfWeek)) {
      stats.dailySessions.set(dayOfWeek, 0);
    }
    stats.dailySessions.set(dayOfWeek, stats.dailySessions.get(dayOfWeek) + increment);
    
    if (slotType === 'LAB') {
      stats.labCount += increment;
    }
  }

  /**
   * GET PROFESSOR LOAD
   * Returns daily and total load statistics
   */
  getLoad(professorId) {
    if (!this.professorStats.has(professorId)) return null;
    
    const stats = this.professorStats.get(professorId);
    const dailyLoads = {};
    
    stats.dailySessions.forEach((count, day) => {
      dailyLoads[day] = count;
    });
    
    return {
      totalSessions: stats.totalSessions,
      totalLabs: stats.labCount,
      dailyLoads,
      maxDailyLoad: Math.max(...Object.values(dailyLoads), 0)
    };
  }

  /**
   * CHECK if professor is overloaded
   */
  isOverloaded(professorId, maxDailyLectures = 4, maxDailyLabs = 2) {
    const load = this.getLoad(professorId);
    if (!load) return false;

    // Check daily lecture count
    const dailyLectures = load.dailyLoads;
    for (const [day, count] of Object.entries(dailyLoads)) {
      if (count > maxDailyLectures) {
        return {
          overloaded: true,
          reason: `${day}: ${count} sessions (max ${maxDailyLectures})`,
          day,
          count
        };
      }
    }

    // Check total labs on heaviest day
    const labsByDay = {};
    // (would need to check actual lab counts per day)
    
    return { overloaded: false };
  }

  /**
   * GENERATE AVAILABILITY REPORT
   */
  generateReport(professorId = null) {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   PROFESSOR AVAILABILITY MATRIX REPORT');
    console.log('═══════════════════════════════════════════════════════════\n');

    const profs = professorId ? [professorId] : Array.from(this.professorStats.keys());

    profs.forEach(pId => {
      const stats = this.professorStats.get(pId);
      const load = this.getLoad(pId);
      
      console.log(`📊 Professor ${pId}:`);
      console.log(`   Total Sessions: ${stats.totalSessions}`);
      console.log(`   Total Labs: ${stats.labCount}`);
      console.log(`   Max Daily Load: ${load.maxDailyLoad}`);
      console.log(`   Daily Breakdown:`, load.dailyLoads);
      
      const overload = this.isOverloaded(pId);
      if (overload.overloaded) {
        console.log(`   ⚠️  OVERLOADED: ${overload.reason}`);
      } else {
        console.log(`   ✅ Balanced load`);
      }
      console.log();
    });
  }
}

module.exports = ProfessorAvailabilityMatrix;
