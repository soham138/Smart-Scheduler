const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class Timetable {
  static async create(semester, branchId, batchId, professorId, subjectId, dayOfWeek, timeStart, timeEnd, slotType, roomId = null, labId = null) {
    const id = uuidv4();
    const query = `
      INSERT INTO timetable 
      (timetable_id, semester, branch_id, batch_id, professor_id, subject_id, day_of_week, time_slot_start, time_slot_end, slot_type, room_id, lab_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    const result = await pool.query(query, [id, semester, branchId, batchId, professorId, subjectId, dayOfWeek, timeStart, timeEnd, slotType, roomId, labId]);
    return result.rows[0];
  }

  static async findByBranchSemester(branchId, semester) {
    const query = `
      SELECT t.timetable_id, t.semester, t.branch_id, t.batch_id, t.professor_id, t.subject_id, t.day_of_week, t.time_slot_start, t.time_slot_end, t.slot_type, t.room_id, t.lab_id, s.name as subject_name, p.name as professor_name, b.name as branch_name, bat.batch_number
      FROM timetable t
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      LEFT JOIN batches bat ON t.batch_id = bat.batch_id
      WHERE t.branch_id = $1 AND t.semester = $2
      ORDER BY CASE t.day_of_week
        WHEN 'MON' THEN 1
        WHEN 'TUE' THEN 2
        WHEN 'WED' THEN 3
        WHEN 'THU' THEN 4
        WHEN 'FRI' THEN 5
        ELSE 6
      END, t.time_slot_start;
    `;
    const result = await pool.query(query, [branchId, semester]);
    return result.rows;
  }

  static async findByProfessor(professorId) {
    const query = `
      SELECT t.timetable_id, t.semester, t.branch_id, t.batch_id, t.professor_id, t.subject_id, t.day_of_week, t.time_slot_start, t.time_slot_end, t.slot_type, t.room_id, t.lab_id, s.name as subject_name, b.name as branch_name, bat.batch_number, p.name as professor_name
      FROM timetable t
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      LEFT JOIN batches bat ON t.batch_id = bat.batch_id
      WHERE t.professor_id = $1
      ORDER BY CASE t.day_of_week
        WHEN 'MON' THEN 1
        WHEN 'TUE' THEN 2
        WHEN 'WED' THEN 3
        WHEN 'THU' THEN 4
        WHEN 'FRI' THEN 5
        ELSE 6
      END, t.time_slot_start;
    `;
    const result = await pool.query(query, [professorId]);
    return result.rows;
  }

  static async findByBatch(batchId) {
    const query = `
      SELECT t.timetable_id, t.semester, t.branch_id, t.batch_id, t.professor_id, t.subject_id, t.day_of_week, t.time_slot_start, t.time_slot_end, t.slot_type, t.room_id, t.lab_id, s.name as subject_name, p.name as professor_name, b.name as branch_name, bat.batch_number
      FROM timetable t
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      LEFT JOIN batches bat ON t.batch_id = bat.batch_id
      WHERE t.batch_id = $1
      ORDER BY CASE t.day_of_week
        WHEN 'MON' THEN 1
        WHEN 'TUE' THEN 2
        WHEN 'WED' THEN 3
        WHEN 'THU' THEN 4
        WHEN 'FRI' THEN 5
        ELSE 6
      END, t.time_slot_start;
    `;
    const result = await pool.query(query, [batchId]);
    return result.rows;
  }

  static async deleteByBranchSemester(branchId, semester) {
    const query = `DELETE FROM timetable WHERE branch_id = $1 AND semester = $2 RETURNING *;`;
    const result = await pool.query(query, [branchId, semester]);
    return result.rows;
  }

  static async update(timetableId, timeStart, timeEnd, slotType) {
    const query = `
      UPDATE timetable 
      SET time_slot_start = $2, time_slot_end = $3, slot_type = $4, updated_at = CURRENT_TIMESTAMP, version = version + 1
      WHERE timetable_id = $1
      RETURNING *;
    `;
    const result = await pool.query(query, [timetableId, timeStart, timeEnd, slotType]);
    return result.rows[0];
  }

  static async checkConflict(professorId, dayOfWeek, timeStart, timeEnd, excludeTimetableId = null) {
    let query = `
      SELECT * FROM timetable 
      WHERE professor_id = $1 AND day_of_week = $2
      AND NOT (time_slot_end <= $3 OR time_slot_start >= $4)
    `;
    const params = [professorId, dayOfWeek, timeStart, timeEnd];
    
    if (excludeTimetableId) {
      query += ` AND timetable_id != $5`;
      params.push(excludeTimetableId);
    }
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async getLabsInSlot(dayOfWeek, timeStart, timeEnd) {
    const query = `
      SELECT COUNT(*) as lab_count FROM timetable 
      WHERE slot_type = 'LAB' AND day_of_week = $1
      AND NOT (time_slot_end <= $2 OR time_slot_start >= $3);
    `;
    const result = await pool.query(query, [dayOfWeek, timeStart, timeEnd]);
    return parseInt(result.rows[0].lab_count);
  }
}

module.exports = Timetable;
