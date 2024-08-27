/**
 * @typedef {import('express').RequestHandler} RequestHandler
 * @typedef {Object} LoggingOptions
 * @prop {Array<string | RegExp>?} exclude
 */
const crypto = require('crypto');
const _ = require('lodash');
const { Logger } = require('../../core');
const { HttpStatus } = require('../constants');

const logger = new Logger('RequestLogger');

/**
 * @param {LoggingOptions} options
 * @returns {RequestHandler}
 */
const logging = (options = {}) => {
  const { exclude = [] } = options;

  return (req, res, next) => {
    const { method, url, body } = req;
    const reqID = crypto.randomUUID();
    const start = Date.now();

    const isDisabled = exclude.some(pattern => {
      if (_.isString(pattern)) {
        return pattern === url;
      }
      return pattern.test(url);
    });

    if (isDisabled) {
      return next();
    }

    let msgFormat = '%s %s';
    let meta = [method, url];

    if (!_.isEmpty(body)) {
      msgFormat += ' - %j - %s';
      meta = [...meta, body, reqID];
    } else {
      msgFormat += ' - %s';
      meta = [...meta, reqID];
    }

    logger.info(msgFormat, ...meta);

    res.on('finish', () => {
      const { statusCode } = res;

      const end = Date.now();
      const duration = end - start;

      const msg = `${method} ${url} - ${statusCode} - ${duration} ms - ${reqID}`;

      if (statusCode < HttpStatus.BadRequest) {
        logger.info(msg);
      } else {
        logger.error(msg);
      }
    });

    next();
  };
};

module.exports = { logging };
