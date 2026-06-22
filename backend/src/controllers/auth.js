const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Login endpoint for all roles (admin, professor, student)
 */
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user in auth_users table
    const query = `
      SELECT user_id, username, password_hash, role, reference_id, email, is_active
      FROM auth_users
      WHERE username = $1 AND is_active = true
    `;

    const result = await pool.query(query, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Update last login
    await pool.query(
      'UPDATE auth_users SET last_login = NOW() WHERE user_id = $1',
      [user.user_id]
    );

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        reference_id: user.reference_id
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Get role-specific data
    let roleData = null;

    try {
      if (user.role === 'professor') {
        const profResult = await pool.query(
          'SELECT professor_id, name, email FROM professors WHERE professor_id = $1',
          [user.reference_id]
        );
        roleData = profResult.rows[0] || {};
      } else if (user.role === 'student') {
        const studentResult = await pool.query(
          'SELECT student_id, name, email, roll_number, batch_id FROM students WHERE student_id = $1',
          [user.reference_id]
        );
        roleData = studentResult.rows[0] || {};
      } else if (user.role === 'admin') {
        roleData = { admin_id: user.reference_id, email: user.email };
      }
    } catch (tableError) {
      // If role-specific table doesn't exist, just use auth_users data
      roleData = { email: user.email };
    }

    res.json({
      success: true,
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        reference_id: user.reference_id,
        ...roleData
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Middleware to verify JWT token
 */
exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

/**
 * Developer Panel: Get all users (admin or developer only)
 */
exports.getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Only admins and developers can view all users' });
    }

    const query = `
      SELECT user_id, username, role, reference_id, email, is_active, created_at, last_login
      FROM auth_users
      ORDER BY role, created_at DESC
    `;

    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Developer Panel: Add/Create user with username and password
 */
exports.createUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Only admins and developers can create users' });
    }

    const { username, password, role, email } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields: username, password, role' });
    }

    if (!['admin', 'professor', 'student', 'developer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be: admin, professor, student, or developer' });
    }

    // Auto-generate reference_id as MAX(reference_id) + 1 for this role
    const maxResult = await pool.query(
      'SELECT COALESCE(MAX(reference_id), 0) as max_id FROM auth_users WHERE role = $1',
      [role]
    );
    const reference_id = maxResult.rows[0].max_id + 1;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO auth_users (username, password_hash, role, reference_id, email, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING user_id, username, role, reference_id, email, is_active, created_at
    `;

    const result = await pool.query(query, [username, hashedPassword, role, reference_id, email]);

    res.json({
      success: true,
      message: 'User created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: error.message });
  }
};

/**
 * Developer Panel: Update user password
 */
exports.updateUserPassword = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Only admins and developers can update passwords' });
    }

    const { user_id, new_password } = req.body;

    if (!user_id || !new_password) {
      return res.status(400).json({ error: 'Missing required fields: user_id, new_password' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    const query = `
      UPDATE auth_users
      SET password_hash = $1, updated_at = NOW()
      WHERE user_id = $2
      RETURNING user_id, username, role, reference_id
    `;

    const result = await pool.query(query, [hashedPassword, user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Password updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Developer Panel: Delete user
 */
exports.deleteUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Only admins and developers can delete users' });
    }

    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Delete the user
    const deleteResult = await pool.query(
      'DELETE FROM auth_users WHERE user_id = $1 RETURNING user_id, username, role',
      [user_id]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Auto-renumber all remaining user IDs sequentially
    const allUsers = await pool.query(
      'SELECT user_id FROM auth_users ORDER BY user_id ASC'
    );

    // Renumber sequentially starting from 1
    for (let i = 0; i < allUsers.rows.length; i++) {
      const currentId = allUsers.rows[i].user_id;
      const newId = i + 1;
      
      if (currentId !== newId) {
        await pool.query(
          'UPDATE auth_users SET user_id = $1 WHERE user_id = $2',
          [newId, currentId]
        );
      }
    }

    // Reset the sequence for next inserts
    await pool.query(
      `SELECT setval('auth_users_user_id_seq', 
        COALESCE((SELECT MAX(user_id) FROM auth_users), 0))`
    );

    res.json({
      success: true,
      message: 'User deleted successfully and IDs auto-renumbered',
      data: deleteResult.rows[0]
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Developer Panel: Toggle user active status
 */
exports.toggleUserStatus = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Only admins and developers can toggle user status' });
    }

    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const query = `
      UPDATE auth_users
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE user_id = $1
      RETURNING user_id, username, role, is_active
    `;

    const result = await pool.query(query, [user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: `User ${result.rows[0].is_active ? 'activated' : 'deactivated'} successfully`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Developer Panel Login - Separate endpoint for developer credentials
 */
exports.developerLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`[DEVELOPER-LOGIN] Attempt: username=${username}`);

    if (!username || !password) {
      console.log('[DEVELOPER-LOGIN] Missing username or password');
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find developer user in auth_users table with role = 'developer'
    const query = `
      SELECT user_id, username, password_hash, role, reference_id, email, is_active
      FROM auth_users
      WHERE username = $1 AND role = 'developer' AND is_active = true
    `;

    const result = await pool.query(query, [username]);
    console.log(`[DEVELOPER-LOGIN] Query result: ${result.rows.length} rows found`);

    if (result.rows.length === 0) {
      console.log('[DEVELOPER-LOGIN] User not found');
      return res.status(401).json({ error: 'Invalid developer credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    console.log(`[DEVELOPER-LOGIN] Password valid: ${isPasswordValid}`);

    if (!isPasswordValid) {
      console.log('[DEVELOPER-LOGIN] Password verification failed');
      return res.status(401).json({ error: 'Invalid developer credentials' });
    }

    // Update last login
    await pool.query(
      'UPDATE auth_users SET last_login = NOW() WHERE user_id = $1',
      [user.user_id]
    );

    // Generate JWT token for developer
    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: 'admin',
        reference_id: user.reference_id
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        role: 'admin',
        reference_id: user.reference_id,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Developer login error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Logout endpoint (frontend will remove token)
 */
exports.logout = (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
};
