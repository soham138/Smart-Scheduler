/**
 * Admin Assistant Widget Component (React)
 * Ready-to-use component for displaying professor status
 */

import React, { useState, useEffect } from 'react';
import './AdminAssistantWidget.css';

const AdminAssistantWidget = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0 });
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [absentList, setAbsentList] = useState([]);
  const [presentList, setPresentList] = useState([]);
  const [showAbsentList, setShowAbsentList] = useState(false);
  const [showPresentList, setShowPresentList] = useState(false);

  const API_BASE = 'http://localhost:5000/api/admin';

  /**
   * Load initial data
   */
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/professors/summary`);
      if (!response.ok) throw new Error('Failed to load data');

      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Ask a question
   */
  const askQuestion = async () => {
    if (!question.trim()) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });

      if (!response.ok) throw new Error('Failed to get answer');

      const data = await response.json();
      setAnswer(data.answer);
    } catch (err) {
      setError(err.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Refresh data
   */
  const refresh = async () => {
    await loadData();
    setAnswer('');
    setQuestion('');
  };

  /**
   * Load absent professors
   */
  const loadAbsentList = async () => {
    try {
      const response = await fetch(`${API_BASE}/professors/absent`);
      if (!response.ok) throw new Error('Failed to load list');
      const data = await response.json();
      setAbsentList(data.list);
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * Load present professors
   */
  const loadPresentList = async () => {
    try {
      const response = await fetch(`${API_BASE}/professors/present`);
      if (!response.ok) throw new Error('Failed to load list');
      const data = await response.json();
      setPresentList(data.list);
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * Toggle absent list visibility
   */
  const toggleAbsentList = async () => {
    if (!showAbsentList && absentList.length === 0) {
      await loadAbsentList();
    }
    setShowAbsentList(!showAbsentList);
  };

  /**
   * Toggle present list visibility
   */
  const togglePresentList = async () => {
    if (!showPresentList && presentList.length === 0) {
      await loadPresentList();
    }
    setShowPresentList(!showPresentList);
  };

  /**
   * Handle key press (Enter to submit)
   */
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      askQuestion();
    }
  };

  // Loading State
  if (loading && stats.total === 0) {
    return (
      <div className="admin-assistant-widget">
        <div className="widget-loading">
          <span className="spinner"></span> Loading...
        </div>
      </div>
    );
  }

  // Error State
  if (error && stats.total === 0) {
    return (
      <div className="admin-assistant-widget">
        <div className="widget-error">
          <p>{error}</p>
          <button onClick={refresh}>Retry</button>
        </div>
      </div>
    );
  }

  // Data State
  return (
    <div className="admin-assistant-widget">
      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Professors</div>
          <div className="stat-value">{stats.total}</div>
        </div>

        <div className="stat-card present">
          <div className="stat-label">Present</div>
          <div className="stat-value">{stats.present}</div>
        </div>

        <div className="stat-card absent">
          <div className="stat-label">Absent</div>
          <div className="stat-value">{stats.absent}</div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="widget-error">
          <p>{error}</p>
        </div>
      )}

      {/* Question Box */}
      <div className="question-box">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask: How many professors are absent?"
        />
        <button onClick={askQuestion} disabled={loading}>
          {loading ? 'Asking...' : 'Ask'}
        </button>
      </div>

      {/* Answer Display */}
      {answer && (
        <div className="answer-box">
          <p className="answer-text">{answer}</p>
        </div>
      )}

      {/* Absent Professors List */}
      {showAbsentList && (
        <div className="list-box">
          <h4>Absent Professors</h4>
          {absentList.length > 0 ? (
            <ul>
              {absentList.map((prof) => (
                <li key={prof}>{prof}</li>
              ))}
            </ul>
          ) : (
            <p className="empty">No absent professors</p>
          )}
        </div>
      )}

      {/* Present Professors List */}
      {showPresentList && (
        <div className="list-box">
          <h4>Present Professors</h4>
          {presentList.length > 0 ? (
            <ul>
              {presentList.map((prof) => (
                <li key={prof}>{prof}</li>
              ))}
            </ul>
          ) : (
            <p className="empty">No present professors</p>
          )}
        </div>
      )}

      {/* Refresh Button */}
      <div className="widget-footer">
        <button onClick={refresh} className="btn-refresh" disabled={loading}>
          Refresh
        </button>
        <button onClick={toggleAbsentList} className="btn-secondary" disabled={loading}>
          {showAbsentList ? 'Hide' : 'Show'} Absent
        </button>
        <button onClick={togglePresentList} className="btn-secondary" disabled={loading}>
          {showPresentList ? 'Hide' : 'Show'} Present
        </button>
      </div>
    </div>
  );
};

export default AdminAssistantWidget;
