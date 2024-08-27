/**
 * @typedef {Object} HttpServerConfig
 * @prop {number?} port HTTP port - Default `80`
 */
const cors = require('cors');
const express = require('express');
const $http = require('http');
const path = require('path');
const { logging } = require('./middlewares');
const { AppContext, Logger } = require('../core');
const { ServerRouter, StreamRouter } = require('./routers');

const PublicFolder = path.join(process.cwd(), 'public');
const AdminIndexFile = path.join(PublicFolder, 'admin', 'index.html');

class HttpServer {
  /**
   * @param {HttpServerConfig} config
   */
  constructor(config) {
    const { port = 8000 } = config;
    this.port = port;
    const app = express();

    const middlewares = [
      cors(),
      express.json({ limit: '2mb' }),
      express.urlencoded({ extended: true }),
      logging({ exclude: [/^\/heartbeat/, /^\/health/] }),
      express.static(PublicFolder),
    ];
    app.use(...middlewares);

    app.get('/admin/*', (_, res) => res.sendFile(AdminIndexFile));
    app.use('/api/streams', StreamRouter);
    app.use('/api/server', ServerRouter);

    this.http = $http.createServer(app);

    this.logger = new Logger(HttpServer.name);
  }

  run() {
    this.http
      .listen(this.port, () => {
        this.logger.info(`HTTP server is listening on port ${this.port}`);
      })
      .on('error', e => {
        this.logger.error(e);
      })
      .on('close', () => {
        this.logger.info('Server is closed');
      });

    AppContext.on('post-play', () => {
      AppContext.stats.accepted++;
    });

    AppContext.on('post-publish', () => {
      AppContext.stats.accepted++;
    });

    AppContext.on('done-connect', id => {
      const session = AppContext.getSession(id);
      AppContext.stats.inbytes += session.socket.bytesRead;
      AppContext.stats.outbytes += session.socket.bytesWritten;
    });
  }

  stop() {
    this.http && this.http.close();
  }
}

module.exports = { HttpServer };
