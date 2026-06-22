import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const Login = () => {
  const { role } = useParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const roleConfig = {
    admin: { title: 'Admin Panel', color: '#5c6bc0' },
    professor: { title: 'Professor Panel', color: '#29b6f6' },
    student: { title: 'Student Panel', color: '#4caf50' },
    developer: { title: 'Developer Panel', color: '#ff9800' }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // For developer panel, use special endpoint or local storage
      if (role === 'developer') {
        // Check developer credentials from local storage or specific endpoint
        const response = await fetch('http://localhost:5000/api/auth/developer-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Invalid developer credentials');
          setLoading(false);
          return;
        }

        localStorage.setItem('devToken', data.token);
        localStorage.setItem('devUser', JSON.stringify(data.user));
        navigate('/developer');
        return;
      }

      // For other roles, login via auth endpoint
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password, role })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Store token and user info
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Route based on role
      navigate(`/${role}`);
    } catch (error) {
      setError('Connection error: ' + error.message);
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Smart Scheduler</h1>
        <h2 style={{ ...styles.subtitle, color: roleConfig[role]?.color || '#667eea' }}>
          {roleConfig[role]?.title || 'Login'}
        </h2>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              style={styles.input}
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
              transform: loading ? 'none' : 'translateY(0)',
              transition: 'all 0.3s ease'
            }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div style={styles.backButton}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: '#f5f5f5',
              color: '#5c6bc0',
              border: '2px solid #e0e0e0',
              padding: '11px 22px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '14px',
              transition: 'all 0.3s ease'
            }}
          >
            ← Back to Role Selection
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #5c6bc0 0%, #3f51b5 100%)',
    fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
    padding: '20px'
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 15px 40px rgba(0, 0, 0, 0.2)',
    padding: '45px',
    width: '100%',
    maxWidth: '420px'
  },
  title: {
    textAlign: 'center',
    color: '#5c6bc0',
    marginBottom: '8px',
    fontSize: '32px',
    fontWeight: '800',
    letterSpacing: '-0.5px'
  },
  subtitle: {
    textAlign: 'center',
    color: '#999',
    marginBottom: '35px',
    fontSize: '15px',
    fontWeight: '500'
  },
  form: {
    marginBottom: '25px'
  },
  formGroup: {
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    marginBottom: '10px',
    color: '#212121',
    fontWeight: '700',
    fontSize: '14px'
  },
  input: {
    width: '100%',
    padding: '13px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    fontSize: '14px',
    boxSizing: 'border-box',
    background: '#fafbfc',
    transition: 'all 0.3s ease',
    ':focus': {
      outline: 'none',
      borderColor: '#5c6bc0',
      background: 'white'
    }
  },
  error: {
    background: 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)',
    color: '#c62828',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '15px',
    fontSize: '14px',
    border: '2px solid #ef5350',
    fontWeight: '600'
  },
  button: {
    width: '100%',
    padding: '13px',
    background: 'linear-gradient(135deg, #5c6bc0 0%, #3f51b5 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '700',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 12px rgba(92, 107, 192, 0.3)',
    cursor: 'pointer'
  },
  info: {
    marginTop: '20px',
    padding: '15px',
    background: '#ecf0f1',
    borderRadius: '5px',
    fontSize: '13px'
  },
  demoText: {
    margin: '8px 0',
    color: '#34495e'
  },
  backButton: {
    marginTop: '20px',
    textAlign: 'center'
  }
};

export default Login;
