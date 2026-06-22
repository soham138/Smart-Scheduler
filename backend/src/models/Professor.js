const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class Professor {
  static async create(name, email, phone = null, department = null, hours_per_week = 30) {
    const id = uuidv4();
    const query = `
      INSERT INTO professors (professor_id, name, email, phone, department, hours_per_week)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const result = await pool.query(query, [id, name, email, phone, department, hours_per_week]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `SELECT * FROM professors WHERE professor_id = $1;`;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findByEmail(email) {
    const query = `SELECT * FROM professors WHERE email = $1;`;
    const result = await pool.query(query, [email]);
    return result.rows[0];
  }

  static async findAll() {
    const query = `
      SELECT p.*, 
        json_agg(json_build_object('subject_id', s.subject_id, 'subject_name', s.name)) 
        FILTER (WHERE s.subject_id IS NOT NULL) as subjects
      FROM professors p
      LEFT JOIN professors_subjects ps ON p.professor_id = ps.professor_id
      LEFT JOIN subjects s ON ps.subject_id = s.subject_id
      GROUP BY p.professor_id
      ORDER BY p.name;
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  static async update(id, name, email, phone, department, hours_per_week = 30) {
    const query = `
      UPDATE professors 
      SET name = $2, email = $3, phone = $4, department = $5, hours_per_week = $6, updated_at = CURRENT_TIMESTAMP
      WHERE professor_id = $1
      RETURNING *;
    `;
    const result = await pool.query(query, [id, name, email, phone, department, hours_per_week]);
    return result.rows[0];
  }

  static async delete(id) {
    const query = `DELETE FROM professors WHERE professor_id = $1 RETURNING *;`;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async getSubjects(professorId) {
    const query = `
      SELECT s.* FROM subjects s
      INNER JOIN professors_subjects ps ON s.subject_id = ps.subject_id
      WHERE ps.professor_id = $1
      ORDER BY s.semester, s.name;
    `;
    const result = await pool.query(query, [professorId]);
    return result.rows;
  }
}

module.exports = Professor;
