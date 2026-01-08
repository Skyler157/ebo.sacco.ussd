const express = require('express');
const router = express.Router();
const ussdService = require('../services/UssdService');
const middleware = require('../middleware/auth');

// USSD endpoint
router.get(
  '/ussd/:msisdn/:sessionId/:shortcode/:response?',
  middleware.validateUssdRequest,
  middleware.logRequest,
  async (req, res) => {
    try {
      const { msisdn, sessionId, shortcode, response } = req.params;
      
      const ussdResponse = await ussdService.handleUssdRequest({
        msisdn,
        sessionId,
        shortcode,
        input: response || ''
      });
      
      res.set('Content-Type', 'text/plain');
      res.send(ussdResponse);
    } catch (error) {
      res.set('Content-Type', 'text/plain');
      res.send(`END An error occurred. Please try again later.`);
    }
  }
);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'EBO SACCO USSD',
    version: process.env.APP_VERSION || '1.0.0'
  });
});

// Session cleanup endpoint (protected)
router.post(
  '/sessions/cleanup',
  middleware.validateApiKey,
  async (req, res) => {
    try {
      await ussdService.cleanupExpiredSessions();
      res.json({ success: true, message: 'Session cleanup completed' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;