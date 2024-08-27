/**
 * @typedef {Object} FileTransferApplicationOptions
 * @prop {minio.ClientOptions} minio
 * @prop {string} bucket
 */
const crypto = require('crypto');
const http = require('http');
const minio = require('minio');
const { PassThrough } = require('stream');
const { Logger } = require('./logger');

/**
 * @param {string} key
 */
const mimetype = key => {
  if (key.endsWith('.m3u8')) {
    return 'application/vnd.apple.mpegurl';
  }
  if (key.endsWith('.ts')) {
    return 'video/mp2t';
  }
  throw new Error(`Unrecognized mimetype of key ${key}`);
};

class MediaTransferServer {
  /**
   * @param {FileTransferApplicationOptions} opts
   */
  constructor(opts) {
    this.bucket = opts.bucket;
    this.client = new minio.Client(opts.minio);
    this.logger = new Logger('MediaTransferServer');
    this.server = http.createServer(async (req, res) => {
      const reqID = crypto.randomUUID();

      const json = (data, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'X-Request-ID': reqID });
        res.write(JSON.stringify(data));
        res.end();
      };

      const { method, url } = req;

      if (method !== 'PUT') {
        return json({ message: 'Not Found' }, 404);
      }

      try {
        const key = url.slice(1);
        const pass = new PassThrough();
        req.pipe(pass);
        this.logger.info('ReqID=%s | Putting object key=%s', reqID, key);
        const info = await this.client.putObject(this.bucket, key, pass, { ContentType: mimetype(key) });
        this.logger.info('ReqID=%s | Put object key=%s | Info=%o', reqID, key, info);
        return json(info);
      } catch (error) {
        this.logger.error(error);
        return json(error, 500);
      }
    });
  }

  listen(port) {
    process.on('uncaughtException', error => {
      this.logger.error(error);
    });

    process.on('unhandledRejection', error => {
      this.logger.error(error);
    });

    process.on('SIGTERM', () => {
      this.logger.info('Got SIGTERM. Shutting down application...');
      this.server.close(error => {
        this.logger.info('Server is closed');
        process.exit(error ? 1 : 0);
      });
    });

    process.on('SIGINT', () => {
      this.logger.info('Got SIGINT. Shutting down application...');
      this.server.close(error => {
        this.logger.info('Server is closed');
        process.exit(error ? 1 : 0);
      });
    });

    this.server.listen(port, () => {
      this.logger.info('Listening on port %d', port);
    });
  }
}

module.exports = { MediaTransferServer };
