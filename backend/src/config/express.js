const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Import routes
const adminRoutes = require('../routes/admin');
const professorRoutes = require('../routes/professor');
const studentRoutes = require('../routes/student');
const timetableRoutes = require('../routes/timetable');
const authRoutes = require('../routes/auth');
const aiAssistanceRoutes = require('../routes/ai-assistance');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/professor', professorRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/ai', aiAssistanceRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date() });
});

// ✅ NEW: Dashboard route
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, '/../../dashboard.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;
