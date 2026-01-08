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
  contentSecurityPolicy: false, // Disable for USSD responses
  crossOriginEmbedderPolicy: false
}));

// Compression
app.use(compression());

// CORS
app.use(cors());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.url}`, {
      status: res.statusCode,
      duration,
      userAgent: req.get('User-Agent')
    });
  });
  next();
});

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
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`App Name: ${config.app.name}`);
  logger.info(`Version: ${config.app.version}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  
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
  logger.info('SIGINT received. Shutting down...');
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