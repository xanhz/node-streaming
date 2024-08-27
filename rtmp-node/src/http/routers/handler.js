/**
 * @typedef {import('express').RequestHandler} RequestHandler
 */
const { HttpStatus } = require('../constants');
const { HttpError } = require('../errors');
const { Logger } = require('../../core');

const logger = new Logger('RequestHandler');

/**
 * @param {(...args: any[]) => Promise<any>} fn
 * @returns {RequestHandler}
 */
function Handler(fn) {
  return async (req, res, next) => {
    try {
      const response = await fn(req, res, next);
      if (req.method === 'DELETE') {
        res.status(HttpStatus.NoContent).send();
      } else if (req.method === 'POST') {
        res.status(HttpStatus.Created).json(response);
      } else {
        res.status(HttpStatus.OK).json(response);
      }
    } catch (error) {
      logger.error(error);
      error = HttpError.from(error);
      res.status(error.code).json(error.toJSON());
    }
  };
}

module.exports = { Handler };
