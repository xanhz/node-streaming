const EventEmitter = require('events');
const { toStringToken } = require('./utils');

class Context extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.publishers = new Map();
    this.providers = new Map();
    this.stats = {
      inbytes: 0,
      outbytes: 0,
      accepted: 0,
    };
  }

  get(key) {
    return this.providers.get(toStringToken(key));
  }

  flushSessions() {
    this.sessions.forEach(session => session.stop());
  }

  putSession(sessionID, session) {
    this.sessions.set(sessionID, session);
  }

  getSession(sessionID) {
    return this.sessions.get(sessionID);
  }

  removeSession(sessionID) {
    return this.sessions.delete(sessionID);
  }

  hasPublisher(path) {
    return this.publishers.has(path);
  }

  putPublisher(path, id) {
    this.publishers.set(path, id);
  }

  getPublisherID(path) {
    return this.publishers.get(path);
  }

  removePublisher(path) {
    return this.publishers.delete(path);
  }

  generateSessionID(length = 15) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWKYZ0123456789';
    let sessionID;
    do {
      sessionID = '';
      for (let i = 0; i < length; i++) {
        sessionID += chars.charAt((Math.random() * chars.length) | 0);
      }
    } while (this.sessions.has(sessionID));
    return sessionID;
  }
}

const AppContext = new Context();

module.exports = { AppContext };
