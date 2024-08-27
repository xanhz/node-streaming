/**
 * @typedef {Object} EnvServiceOptions
 * @prop {string?} path Support .env and .json files - Default `.env`
 * @prop {string?} encoding File encoding - Default `utf8`
 */
const dotenv = require('dotenv');
const fs = require('fs');
const _ = require('lodash');

class EnvService {
  /**
   * @param {EnvServiceOptions} opts
   */
  constructor(opts = {}) {
    const { path = '.env', encoding = 'utf8' } = opts;
    if (path.endsWith('.json')) {
      const txt = fs.readFileSync(path, { encoding });
      /** @private */
      this.env = JSON.parse(txt);
    } else {
      const { parsed = {} } = dotenv.config({ path, encoding });
      /** @private */
      this.env = { ...process.env, ...parsed };
    }
  }

  get(key, $default = undefined, cast = 'string') {
    const value = _.get(this.env, key, $default);
    if (!_.isNil(value)) {
      if (cast === 'number') {
        return +value;
      }
      if (cast === 'boolean') {
        return value === 'true';
      }
    }
    return value;
  }

  getOrThrow(key) {
    const value = this.get(key);
    if (_.isNil(value)) {
      throw new Error(`Missing ${key} in env`);
    }
    return value;
  }
}

module.exports = { EnvService };
