/**
 * Simple logging utility
 * Provides consistent logging across the application
 */

const config = require('../config');

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
  }

  _log(level, ...args) {
    if (!this.enabled || LOG_LEVELS[level] < this.level) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    console[level === 'error' ? 'error' : 'log'](prefix, ...args);
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
