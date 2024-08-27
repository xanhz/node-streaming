const { default: pino } = require('pino');
const { default: pretty } = require('pino-pretty');

const stream = pretty({
  colorize: process.env.NODE_ENV !== 'production',
  minimumLevel: process.env.LOG_LEVEL || 'info',
  levelFirst: false,
  translateTime: 'SYS:yyyy/mm/dd HH:MM:ss.l o',
  singleLine: true,
  ignore: 'pid,hostname',
});

const root = pino(stream);

class Logger {
  /**
   * @param {string | Record<string, any>} ctx
   */
  constructor(ctx) {
    if (typeof ctx === 'string') {
      ctx = { name: ctx };
    }
    this.instance = root.child(ctx);
  }

  info(...args) {
    return this.instance.info(...args);
  }

  error(...args) {
    return this.instance.error(...args);
  }

  debug(...args) {
    return this.instance.debug(...args);
  }

  warn(...args) {
    return this.instance.warn(...args);
  }
}

module.exports = { Logger };
