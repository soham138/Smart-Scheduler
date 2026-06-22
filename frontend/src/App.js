import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminPanel from './pages/AdminPanel';
import ProfessorPanel from './pages/ProfessorPanel';
import StudentPanel from './pages/StudentPanel';
import RoleSelection from './pages/RoleSelection';
import Login from './pages/Login';
import DeveloperPanel from './pages/DeveloperPanel';
import './styles/index.css';

// Protected Route Component
function ProtectedRoute({ children, role }) {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Public Routes - No Header */}
          <Route path="/" element={<RoleSelection />} />
          <Route path="/login/:role" element={<Login />} />

          {/* Developer Panel - Separate Auth */}
          <Route path="/developer" element={<DeveloperPanel />} />

          {/* Protected Panel Routes with Header */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <div className="App">
                  <header>
                    <div className="container">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Smart Scheduler - Intelligent Timetable Generator</h1>
                        <button
                          onClick={() => {
                            localStorage.removeItem('token');
                            localStorage.removeItem('user');
                            window.location.href = '/';
                          }}
                          style={{
                            padding: '10px 20px',
                            background: 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '600',
                            transition: 'all 0.3s ease'
                          }}
                          onMouseOver={(e) => e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'}
                          onMouseOut={(e) => e.target.style.boxShadow = 'none'}
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  </header>
                  <main className="container">
                    <AdminPanel />
                  </main>
                  <footer style={{ textAlign: 'center', padding: '30px 20px', marginTop: '60px', borderTop: '2px solid #e0e0e0', background: 'linear-gradient(135deg, #fafbfc 0%, #f0f2f5 100%)', color: '#666666' }}>
                    <p>&copy; 2026 Smart Scheduler - Intelligent Timetable Generation System</p>
                  </footer>
                </div>
              </ProtectedRoute>
            }
          />

          <Route
            path="/professor"
            element={
              <ProtectedRoute role="professor">
                <div className="App">
                  <header>
                    <div className="container">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h1 style={{ fontSize: '1.5rem' }}>Smart Scheduler - Intelligent Timetable Generator</h1>
                        <button
                          onClick={() => {
                            localStorage.removeItem('token');
                            localStorage.removeItem('user');
                            window.location.href = '/';
                          }}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#e74c3c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  </header>
                  <main className="container">
                    <ProfessorPanel />
                  </main>
                  <footer style={{ textAlign: 'center', padding: '20px', marginTop: '40px', borderTop: '1px solid #ddd' }}>
                    <p>&copy; 2026 Smart Scheduler - Intelligent Timetable Generation System</p>
                  </footer>
                </div>
              </ProtectedRoute>
            }
          />

          <Route
            path="/student"
            element={
              <ProtectedRoute role="student">
                <div className="App">
                  <header>
                    <div className="container">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h1 style={{ fontSize: '1.5rem' }}>Smart Scheduler - Intelligent Timetable Generator</h1>
                        <button
                          onClick={() => {
                            localStorage.removeItem('token');
                            localStorage.removeItem('user');
                            window.location.href = '/';
                          }}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#e74c3c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  </header>
                  <main className="container">
                    <StudentPanel />
                  </main>
                  <footer style={{ textAlign: 'center', padding: '20px', marginTop: '40px', borderTop: '1px solid #ddd' }}>
                    <p>&copy; 2026 Smart Scheduler - Intelligent Timetable Generation System</p>
                  </footer>
                </div>
              </ProtectedRoute>
            }
          />

          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
