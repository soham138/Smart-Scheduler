import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const DeveloperPanel = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'admin',
    email: ''
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPassword, setEditingPassword] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const navigate = useNavigate();

  const token = localStorage.getItem('devToken');
  const user = JSON.parse(localStorage.getItem('devUser') || '{}');

  useEffect(() => {
    if (!token) {
      navigate('/login/developer');
    } else {
      fetchUsers();
    }
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/auth/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.data);
      setError('');
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('http://localhost:5000/api/auth/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error);
        return;
      }

      setUsers([...users, data.data]);
      setFormData({
        username: '',
        password: '',
        role: 'admin',
        email: ''
      });
      setShowAddForm(false);
    } catch (error) {
      setError(error.message);
    }
  };

  const handlePasswordChange = async (userId) => {
    if (!newPassword) {
      setError('Password cannot be empty');
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/auth/users/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userId,
          new_password: newPassword
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error);
        return;
      }

      setEditingPassword(null);
      setNewPassword('');
      setError('');
      alert('Password updated successfully');
    } catch (error) {
      setError(error.message);
    }
  };

  const handleToggleStatus = async (userId) => {
    try {
      const response = await fetch('http://localhost:5000/api/auth/users/status', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ user_id: userId })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error);
        return;
      }

      fetchUsers();
    } catch (error) {
      setError(error.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/auth/users', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ user_id: userId })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error);
        return;
      }

      fetchUsers();
    } catch (error) {
      setError(error.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('devToken');
    localStorage.removeItem('devUser');
    navigate('/');
  };

  const renderActionButtons = (u) => {
    if (editingPassword === u.user_id) {
      return (
        <div style={styles.passwordEdit}>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            style={styles.smallInput}
          />
          <button
            onClick={() => handlePasswordChange(u.user_id)}
            style={styles.saveBtn}
          >
            Save
          </button>
          <button
            onClick={() => {
              setEditingPassword(null);
              setNewPassword('');
            }}
            style={styles.cancelBtn}
          >
            Cancel
          </button>
        </div>
      );
    }
    return (
      <>
        <button
          onClick={() => setEditingPassword(u.user_id)}
          style={styles.actionBtn}
          title="Change password"
        >
          🔑
        </button>
        <button
          onClick={() => handleToggleStatus(u.user_id)}
          style={styles.actionBtn}
          title={u.is_active ? 'Deactivate' : 'Activate'}
        >
          {u.is_active ? '✓' : '✗'}
        </button>
        <button
          onClick={() => handleDeleteUser(u.user_id)}
          style={{...styles.actionBtn, color: '#e74c3c'}}
          title="Delete"
        >
          🗑️
        </button>
      </>
    );
  };

  if (user.role !== 'admin' && user.role !== 'developer') {
    return (
      <div style={styles.container}>
        <div style={styles.error}>Access Denied: Only admins and developers can access the Developer Panel</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>Developer Panel - User Management</h1>
        <div style={styles.headerButtons}>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={styles.primaryButton}
          >
            {showAddForm ? 'Cancel' : '➕ Add New User'}
          </button>
          <button
            onClick={handleLogout}
            style={styles.logoutButton}
          >
            🚪 Logout
          </button>
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {showAddForm && (
        <div style={styles.formCard}>
          <h2>Create New User</h2>
          <form onSubmit={handleAddUser} style={styles.form}>
            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label>Username</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Enter username"
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter password"
                  required
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label>Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  style={styles.input}
                >
                  <option value="admin">Admin</option>
                  <option value="professor">Professor</option>
                  <option value="student">Student</option>
                  <option value="developer">Developer</option>
                </select>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="E.g., user@college.edu"
                style={styles.input}
              />
            </div>

            <button type="submit" style={styles.submitButton}>
              Create User
            </button>
          </form>
        </div>
      )}

      <div style={styles.usersCard}>
        {/* Section Headings with Counts */}
        <div style={styles.summarySection}>
          <h2>User Summary</h2>
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>👨‍💼 Admin: {users.filter(u => u.role === 'admin').length}</div>
            <div style={styles.summaryCard}>👨‍🏫 Professors: {users.filter(u => u.role === 'professor').length}</div>
            <div style={styles.summaryCard}>👨‍🎓 Students: {users.filter(u => u.role === 'student').length}</div>
            <div style={styles.summaryCard}>🛠️ Developers: {users.filter(u => u.role === 'developer').length}</div>
          </div>
        </div>

        {loading ? (
          <p>Loading users...</p>
        ) : users.length === 0 ? (
          <p>No users found</p>
        ) : (
          <div style={styles.tablesContainer}>
            {/* Admin Users Table */}
            {users.filter(u => u.role === 'admin').length > 0 && (
              <div style={styles.tableSection}>
                <h3 style={{color: '#e74c3c', marginBottom: '15px'}}>👨‍💼 Admin Users ({users.filter(u => u.role === 'admin').length})</h3>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.headerRow}>
                      <th style={styles.th}>Admin ID</th>
                      <th style={styles.th}>Username</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Created</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.role === 'admin').sort((a, b) => (a.reference_id || 0) - (b.reference_id || 0)).map((u) => (
                      <tr key={u.user_id} style={styles.row}>
                        <td style={styles.cell}><span style={styles.refIdBadge}>{u.reference_id}</span></td>
                        <td style={styles.cell}><strong>{u.username}</strong></td>
                        <td style={styles.cell}>{u.email || 'N/A'}</td>
                        <td style={styles.cell}>
                          <span style={{...styles.badge, background: u.is_active ? '#27ae60' : '#e74c3c'}}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={styles.cell}>{new Date(u.created_at).toLocaleDateString()}</td>
                        <td style={styles.cell}>
                          <div style={styles.actions}>
                            {renderActionButtons(u)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Professor Users Table */}
            {users.filter(u => u.role === 'professor').length > 0 && (
              <div style={styles.tableSection}>
                <h3 style={{color: '#3498db', marginBottom: '15px'}}>👨‍🏫 Professor Users ({users.filter(u => u.role === 'professor').length})</h3>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.headerRow}>
                      <th style={styles.th}>Prof ID</th>
                      <th style={styles.th}>Username</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Created</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.role === 'professor').sort((a, b) => (a.reference_id || 0) - (b.reference_id || 0)).map((u) => (
                      <tr key={u.user_id} style={styles.row}>
                        <td style={styles.cell}><span style={styles.refIdBadge}>{u.reference_id}</span></td>
                        <td style={styles.cell}><strong>{u.username}</strong></td>
                        <td style={styles.cell}>{u.email || 'N/A'}</td>
                        <td style={styles.cell}>
                          <span style={{...styles.badge, background: u.is_active ? '#27ae60' : '#e74c3c'}}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={styles.cell}>{new Date(u.created_at).toLocaleDateString()}</td>
                        <td style={styles.cell}>
                          <div style={styles.actions}>
                            {renderActionButtons(u)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Student Users Table */}
            {users.filter(u => u.role === 'student').length > 0 && (
              <div style={styles.tableSection}>
                <h3 style={{color: '#27ae60', marginBottom: '15px'}}>👨‍🎓 Student Users ({users.filter(u => u.role === 'student').length})</h3>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.headerRow}>
                      <th style={styles.th}>Student ID</th>
                      <th style={styles.th}>Username</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Created</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.role === 'student').sort((a, b) => (a.reference_id || 0) - (b.reference_id || 0)).map((u) => (
                      <tr key={u.user_id} style={styles.row}>
                        <td style={styles.cell}><span style={styles.refIdBadge}>{u.reference_id}</span></td>
                        <td style={styles.cell}><strong>{u.username}</strong></td>
                        <td style={styles.cell}>{u.email || 'N/A'}</td>
                        <td style={styles.cell}>
                          <span style={{...styles.badge, background: u.is_active ? '#27ae60' : '#e74c3c'}}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={styles.cell}>{new Date(u.created_at).toLocaleDateString()}</td>
                        <td style={styles.cell}>
                          <div style={styles.actions}>
                            {renderActionButtons(u)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Developer Users Table */}
            {users.filter(u => u.role === 'developer').length > 0 && (
              <div style={styles.tableSection}>
                <h3 style={{color: '#f39c12', marginBottom: '15px'}}>🛠️ Developer Users ({users.filter(u => u.role === 'developer').length})</h3>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.headerRow}>
                      <th style={styles.th}>Dev ID</th>
                      <th style={styles.th}>Username</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Created</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.role === 'developer').sort((a, b) => (a.reference_id || 0) - (b.reference_id || 0)).map((u) => (
                      <tr key={u.user_id} style={styles.row}>
                        <td style={styles.cell}><span style={styles.refIdBadge}>{u.reference_id}</span></td>
                        <td style={styles.cell}><strong>{u.username}</strong></td>
                        <td style={styles.cell}>{u.email || 'N/A'}</td>
                        <td style={styles.cell}>
                          <span style={{...styles.badge, background: u.is_active ? '#27ae60' : '#e74c3c'}}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={styles.cell}>{new Date(u.created_at).toLocaleDateString()}</td>
                        <td style={styles.cell}>
                          <div style={styles.actions}>
                            {renderActionButtons(u)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const getRoleColor = (role) => {
  switch (role) {
    case 'admin':
      return '#e74c3c';
    case 'professor':
      return '#3498db';
    case 'student':
      return '#27ae60';
    default:
      return '#95a5a6';
  }
};

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    background: '#f5f5f5',
    minHeight: '100vh'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    flexWrap: 'wrap',
    gap: '10px'
  },
  headerButtons: {
    display: 'flex',
    gap: '10px'
  },
  primaryButton: {
    padding: '10px 20px',
    background: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  logoutButton: {
    padding: '10px 20px',
    background: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  errorBox: {
    background: '#fee',
    color: '#c33',
    padding: '15px',
    borderRadius: '5px',
    marginBottom: '15px',
    border: '1px solid #fcc'
  },
  error: {
    background: '#fee',
    color: '#c33',
    padding: '20px',
    borderRadius: '5px',
    textAlign: 'center'
  },
  formCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  form: {
    marginTop: '15px'
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '15px',
    marginBottom: '15px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column'
  },
  input: {
    padding: '10px',
    border: '1px solid #bdc3c7',
    borderRadius: '5px',
    fontSize: '14px'
  },
  submitButton: {
    padding: '10px 20px',
    background: '#27ae60',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    marginTop: '10px'
  },
  usersCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  tableContainer: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '15px'
  },
  headerRow: {
    background: '#34495e',
    color: 'white'
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    fontWeight: 'bold',
    borderBottom: '2px solid #34495e'
  },
  row: {
    borderBottom: '1px solid #ecf0f1'
  },
  cell: {
    padding: '12px',
    fontSize: '14px'
  },
  badge: {
    padding: '4px 8px',
    borderRadius: '3px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 'bold'
  },
  actions: {
    display: 'flex',
    gap: '5px'
  },
  actionBtn: {
    padding: '5px 10px',
    background: '#ecf0f1',
    border: '1px solid #bdc3c7',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  passwordEdit: {
    display: 'flex',
    gap: '5px'
  },
  smallInput: {
    padding: '5px',
    border: '1px solid #bdc3c7',
    borderRadius: '3px',
    fontSize: '12px',
    minWidth: '100px'
  },
  saveBtn: {
    padding: '5px 10px',
    background: '#27ae60',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  cancelBtn: {
    padding: '5px 10px',
    background: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  summarySection: {
    marginBottom: '30px',
    padding: '20px',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '15px',
    marginTop: '15px'
  },
  summaryCard: {
    padding: '15px',
    background: '#ecf0f1',
    borderRadius: '6px',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '14px'
  },
  tablesContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '25px'
  },
  tableSection: {
    padding: '20px',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  refIdBadge: {
    padding: '4px 8px',
    background: '#e8f4f8',
    border: '1px solid #3498db',
    color: '#3498db',
    borderRadius: '3px',
    fontWeight: 'bold'
  }
};

export default DeveloperPanel;
