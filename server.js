require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const config = require('./config/default');

const ussdRoutes = require('./src/routes/ussd');
const logger = require('./src/core/logging/Logger');

const app = express();
const PORT = process.env.PORT || 6060;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, 
  crossOriginEmbedderPolicy: false
}));

// Compression
app.use(compression());

// CORS
app.use(cors());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', ussdRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'EBO SACCO USSD Gateway',
    version: config.app.version,
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled application error:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl
  });
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: config.app.environment === 'development' ? err.message : undefined
  });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`EBO SACCO USSD Server started on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection:', { reason, promise });
});

module.exports = app;