const express = require('express');
const router = express.Router();
const ussdService = require('../services/UssdService');
const logger = require('../core/logging/Logger');
const crypto = require('crypto');
const { validateUssdRequest, validateApiKey } = require('../middleware/auth');

// USSD endpoint
router.get(
  '/ussd/:msisdn/:sessionId/:shortcode/:response?',
  validateUssdRequest,
  async (req, res) => {
    const { msisdn, sessionId, shortcode, response } = req.params;

    try {
      const ussdResponse = await ussdService.handleUssdRequest({
        msisdn,
        sessionId,
        shortcode,
        input: response || ''
      });

      res.set('Content-Type', 'text/plain');
      res.send(ussdResponse);

    } catch (error) {
      const errorResponse = `END An error occurred. Please try again later.`;
      res.set('Content-Type', 'text/plain');
      res.status(500).send(errorResponse);
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
  validateApiKey,
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
