const crypto = require('crypto');

const name = (length = 10) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWKYZ0123456789';
  let name = '';
  for (let i = 0; i < length; i++) {
    name += chars.charAt((Math.random() * chars.length) | 0);
  }
  return name;
};

const token = (length = 28) => {
  return crypto.randomBytes(length >> 1).toString('hex');
};

module.exports = { name, token };
