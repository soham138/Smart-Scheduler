/**
 * Ollama AI Assistant Component
 * Provides natural language interface to query the database
 * Runs locally - no internet connection required
 */

import React, { useState, useEffect, useRef } from 'react';
import './OllamaAssistant.css';

export default function OllamaAssistant() {
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOllamaReady, setIsOllamaReady] = useState(null);
  const [showSQL, setShowSQL] = useState(false);
  const conversationRef = useRef(null);

  // Check Ollama health on mount
  useEffect(() => {
    checkOllamaHealth();
  }, []);

  // Scroll to bottom when new response arrives
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [response]);

  const checkOllamaHealth = async () => {
    try {
      console.log('[OllamaAssistant] Checking health at /api/ai/health...');
      const resp = await fetch('/api/ai/health');
      const data = await resp.json();
      
      if (!resp.ok) {
        console.error('[OllamaAssistant] Health check failed:', data);
        setIsOllamaReady(false);
        
        // Better error messaging
        if (resp.status === 404) {
          setError('❌ Backend routes not registered. Restart backend with: npm start');
        } else if (resp.status === 500) {
          setError(`❌ Ollama service error: ${data.error || 'Check if Ollama is running'}`);
        } else {
          setError(`❌ Ollama not available: ${data.error}`);
        }
      } else {
        console.log('[OllamaAssistant] Health check passed:', data);
        setIsOllamaReady(true);
        setError(null);
      }
    } catch (err) {
      console.error('[OllamaAssistant] Health check failed:', err);
      setIsOllamaReady(false);
      setError('❌ Cannot connect to Ollama. Steps:\n1. Ensure backend is running (npm start)\n2. Ensure Ollama running (ollama serve)\n3. Check localhost:11434 is accessible');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }

    if (!isOllamaReady) {
      setError('Ollama service is not available. Please check the setup guide.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('Sending question:', question);

      const resp = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: question.trim() }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      if (data.success) {
        setResponse(data);
        setShowSQL(false);
      } else {
        setError(data.error || 'Failed to process question');
      }

      setQuestion('');
    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'An error occurred while processing your question');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="ollama-assistant-container">
      {/* Header */}
      <div className="assistant-header">
        <h2>🤖 Ollama AI Assistant</h2>
        <p className="subtitle">Ask questions about professors, subjects, and timetables (runs locally)</p>
      </div>

      {/* Status Indicator */}
      <div className={`status-indicator ${isOllamaReady ? 'ready' : 'notready'}`}>
        <span className={`status-dot ${isOllamaReady ? 'green' : 'red'}`}></span>
        <span className="status-text">
          {isOllamaReady === null ? 'Checking...' : isOllamaReady ? 'Ollama Ready' : 'Ollama Offline'}
        </span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
          <button className="error-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Conversation Area */}
      <div className="conversation-area" ref={conversationRef}>
        {!response && !loading && (
          <div className="welcome-message">
            <h3>How can I help?</h3>
            <p>Try asking questions like:</p>
            <ul>
              <li>"How many professors are present?"</li>
              <li>"List all active subjects"</li>
              <li>"Which professors are absent?"</li>
              <li>"Show timetable conflicts"</li>
              <li>"Get professor workload"</li>
            </ul>
          </div>
        )}

        {response && (
          <div className="response-container">
            <div className="question-display">
              <strong>Q:</strong> {response.question}
            </div>

            <div className="answer-display">
              <strong>A:</strong> {response.answer}
            </div>

            {response.sqlGenerated && (
              <div className="sql-section">
                <button 
                  className="toggle-sql-btn" 
                  onClick={() => setShowSQL(!showSQL)}
                >
                  {showSQL ? '▼' : '▶'} Generated SQL ({response.rowsReturned} rows)
                </button>
                {showSQL && (
                  <pre className="sql-code">
                    {response.sqlGenerated}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Ollama is thinking...</p>
          </div>
        )}
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="input-form">
        <div className="input-wrapper">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about the timetable system..."
            className="question-input"
            disabled={!isOllamaReady || loading}
            rows="3"
          />
          <button 
            type="submit" 
            className="submit-btn"
            disabled={!isOllamaReady || loading}
            title={!isOllamaReady ? 'Ollama is not available' : ''}
          >
            {loading ? 'Processing...' : 'Ask'}
          </button>
        </div>
      </form>

      {/* Help Section */}
      <div className="help-section">
        <p className="help-text">
          💡 <strong>Tip:</strong> Ask questions about professors, subjects, branches, timetables, and conflicts.
          The AI will generate and execute SQL queries to find answers. 
          <a href="#setup" className="help-link"> Setup Guide</a>
        </p>
      </div>
    </div>
  );
}
