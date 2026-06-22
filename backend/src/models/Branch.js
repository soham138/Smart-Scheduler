const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class Branch {
  static async findById(id) {
    const query = `SELECT * FROM branches WHERE branch_id = $1;`;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findAll() {
    const query = `SELECT * FROM branches ORDER BY name;`;
    const result = await pool.query(query);
    return result.rows;
  }

  static async create(name, code) {
    const id = uuidv4();
    const query = `
      INSERT INTO branches (branch_id, name, code)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await pool.query(query, [id, name, code]);
    return result.rows[0];
  }

  static async getSemesterSubjects(branchId, semester) {
    const query = `
      SELECT DISTINCT s.* FROM subjects s
      INNER JOIN subjects_branches sb ON s.subject_id = sb.subject_id
      WHERE sb.branch_id = $1 AND s.semester = $2 AND sb.is_applicable = TRUE
      ORDER BY s.name;
    `;
    const result = await pool.query(query, [branchId, semester]);
    return result.rows;
  }
}

module.exports = Branch;
