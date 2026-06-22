/**
 * Admin Assistant API Endpoint
 * Enables frontend to get facts-only answers from Smart Scheduler
 * 
 * Follows rule:
 * - Enabled (is_active=true) = Present
 * - Disabled (is_active=false) = Absent
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * POST /api/admin/ask
 * Body: { question: "string" }
 * Returns: { answer: "string" }
 */
router.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || question.trim() === '') {
      return res.status(400).json({ error: 'Question is required' });
    }

    const q = question.toLowerCase().trim();
    let answer = 'Data not available';

    // How many professors are absent?
    if (q.includes('how many') && (q.includes('absent') || q.includes('disabled'))) {
      const result = await pool.query('SELECT COUNT(*) as total FROM professors WHERE is_active = false');
      const count = result.rows[0].total;
      answer = `${count} professors are absent`;
    }
    
    // How many professors are present?
    else if (q.includes('how many') && q.includes('present')) {
      const result = await pool.query('SELECT COUNT(*) as total FROM professors WHERE is_active = true');
      const count = result.rows[0].total;
      answer = `${count} professors are present`;
    }
    
    // Total professors?
    else if ((q.includes('total') || q.includes('how many all')) && q.includes('professor')) {
      const result = await pool.query('SELECT COUNT(*) as total FROM professors');
      const count = result.rows[0].total;
      answer = `${count} professors`;
    }
    
    // List absent professors
    else if ((q.includes('list') || q.includes('which')) && q.includes('absent')) {
      const result = await pool.query('SELECT name FROM professors WHERE is_active = false ORDER BY name');
      if (result.rows.length === 0) {
        answer = 'No absent professors';
      } else {
        const names = result.rows.map(r => r.name).join(', ');
        answer = `Absent professors: ${names}`;
      }
    }
    
    // List present professors
    else if ((q.includes('list') || q.includes('which')) && q.includes('present')) {
      const result = await pool.query('SELECT name FROM professors WHERE is_active = true ORDER BY name');
      if (result.rows.length === 0) {
        answer = 'No present professors';
      } else {
        const names = result.rows.map(r => r.name).join(', ');
        answer = `Present professors: ${names}`;
      }
    }

    res.json({ answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/professors/summary
 * Returns: { total, present, absent }
 */
router.get('/professors/summary', async (req, res) => {
  try {
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM professors');
    const presentResult = await pool.query('SELECT COUNT(*) as total FROM professors WHERE is_active = true');
    const absentResult = await pool.query('SELECT COUNT(*) as total FROM professors WHERE is_active = false');

    res.json({
      total: totalResult.rows[0].total,
      present: presentResult.rows[0].total,
      absent: absentResult.rows[0].total
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/professors/absent
 * Returns: { list: ["Name1", "Name2", ...] }
 */
router.get('/professors/absent', async (req, res) => {
  try {
    const result = await pool.query('SELECT name FROM professors WHERE is_active = false ORDER BY name');
    res.json({ list: result.rows.map(r => r.name) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/professors/present
 * Returns: { list: ["Name1", "Name2", ...] }
 */
router.get('/professors/present', async (req, res) => {
  try {
    const result = await pool.query('SELECT name FROM professors WHERE is_active = true ORDER BY name');
    res.json({ list: result.rows.map(r => r.name) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
