const _ = require('lodash');

const toStringToken = o => {
  if (_.isFunction(o)) {
    return o.name;
  }
  if (_.isString(o)) {
    return o;
  }
  throw new Error('Invalid provider token');
};

const isRunnable = o => {
  const prototype = Object.getPrototypeOf(o);
  return prototype.hasOwnProperty('run') && _.isFunction(o.run);
};

const isStoppable = o => {
  const prototype = Object.getPrototypeOf(o);
  return prototype.hasOwnProperty('stop') && _.isFunction(o.stop);
};

module.exports = { toStringToken, isRunnable, isStoppable };
