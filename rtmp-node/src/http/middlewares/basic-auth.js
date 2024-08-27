/**
 * @typedef {import('express').RequestParamHandler} RequestParamHandler
 */
const _ = require('lodash');

/**
 *
 * @param {string} username
 * @param {string} password
 * @returns {RequestParamHandler}
 */
function basic(username, password) {
  const token = Buffer.from(`${username}:${password}`).toString('base64');
  return (req, res, next) => {
    if (_.get(req, 'headers.authorization') !== token) {
      res.status(401).send({ message: 'Unauthorized' });
    } else {
      next();
    }
  };
}

module.exports = { basic };
