/**
 * Local AI Admin Assistant - Query Handler
 * Offline Ollama-based responses for Smart Scheduler
 * 
 * Rules:
 * - Enabled professors = Present (is_active = true)
 * - Disabled professors = Absent (is_active = false)
 */

const pool = require('./src/config/db');

class AdminAssistant {
  /**
   * Get total professor count
   */
  static async getTotalProfessors() {
    const result = await pool.query('SELECT COUNT(*) as total FROM professors');
    return result.rows[0].total;
  }

  /**
   * Get present professors (enabled)
   */
  static async getPresentProfessors() {
    const result = await pool.query('SELECT COUNT(*) as total FROM professors WHERE is_active = true');
    return result.rows[0].total;
  }

  /**
   * Get absent professors (disabled)
   */
  static async getAbsentProfessors() {
    const result = await pool.query('SELECT COUNT(*) as total FROM professors WHERE is_active = false');
    return result.rows[0].total;
  }

  /**
   * Get list of absent professors
   */
  static async getAbsentProfessorsList() {
    const result = await pool.query('SELECT name FROM professors WHERE is_active = false ORDER BY name');
    return result.rows.map(p => p.name);
  }

  /**
   * Get list of present professors
   */
  static async getPresentProfessorsList() {
    const result = await pool.query('SELECT name FROM professors WHERE is_active = true ORDER BY name');
    return result.rows.map(p => p.name);
  }

  /**
   * Get daily timetable for a specific day
   */
  static async getDailyTimetable(dayOfWeek) {
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (!validDays.includes(dayOfWeek)) {
      return null;
    }

    const result = await pool.query(`
      SELECT t.*, c.room_number, p.name as professor_name, s.name as subject_name
      FROM timetable t
      LEFT JOIN classes c ON t.class_id = c.class_id
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      WHERE t.day_of_week = $1
      ORDER BY t.time_slot_start
    `, [dayOfWeek]);
    
    return result.rows;
  }

  /**
   * Get free slots for a specific day
   */
  static async getFreeSlots(dayOfWeek) {
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (!validDays.includes(dayOfWeek)) {
      return null;
    }

    const result = await pool.query(`
      SELECT DISTINCT time_slot_start 
      FROM classes
      LEFT JOIN timetable ON classes.class_id = timetable.class_id 
        AND timetable.day_of_week = $1
      WHERE timetable.timetable_id IS NULL
      ORDER BY time_slot_start
    `, [dayOfWeek]);

    return result.rows.map(r => r.time_slot_start);
  }

  /**
   * Get available classes/rooms
   */
  static async getAvailableClasses() {
    const result = await pool.query(`
      SELECT * FROM classes 
      WHERE is_active = true
      ORDER BY branch_id, room_number
    `);
    return result.rows;
  }

  /**
   * Get all subjects
   */
  static async getAllSubjects() {
    const result = await pool.query(`
      SELECT s.*, b.name as branch_name, p.name as professor_name
      FROM subjects s
      LEFT JOIN departments b ON s.department_id = b.department_id
      LEFT JOIN professors_subjects ps ON s.subject_id = ps.subject_id
      LEFT JOIN professors p ON ps.professor_id = p.professor_id
      ORDER BY s.semester, s.name
    `);
    return result.rows;
  }

  /**
   * Parse natural language question and return answer
   */
  static async handleQuestion(question) {
    const q = question.toLowerCase().trim();

    // Count absent professors
    if (q.includes('how many') && (q.includes('absent') || q.includes('disabled'))) {
      const count = await this.getAbsentProfessors();
      return `${count} professors are absent`;
    }

    // Count present professors
    if (q.includes('how many') && q.includes('present')) {
      const count = await this.getPresentProfessors();
      return `${count} professors are present`;
    }

    // Total professors
    if ((q.includes('total') || q.includes('how many')) && q.includes('professor')) {
      const count = await this.getTotalProfessors();
      return `${count} professors`;
    }

    // List absent professors
    if ((q.includes('list') || q.includes('which')) && q.includes('absent')) {
      const list = await this.getAbsentProfessorsList();
      if (list.length === 0) return 'No absent professors';
      return `Absent professors: ${list.join(', ')}`;
    }

    // Daily timetable
    if (q.includes('timetable') || q.includes('schedule') || q.includes('lecture')) {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      for (const day of days) {
        if (q.includes(day.toLowerCase())) {
          const slots = await this.getDailyTimetable(day);
          if (!slots || slots.length === 0) return `No lectures scheduled on ${day}`;
          return `${day}: ${slots.length} lectures scheduled`;
        }
      }
    }

    // Free slots
    if (q.includes('free slot') || q.includes('available time')) {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      for (const day of days) {
        if (q.includes(day.toLowerCase())) {
          const slots = await this.getFreeSlots(day);
          if (!slots || slots.length === 0) return `No free slots on ${day}`;
          return `${slots.length} free slots on ${day}`;
        }
      }
    }

    return 'Data not available';
  }
}

// CLI Usage
if (require.main === module) {
  const question = process.argv[2] || 'How many professors are absent?';
  
  AdminAssistant.handleQuestion(question)
    .then(answer => {
      console.log(answer);
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

module.exports = AdminAssistant;
