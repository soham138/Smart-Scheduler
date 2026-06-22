const Professor = require('../models/Professor');
const Subject = require('../models/Subject');
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

exports.addProfessor = async (req, res) => {
  try {
    const { name, email, phone, department, hours_per_week = 30 } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    if (hours_per_week < 1 || hours_per_week > 40) {
      return res.status(400).json({ error: 'Hours per week must be between 1 and 40' });
    }

    const existingProf = await Professor.findByEmail(email);
    if (existingProf) {
      return res.status(400).json({ error: 'Professor with this email already exists' });
    }

    const professor = await Professor.create(name, email, phone, department, hours_per_week);
    res.status(201).json({ success: true, data: professor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllProfessors = async (req, res) => {
  try {
    const query = `
      SELECT p.* FROM professors p
      ORDER BY p.name;
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProfessor = async (req, res) => {
  try {
    const { id } = req.params;
    const professor = await Professor.findById(id);

    if (!professor) {
      return res.status(404).json({ error: 'Professor not found' });
    }

    const subjects = await Professor.getSubjects(id);
    res.json({ success: true, data: { ...professor, subjects } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateProfessor = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, department, hours_per_week = 30 } = req.body;

    if (hours_per_week < 1 || hours_per_week > 40) {
      return res.status(400).json({ error: 'Hours per week must be between 1 and 40' });
    }

    const professor = await Professor.update(id, name, email, phone, department, hours_per_week);

    if (!professor) {
      return res.status(404).json({ error: 'Professor not found' });
    }

    res.json({ success: true, data: professor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteProfessor = async (req, res) => {
  try {
    const { id } = req.params;
    const professor = await Professor.delete(id);

    if (!professor) {
      return res.status(404).json({ error: 'Professor not found' });
    }

    res.json({ success: true, message: 'Professor deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Toggle professor status (disable/enable)
 * When professor is disabled, all subjects assigned to them are also disabled
 */
exports.toggleProfessorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    // Update professor status
    const result = await pool.query(
      'UPDATE professors SET is_active = $1 WHERE professor_id = $2 RETURNING professor_id, name, is_active',
      [is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Professor not found' });
    }

    const professor = result.rows[0];

    // If disabling professor, also disable their subjects
    if (!is_active) {
      await pool.query(
        `UPDATE subjects SET is_active = false 
         WHERE subject_id IN (
           SELECT subject_id FROM professors_subjects WHERE professor_id = $1
         )`,
        [id]
      );
    }
    
    // If enabling professor, also enable their subjects
    if (is_active) {
      await pool.query(
        `UPDATE subjects SET is_active = true 
         WHERE subject_id IN (
           SELECT subject_id FROM professors_subjects WHERE professor_id = $1
         )`,
        [id]
      );
    }

    res.json({
      success: true,
      message: is_active ? 'Professor enabled successfully and assigned subjects re-enabled' : 'Professor disabled and all assigned subjects disabled',
      data: professor
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addSubject = async (req, res) => {
  try {
    const { name, type, semester, weeklyLectureCount, credits, labCount } = req.body;

    if (!name || !type || !semester) {
      return res.status(400).json({ error: 'Name, type, and semester are required' });
    }

    const subject = await Subject.create(name, type, semester, weeklyLectureCount, credits, labCount);
    res.status(201).json({ success: true, data: subject });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllSubjects = async (req, res) => {
  try {
    const query = `
      SELECT s.*, 
             STRING_AGG(DISTINCT COALESCE(p.name, ''), ', ') FILTER (WHERE p.name IS NOT NULL) as professor_names
      FROM subjects s
      LEFT JOIN professors_subjects ps ON s.subject_id = ps.subject_id
      LEFT JOIN professors p ON ps.professor_id = p.professor_id
      GROUP BY s.subject_id, s.name, s.code, s.type, s.semester, s.weekly_lecture_count, s.weekly_lab_count, s.credits, s.created_at, s.updated_at
      ORDER BY s.semester, s.name;
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const subject = await Subject.findById(id);

    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Get branches
    const branchesRes = await pool.query(
      `SELECT b.branch_id, b.name as branch_name FROM branches b 
       WHERE b.branch_id IN (SELECT sb.branch_id FROM subjects_branches sb WHERE sb.subject_id = $1)
       ORDER BY b.name`,
      [id]
    );

    // Get professors
    const professorsRes = await pool.query(
      `SELECT p.professor_id, p.name FROM professors p 
       WHERE p.professor_id IN (SELECT ps.professor_id FROM professors_subjects ps WHERE ps.subject_id = $1)
       ORDER BY p.name`,
      [id]
    );

    res.json({ 
      success: true, 
      data: {
        ...subject,
        branches: branchesRes.rows,
        professor_ids: professorsRes.rows.map(p => p.professor_id),
        professor_names: professorsRes.rows.map(p => p.name).join(', ')
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, semester, weeklyLectureCount, credits, labCount } = req.body;

    const subject = await Subject.update(id, name, type, semester, weeklyLectureCount, credits, labCount);

    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    res.json({ success: true, data: subject });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const subject = await Subject.delete(id);

    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    res.json({ success: true, message: 'Subject deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.mapProfessorSubject = async (req, res) => {
  try {
    const { professorId, subjectId } = req.params;

    // Verify professor and subject exist
    const professor = await Professor.findById(professorId);
    const subject = await Subject.findById(subjectId);

    if (!professor || !subject) {
      return res.status(404).json({ error: 'Professor or subject not found' });
    }

    // ⚠️ KEY RULE: Each subject can ONLY be assigned to ONE professor
    // Check if this subject is already assigned to someone else
    const alreadyAssignedQuery = `
      SELECT ps.professor_id, p.name 
      FROM professors_subjects ps
      JOIN professors p ON ps.professor_id = p.professor_id
      WHERE ps.subject_id = $1
    `;
    const alreadyAssigned = await pool.query(alreadyAssignedQuery, [subjectId]);

    if (alreadyAssigned.rows.length > 0) {
      const assignedProf = alreadyAssigned.rows[0];
      
      // If it's the same professor, allow (idempotent)
      if (assignedProf.professor_id !== professorId) {
        return res.status(400).json({ 
          error: 'Subject already assigned to another professor',
          message: `${subject.code} (${subject.name}) is already assigned to ${assignedProf.name}. Each subject can only be taught by one professor.`,
          assignedTo: assignedProf.name,
          subject: subject.code
        });
      }
    }

    // Check professor's current workload
    const countQuery = `
      SELECT COUNT(*) as total_subjects
      FROM professors_subjects
      WHERE professor_id = $1
    `;
    const countResult = await pool.query(countQuery, [professorId]);
    const currentCount = parseInt(countResult.rows[0].total_subjects, 10) || 0;

    // Maximum per professor (allow unassigned, but limit assigned subjects per prof)
    // With 31 subjects and 32 professors: some get 1 subject, some get 0 (which is fine)
    const MAX_SUBJECTS_PER_PROFESSOR = 3;
    
    if (currentCount >= MAX_SUBJECTS_PER_PROFESSOR) {
      return res.status(400).json({ 
        error: 'Professor subject limit exceeded',
        message: `${professor.name} is already assigned to ${currentCount} subject(s). Maximum ${MAX_SUBJECTS_PER_PROFESSOR} per professor.`,
        currentSubjects: currentCount,
        maxLimit: MAX_SUBJECTS_PER_PROFESSOR
      });
    }

    const id = uuidv4();
    const query = `
      INSERT INTO professors_subjects (mapping_id, professor_id, subject_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (professor_id, subject_id) DO NOTHING
      RETURNING *;
    `;

    const result = await pool.query(query, [id, professorId, subjectId]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Mapping already exists' });
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.removeProfessorSubject = async (req, res) => {
  try {
    const { professorId, subjectId } = req.params;

    const query = `
      DELETE FROM professors_subjects 
      WHERE professor_id = $1 AND subject_id = $2
      RETURNING *;
    `;

    const result = await pool.query(query, [professorId, subjectId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mapping not found' });
    }

    res.json({ success: true, message: 'Mapping removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProfessorSubjects = async (req, res) => {
  try {
    const { professorId } = req.params;
    const subjects = await Professor.getSubjects(professorId);
    res.json({ success: true, data: subjects });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.assignSubjectBranch = async (req, res) => {
  try {
    const { subjectId, branchId } = req.params;

    const id = uuidv4();
    const query = `
      INSERT INTO subjects_branches (id, subject_id, branch_id, is_applicable)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (subject_id, branch_id) DO UPDATE SET is_applicable = TRUE
      RETURNING *;
    `;

    const result = await pool.query(query, [id, subjectId, branchId]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.removeSubjectBranch = async (req, res) => {
  try {
    const { subjectId, branchId } = req.params;

    const query = `
      UPDATE subjects_branches 
      SET is_applicable = FALSE 
      WHERE subject_id = $1 AND branch_id = $2
      RETURNING *;
    `;

    const result = await pool.query(query, [subjectId, branchId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ success: true, message: 'Subject removed from branch' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSubjectBranches = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const branches = await Subject.getBranches(subjectId);
    res.json({ success: true, data: branches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllFeedback = async (req, res) => {
  try {
    const query = `SELECT * FROM student_feedback ORDER BY created_at DESC;`;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const query = `SELECT * FROM student_feedback WHERE feedback_id = $1;`;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const query = `DELETE FROM student_feedback WHERE feedback_id = $1 RETURNING *;`;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json({ success: true, message: 'Feedback deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllBranches = async (req, res) => {
  try {
    const query = `SELECT branch_id, name, code FROM branches ORDER BY name;`;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
