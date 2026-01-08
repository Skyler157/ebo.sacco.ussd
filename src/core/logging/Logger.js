const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../../../config/default');

class Logger {
  constructor() {
    this.logDir = path.join(process.cwd(), config.logging.directory);
    this.ensureLogDirectory();
    this.initializeLogger();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getLogFilePath(msisdn = null) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    const dateDir = path.join(this.logDir, String(year), month, day);
    
    if (!fs.existsSync(dateDir)) {
      fs.mkdirSync(dateDir, { recursive: true });
    }
    
    if (msisdn) {
      return path.join(dateDir, `${msisdn}.log`);
    }
    
    return path.join(dateDir, 'system.log');
  }

  initializeLogger() {
    const transports = [
      new winston.transports.Console({
        level: 'debug',
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({
            format: () => {
              const now = new Date();
              const year = now.getFullYear();
              const month = String(now.getMonth() + 1).padStart(2, '0');
              const day = String(now.getDate()).padStart(2, '0');
              const hours = String(now.getHours()).padStart(2, '0');
              const minutes = String(now.getMinutes()).padStart(2, '0');
              const seconds = String(now.getSeconds()).padStart(2, '0');
              return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            }
          }),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} [${level}]: ${message} ${
              Object.keys(meta).length ? JSON.stringify(meta) : ''
            }`;
          })
        )
      })
    ];

    if (config.logging.format === 'json') {
      transports.push(
        new winston.transports.File({
          filename: this.getLogFilePath(),
          level: config.logging.level,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
          maxsize: 5242880, // 5MB
          maxFiles: 10,
          tailable: true
        })
      );
    }

    this.logger = winston.createLogger({
      levels: winston.config.syslog.levels,
      transports,
      exitOnError: false
    });
  }

  createSessionLogger(msisdn) {
    return winston.createLogger({
      transports: [
        new winston.transports.File({
          filename: this.getLogFilePath(msisdn),
          level: 'info',
          format: winston.format.combine(
            winston.format.timestamp({
              format: () => {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
              }
            }),
            winston.format.printf(({ timestamp, level, message }) => {
              return `[${timestamp}] - ${message}`;
            })
          )
        })
      ]
    });
  }

  logSession(msisdn, message, meta = {}) {
    const sessionLogger = this.createSessionLogger(msisdn);
    sessionLogger.info(message, meta);

    // Also log to system log
    this.logger.info(`[${msisdn}] ${message}`, meta);
  }



  logUssdRequest(msisdn, sessionId, shortcode, input) {
    const logMessage = `USSD REQUEST: msisdn=${msisdn}, session=${sessionId}, shortcode=${shortcode}, input="${input}"`;
    this.logSession(msisdn, logMessage);
  }

  logUssdResponse(msisdn, responseType, message, size) {
    // Convert multi-line menu to single line for cleaner logs
    const singleLineMessage = message.replace(/\n/g, ' | ').replace(/\s+/g, ' ').trim();
    const logMessage = `USSD RESPONSE [${responseType}]: ${singleLineMessage}`;
    this.logSession(msisdn, logMessage);

    if (size) {
      this.logSession(msisdn, `MENU SIZE: ${size} bytes`);
    }
  }

  logApiRequest(msisdn, serviceType, payload) {
    const safePayload = { ...payload };
    
    // Mask sensitive data
    if (safePayload.ENCRYPTEDFIELDS) {
      safePayload.ENCRYPTEDFIELDS = { ...safePayload.ENCRYPTEDFIELDS };
      if (safePayload.ENCRYPTEDFIELDS.PIN) {
        safePayload.ENCRYPTEDFIELDS.PIN = '[ENCRYPTED]';
      }
    }
    
    this.logSession(msisdn, `REQUEST [${serviceType.toUpperCase()}]: ${JSON.stringify(safePayload)}`);
  }

  logApiResponse(msisdn, serviceType, response) {
    this.logSession(msisdn, `RESPONSE [${serviceType.toUpperCase()}]: ${JSON.stringify(response)}`);
  }

  logSessionTiming(msisdn, startTime, endTime = null) {
    const elapsed = endTime ? Math.round((endTime - startTime) / 1000) : Math.round((Date.now() - startTime) / 1000);
    this.logSession(msisdn, `SESSION TIME ELAPSED: ${elapsed} seconds`);
  }

  logMethodCall(msisdn, method, params) {
    const paramStr = Object.entries(params || {})
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
    this.logSession(msisdn, `${method}: ${paramStr}`);
  }

  logError(msisdn, error, context = {}) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    
    this.logSession(msisdn, `ERROR: ${errorMessage}`, { context, stack });
    this.logger.error(`[${msisdn}] ${errorMessage}`, { context, stack });
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }
}

module.exports = new Logger();
