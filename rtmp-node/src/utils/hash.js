const crypto = require('crypto');
const _ = require('lodash');

const make = (str, algo = 'sha256') => {
  return crypto.createHash(algo).update(str).digest().toString('hex');
};

const compare = (plain, hash, algo = 'sha256') => {
  if (_.isEmpty(plain) || _.isEmpty(hash)) {
    return false;
  }
  return make(plain, algo) === hash;
};

module.exports = { make, compare };
