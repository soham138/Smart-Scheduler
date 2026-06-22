import React from 'react';
import { useNavigate } from 'react-router-dom';

const RoleSelection = () => {
  const navigate = useNavigate();

  const roles = [
    {
      id: 'admin',
      icon: '👨‍💼',
      title: 'Admin Panel',
      description: 'Manage timetables and system settings'
    },
    {
      id: 'professor',
      icon: '👨‍🏫',
      title: 'Professor Panel',
      description: 'View assigned classes and schedule'
    },
    {
      id: 'student',
      icon: '👨‍🎓',
      title: 'Student Panel',
      description: 'View your personal timetable'
    },
    {
      id: 'developer',
      icon: '🛠️',
      title: 'Developer Panel',
      description: 'Manage user credentials & accounts'
    }
  ];

  const handleRoleSelect = (role) => {
    navigate(`/login/${role}`);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Smart Scheduler</h1>
        <h2 style={styles.subtitle}>Intelligent Timetable Generator</h2>

        <p style={styles.selectText}>Select your role to login:</p>

        <div style={styles.rolesGrid}>
          {roles.map((role) => (
            <div
              key={role.id}
              onClick={() => handleRoleSelect(role.id)}
              style={styles.roleCard}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-5px)';
                e.currentTarget.style.boxShadow = '0 15px 30px rgba(0, 0, 0, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.1)';
              }}
            >
              <div style={styles.icon}>{role.icon}</div>
              <h3 style={styles.roleTitle}>{role.title}</h3>
              <p style={styles.roleDescription}>{role.description}</p>
              <button style={styles.button}>Login</button>
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            🔒 Secure authentication with role-based access control
          </p>
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
    borderRadius: '20px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
    padding: '50px',
    width: '100%',
    maxWidth: '1100px'
  },
  title: {
    textAlign: 'center',
    color: '#5c6bc0',
    marginBottom: '8px',
    fontSize: '40px',
    fontWeight: '800',
    letterSpacing: '-0.5px'
  },
  subtitle: {
    textAlign: 'center',
    color: '#999',
    marginBottom: '40px',
    fontSize: '18px',
    fontWeight: '400'
  },
  selectText: {
    textAlign: 'center',
    color: '#212121',
    marginBottom: '35px',
    fontSize: '18px',
    fontWeight: '600'
  },
  rolesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '25px',
    marginBottom: '30px'
  },
  roleCard: {
    background: 'linear-gradient(135deg, #fafbfc 0%, #eff2f7 100%)',
    border: '2px solid #e8eef7',
    borderRadius: '16px',
    padding: '30px 25px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: '0 4px 12px rgba(92, 107, 192, 0.08)'
  },
  icon: {
    fontSize: '55px',
    marginBottom: '15px'
  },
  roleTitle: {
    color: '#212121',
    marginBottom: '10px',
    fontSize: '18px',
    fontWeight: '700'
  },
  roleDescription: {
    color: '#666',
    marginBottom: '20px',
    fontSize: '13px',
    lineHeight: '1.6'
  },
  button: {
    background: 'linear-gradient(135deg, #5c6bc0 0%, #3f51b5 100%)',
    color: 'white',
    border: 'none',
    padding: '12px 28px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '15px',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 12px rgba(92, 107, 192, 0.3)'
  },
  footer: {
    textAlign: 'center',
    paddingTop: '25px',
    borderTop: '2px solid #e8eef7'
  },
  footerText: {
    color: '#999',
    fontSize: '14px',
    margin: '0',
    fontWeight: '500'
  }
};

export default RoleSelection;
