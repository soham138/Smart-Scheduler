const Timetable = require('../models/Timetable');
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

exports.getProfessorTimetable = async (req, res) => {
  try {
    const { professorId } = req.params;

    const timetable = await Timetable.findByProfessor(professorId);

    if (!timetable || timetable.length === 0) {
      return res.status(404).json({ error: 'No timetable found for this professor' });
    }

    // Group by day and organize
    const organized = this.organizeTimetable(timetable);
    res.json({ success: true, data: organized });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTimetableSummary = async (req, res) => {
  try {
    const { professorId } = req.params;

    const query = `
      SELECT 
        COUNT(*) as total_slots,
        COUNT(DISTINCT day_of_week) as days_per_week,
        COUNT(DISTINCT subject_id) as subjects_assigned,
        json_agg(DISTINCT slot_type) as slot_types
      FROM timetable 
      WHERE professor_id = $1;
    `;

    const result = await pool.query(query, [professorId]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addAssignment = async (req, res) => {
  try {
    const { professorId, subjectId, title, contentType, content, semester } = req.body;

    if (!professorId || !subjectId || !title || !contentType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = uuidv4();
    let contentUrl = null;
    let contentText = null;

    // Process content based on type
    if (contentType === 'TEXT') {
      contentText = content;
    } else if (contentType === 'LINK') {
      contentUrl = content;
    } else if (contentType === 'PDF' || contentType === 'IMAGE') {
      // For PDF and IMAGE, store the base64 data in content_text as it's already a string
      contentText = content;
    }

    const query = `
      INSERT INTO assignments 
      (assignment_id, professor_id, subject_id, title, content_type, content_url, content_text, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      id, professorId, subjectId, title, contentType, contentUrl, contentText
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProfessorAssignments = async (req, res) => {
  try {
    const { professorId } = req.params;

    const query = `
      SELECT a.*, s.name as subject_name 
      FROM assignments a
      LEFT JOIN subjects s ON a.subject_id = s.subject_id
      WHERE a.professor_id = $1
      ORDER BY a.created_at DESC;
    `;

    const result = await pool.query(query, [professorId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSubjectAssignments = async (req, res) => {
  try {
    const { subjectId } = req.params;

    const query = `
      SELECT a.*, p.name as professor_name
      FROM assignments a
      LEFT JOIN professors p ON a.professor_id = p.professor_id
      WHERE a.subject_id = $1
      ORDER BY a.due_date DESC;
    `;

    const result = await pool.query(query, [subjectId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { title, description, contentType, contentUrl, contentText, dueDate } = req.body;

    const query = `
      UPDATE assignments 
      SET title = $2, description = $3, content_type = $4, content_url = $5, content_text = $6, due_date = $7, updated_at = CURRENT_TIMESTAMP
      WHERE assignment_id = $1
      RETURNING *;
    `;

    const result = await pool.query(query, [assignmentId, title, description, contentType, contentUrl, contentText, dueDate]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const query = `DELETE FROM assignments WHERE assignment_id = $1 RETURNING *;`;
    const result = await pool.query(query, [assignmentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ success: true, message: 'Assignment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProfessorSubjects = async (req, res) => {
  try {
    const { professorId } = req.params;

    const query = `
      SELECT s.* FROM subjects s
      INNER JOIN professors_subjects ps ON s.subject_id = ps.subject_id
      WHERE ps.professor_id = $1
      ORDER BY s.semester, s.name;
    `;

    const result = await pool.query(query, [professorId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.organizeTimetable = function(timetable) {
  const organized = {};

  timetable.forEach(slot => {
    if (!organized[slot.day_of_week]) {
      organized[slot.day_of_week] = [];
    }

    organized[slot.day_of_week].push({
      time: `${slot.time_slot_start} - ${slot.time_slot_end}`,
      subject: slot.subject_name,
      type: slot.slot_type,
      branch: slot.branch_name,
      room: slot.room_id,
    });
  });

  return organized;
}
