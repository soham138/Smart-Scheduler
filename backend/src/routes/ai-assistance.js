/**
 * AI Assistance Routes - Ollama Integration
 * Endpoints for AI-powered question answering
 */

const express = require('express');
const router = express.Router();
const OllamaService = require('../services/OllamaService');

/**
 * POST /api/ai/ask
 * Send a natural language question to Ollama AI
 * 
 * Request Body:
 * {
 *   "question": "How many professors are absent?"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "answer": "3 professors are absent",
 *   "question": "How many professors are absent?",
 *   "sqlGenerated": "SELECT COUNT(*) FROM professors WHERE is_active = false",
 *   "rowsReturned": 1
 * }
 */
router.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || question.trim() === '') {
      return res.status(400).json({ error: 'Question is required' });
    }

    console.log('\n[API] Received question:', question);

    // Process with Ollama
    const result = await OllamaService.processQuestion(question);

    res.json(result);
  } catch (error) {
    console.error('[API Error]', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/ai/health
 * Check if Ollama AI service is available
 * 
 * Response:
 * {
 *   "status": "healthy",
 *   "ollamaUrl": "http://localhost:11434",
 *   "models": ["llama2", "mistral"],
 *   "currentModel": "llama2"
 * }
 */
router.get('/health', async (req, res) => {
  try {
    const health = await OllamaService.checkOllamaHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
