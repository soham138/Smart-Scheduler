/**
 * Ollama AI Assistant Service
 * Converts natural language questions to SQL queries using local Ollama AI
 * 
 * Setup Instructions:
 * 1. Download Ollama from https://ollama.ai
 * 2. Install and run: ollama serve
 * 3. In another terminal: ollama pull llama2 (or another model)
 * 4. This service communicates with Ollama on localhost:11434
 */

const axios = require('axios');
const pool = require('../config/db');

const OLLAMA_API_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama2';

class OllamaAIAssistant {
  /**
   * Call Ollama to generate a response from natural language
   */
  static async callOllama(prompt) {
    try {
      console.log('[Ollama] Sending prompt:', prompt);
      
      const response = await axios.post(`${OLLAMA_API_URL}/api/generate`, {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.7
      }, {
        timeout: 30000 // 30 second timeout
      });

      console.log('[Ollama] Response received');
      return response.data.response;
    } catch (error) {
      console.error('[Ollama] Error:', error.message);
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama server is not running. Please start it with `ollama serve`');
      }
      throw error;
    }
  }

  /**
   * Convert natural language question to SQL query using Ollama
   */
  static async generateSQL(question) {
    const systemPrompt = `You are a SQL query generator for a university timetable scheduling system.
The database has these tables:
- professors (professor_id, name, email, phone, department, is_active, hours_per_week, created_at, updated_at)
  * is_active = true means PRESENT/ENABLED
  * is_active = false means ABSENT/DISABLED
- subjects (subject_id, name, type, semester, weekly_lecture_count, weekly_lab_count, is_active, created_at)
- timetable (timetable_id, branch_id, class_id, professor_id, subject_id, day_of_week, time_slot_start, time_slot_end, slot_type, created_at)
- branches (branch_id, name, code)

Rules:
- Present professor = is_active = true
- Absent professor = is_active = false
- Disabled professor = absent

User question: "${question}"

Respond with ONLY a valid PostgreSQL SELECT query. No explanation, no markdown, just SQL.
If you cannot generate a query, respond with: ERROR: Cannot generate query`;

    try {
      const sqlQuery = await this.callOllama(systemPrompt);
      console.log('[Ollama] Generated SQL:', sqlQuery);
      return sqlQuery.trim();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Execute the generated SQL query and return results
   */
  static async executeSQL(sqlQuery) {
    // Security: Only allow SELECT queries
    if (!sqlQuery.trim().toUpperCase().startsWith('SELECT')) {
      throw new Error('Only SELECT queries are allowed');
    }

    // Prevent common injection patterns
    const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'EXEC', 'GRANT', 'REVOKE'];
    const upperQuery = sqlQuery.toUpperCase();
    
    for (const keyword of dangerousKeywords) {
      if (upperQuery.includes(keyword)) {
        throw new Error(`Query contains forbidden keyword: ${keyword}`);
      }
    }

    try {
      console.log('[SQL] Executing query');
      const result = await pool.query(sqlQuery);
      console.log('[SQL] Query executed successfully, rows:', result.rows.length);
      return result.rows;
    } catch (error) {
      console.error('[SQL] Execution error:', error.message);
      throw new Error(`SQL Error: ${error.message}`);
    }
  }

  /**
   * Process a user question end-to-end:
   * 1. Convert to SQL using Ollama
   * 2. Execute SQL
   * 3. Format response
   */
  static async processQuestion(userQuestion) {
    console.log('\n=== Processing Question ===');
    console.log('[Input] User question:', userQuestion);

    try {
      // Step 1: Generate SQL
      console.log('[Step 1] Converting question to SQL...');
      const sqlQuery = await this.generateSQL(userQuestion);

      if (sqlQuery.includes('ERROR:')) {
        return {
          success: false,
          answer: sqlQuery,
          question: userQuestion
        };
      }

      // Step 2: Execute SQL
      console.log('[Step 2] Executing SQL query...');
      const results = await this.executeSQL(sqlQuery);

      // Step 3: Format response
      console.log('[Step 3] Formatting response...');
      const answer = this.formatResults(results, userQuestion);

      return {
        success: true,
        answer: answer,
        question: userQuestion,
        sqlGenerated: sqlQuery,
        rowsReturned: results.length,
        rawData: results
      };
    } catch (error) {
      console.error('[Error]', error.message);
      return {
        success: false,
        answer: `Error: ${error.message}`,
        question: userQuestion,
        error: error.message
      };
    }
  }

  /**
   * Format query results into a human-readable answer
   */
  static formatResults(rows, question) {
    if (!rows || rows.length === 0) {
      return 'No data found';
    }

    const lowerQ = question.toLowerCase();

    // Count queries
    if (lowerQ.includes('how many') || lowerQ.includes('count')) {
      if (rows[0].count || rows[0].total) {
        const count = rows[0].count || rows[0].total;
        
        if (lowerQ.includes('absent')) return `${count} professors are absent`;
        if (lowerQ.includes('present')) return `${count} professors are present`;
        if (lowerQ.includes('professor')) return `${count} professors`;
        
        return `Count: ${count}`;
      }
    }

    // List queries
    if (lowerQ.includes('list') || lowerQ.includes('which') || lowerQ.includes('names')) {
      const names = rows.map(r => r.name || r.professor_name || JSON.stringify(r)).join(', ');
      
      if (lowerQ.includes('absent')) return `Absent professors: ${names}`;
      if (lowerQ.includes('present')) return `Present professors: ${names}`;
      
      return `Results: ${names}`;
    }

    // Table format for detailed queries
    if (rows.length > 1 && Object.keys(rows[0]).length > 2) {
      const headers = Object.keys(rows[0]);
      const table = rows.map(r => headers.map(h => r[h]).join(' | ')).join('\n');
      return table;
    }

    // Single row, multiple columns
    if (rows.length === 1) {
      const entries = Object.entries(rows[0])
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      return entries;
    }

    // Simple list
    return rows.map(r => JSON.stringify(r)).join('\n');
  }

  /**
   * Health check - verify Ollama is accessible
   */
  static async checkOllamaHealth() {
    try {
      console.log('[Health Check] Contacting Ollama...');
      const response = await axios.get(`${OLLAMA_API_URL}/api/tags`, {
        timeout: 5000
      });
      
      const models = response.data.models || [];
      console.log('[Health Check] ✓ Ollama is running');
      console.log('[Health Check] Available models:', models.map(m => m.name).join(', '));
      
      return {
        status: 'healthy',
        ollamaUrl: OLLAMA_API_URL,
        models: models.map(m => m.name),
        currentModel: OLLAMA_MODEL
      };
    } catch (error) {
      console.error('[Health Check] ✗ Ollama is not accessible');
      return {
        status: 'unavailable',
        error: error.message,
        ollamaUrl: OLLAMA_API_URL
      };
    }
  }
}

module.exports = OllamaAIAssistant;
