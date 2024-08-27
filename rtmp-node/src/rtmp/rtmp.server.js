/**
 * @typedef {import('./rtmp.session').RtmpSessionConfig} RtmpSessionConfig
 *
 * @typedef {Object} AuthConfig
 * @prop {boolean?} play Apply auth for playing a stream - Default `false`
 * @prop {boolean?} publish Apply auth for publishing a stream - Default `false`
 *
 * @typedef {Object} RtmpServerConfig
 * @prop {number?} port RTMP server port - Default `1935`
 * @prop {AuthConfig?} auth
 * @prop {number?} chunk_size The output chunk size in byte - Default `128`
 * @prop {number?} ping Ping time in millisecond - Default `60000`
 * @prop {number?} ping_timeout Ping timeout in millisecond - Default `30000`
 * @prop {boolean?} gop Enable GOP cache for enhancing performance - Default `true`
 */
const net = require('net');
const { RtmpSession } = require('./rtmp.session');
const { AppContext, Logger } = require('../core');

class RtmpServer {
  /**
   * @param {RtmpServerConfig} config
   */
  constructor(config) {
    const { port = 1935, ssl = undefined, ...opts } = config;
    this.logger = new Logger('RtmpServer');
    this.port = port;
    this.tcp = net.createServer(socket => {
      const id = AppContext.generateSessionID();
      const session = new RtmpSession({ ...opts, id, socket });
      AppContext.putSession(id, session);
      session.run();
    });
  }

  run() {
    this.tcp
      .listen(this.port, () => {
        this.logger.info(`Listening on port ${this.port}`);
      })
      .on('error', e => {
        this.logger.error(e);
      })
      .on('close', () => {
        this.logger.info('Server is closed');
      });
  }

  stop() {
    this.tcp && this.tcp.close();
    AppContext.flushSessions();
  }
}

module.exports = { RtmpServer };
