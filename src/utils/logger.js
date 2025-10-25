/**
 * Logging utility with JSON structured logging support
 * Provides consistent logging across the application with optional JSON format
 */

const config = require('../config');
const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

class Logger {
  constructor() {
    this.enabled = config.logging.enabled;
    this.level = LOG_LEVELS[config.logging.level] || LOG_LEVELS.info;
    this.format = process.env.LOG_FORMAT || 'text'; // 'text' or 'json'
    this.logToFile = process.env.LOG_TO_FILE === 'true';
    this.logDir = process.env.LOG_DIR || './logs';
    this.maxLogSize = parseInt(process.env.MAX_LOG_SIZE_MB || '100', 10) * 1024 * 1024; // Default 100MB

    // Create log directory if logging to file
    if (this.logToFile) {
      this._ensureLogDir();
    }
  }

  _ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  _getLogFilePath() {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `ratings-wrapper-${date}.log`);
  }

  _rotateLogIfNeeded() {
    if (!this.logToFile) return;

    try {
      const logFile = this._getLogFilePath();

      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);

        // Rotate if file exceeds max size
        if (stats.size >= this.maxLogSize) {
          const timestamp = new Date().toISOString().replace(/:/g, '-');
          const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);
          fs.renameSync(logFile, rotatedFile);
        }
      }
    } catch (error) {
      // Fail silently - don't let log rotation break the app
      console.error('Log rotation error:', error.message);
    }
  }

  _writeToFile(message) {
    if (!this.logToFile) return;

    try {
      this._rotateLogIfNeeded();
      const logFile = this._getLogFilePath();
      fs.appendFileSync(logFile, message + '\n', 'utf8');
    } catch (error) {
      // Fail silently
      console.error('File write error:', error.message);
    }
  }

  _log(level, ...args) {
    if (!this.enabled || LOG_LEVELS[level] < this.level) {
      return;
    }

    const timestamp = new Date().toISOString();

    // Handle JSON format for structured logging
    if (this.format === 'json') {
      // If first arg is already a JSON string (from requestLogger), use it directly
      if (args.length === 1 && typeof args[0] === 'string' && args[0].startsWith('{')) {
        const logObj = JSON.parse(args[0]);
        logObj.level = level;
        const message = JSON.stringify(logObj);
        console.log(message);
        this._writeToFile(message);
      } else {
        // Otherwise, create JSON structure
        const logObj = {
          ts: timestamp,
          level,
          message: args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ')
        };
        const message = JSON.stringify(logObj);
        console.log(message);
        this._writeToFile(message);
      }
    } else {
      // Text format (default)
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      const message = `${prefix} ${args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ')}`;
      console[level === 'error' ? 'error' : 'log'](message);
      this._writeToFile(message);
    }
  }

  debug(...args) {
    this._log('debug', ...args);
  }

  info(...args) {
    this._log('info', ...args);
  }

  warn(...args) {
    this._log('warn', ...args);
  }

  error(...args) {
    this._log('error', ...args);
  }
}

module.exports = new Logger();
