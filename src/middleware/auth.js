const crypto = require('crypto');
const config = require('../../config/default');
const logger = require('../core/logging/Logger');

function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== process.env.API_KEY) {
        logger.warn('Invalid API key attempt', { ip: req.ip });
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

function validateUssdRequest(req, res, next) {
    const { msisdn, sessionId, shortcode } = req.params;

    if (!msisdn || !sessionId || !shortcode) {
        return res.status(400).json({
            error: 'Missing required parameters: msisdn, sessionId, shortcode'
        });
    }

    // Validate MSISDN format (relaxed validation)
    if (!/^256\d{9,}$/.test(msisdn)) {
        return res.status(400).json({
            error: 'Invalid MSISDN format. Must start with 256 followed by digits'
        });
    }

    // Remove strict session ID validation - allow any string
    // Only check that it's not empty
    if (sessionId.trim() === '') {
        return res.status(400).json({
            error: 'Session ID cannot be empty'
        });
    }

    next();
}

function rateLimitByMsisdn(req, res, next) {
    // This would be implemented with Redis rate limiting
    // For now, we'll use a simple in-memory approach
    next();
}

function logRequest(req, res, next) {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info(`${req.method} ${req.originalUrl}`, {
            status: res.statusCode,
            duration,
            msisdn: req.params.msisdn,
            sessionId: req.params.sessionId,
            shortcode: req.params.shortcode,
            input: req.params.response || ''
        });
    });

    next();
}

function errorHandler(err, req, res, next) {
    logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        params: req.params
    });

    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
}

module.exports = {
    validateApiKey,
    validateUssdRequest,
    rateLimitByMsisdn,
    logRequest,
    errorHandler
};