const ChildProcess = require('child_process');
const _ = require('lodash');
const { AppContext, Logger } = require('../core');

class TransformWorker {
  constructor(config) {
    const { port = 1935, transfer_url = 'http://localhost:5333', hls = {} } = config;
    this.hls = hls;
    this.transferURL = transfer_url;
    this.rtmp = `rtmp://localhost:${port}`;
    this.processes = new Map();
    this.logger = new Logger('TransformWorker');
  }

  run() {
    AppContext.on('post-publish', this.transform.bind(this));
    AppContext.on('done-publish', this.kill.bind(this));
  }

  /**
   * Callback when a stream has just been published
   *
   * @param {string} id The RTMP session ID
   * @param {string} path The streaming path
   */
  async transform(id, path) {
    if (_.isEmpty(this.hls)) {
      return;
    }
    const re = /\/(.*)\/(.*)/;
    const [, , name] = re.exec(path) ?? [];

    const input = this.rtmp + path;
    const output = this.transferURL + '/' + name;

    const resolution = await this.detectResolution(input);
    const resolutions = this.hls.resolutions.filter(r => r.w <= resolution.w && r.h <= resolution.h);
    const argv = this.toHLSArgv(input, output, resolutions);

    this.logger.info(`RtmpSession=${id} | ffmpeg ${argv.join(' ')}`);

    const proc = ChildProcess.spawn('ffmpeg', argv, { shell: true, detached: true });

    proc.on('error', err => {
      this.logger.error(err);
    });

    proc.stdout.on('data', data => {
      this.logger.debug(data.toString('utf8'));
    });

    proc.stderr.on('data', data => {
      this.logger.debug(data.toString('utf8'));
    });

    proc.on('close', code => {
      this.logger.info(`RtmpSession=${id} | Stop transforming | Code=${code ?? 0}`);
      this.processes.delete(id);
    });

    this.processes.set(id, proc);
  }

  detectResolution(input) {
    const argv = [
      'ffprobe',
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=s=x:p=0',
      input,
    ];
    const command = argv.join(' ');
    return new Promise((resolve, reject) => {
      ChildProcess.exec(command, (error, stdout) => {
        if (error) {
          return reject(error);
        }
        const [width, height] = stdout.split('x');
        return resolve({ w: parseInt(width), h: parseInt(height) });
      });
    });
  }

  toHLSArgv(input, output, resolutions) {
    const {
      acodec = 'acc',
      vcodec = 'h264',
      threads = 0,
      preset = 'fast',
      hls_time = 2,
      hls_playlist_type = 'event',
      hls_flags = [],
      ar = 44100,
      ac = 1,
    } = this.hls;

    const argv = [];
    argv.push('-y');
    argv.push('-i', input);
    argv.push('-acodec', acodec);
    argv.push('-vcodec', vcodec);
    argv.push('-ar', ar);
    argv.push('-ac', ac);
    argv.push('-preset', preset);
    argv.push('-threads', threads);
    argv.push('-f', 'hls');
    argv.push('-hls_time', hls_time);
    argv.push('-hls_playlist_type', hls_playlist_type);

    if (!_.isEmpty(hls_flags)) {
      argv.push('-hls_flags', hls_flags.join('+'));
    }

    const streams = [];
    const filters = [];
    const maps = [];

    for (let i = 0; i < resolutions.length; i++) {
      const { h, w, ab, vb } = resolutions[i];

      maps.push('-map', '0:v:0', '-map', '0:a:0');
      filters.push(`-filter:v:${i}`, `scale=w=${w}:h=${h}`);
      streams.push(`v:${i},a:${i},name:${h}p`);

      if (_.isNumber(ab)) {
        filters.push(`-b:a:${i}`, `${ab}k`);
      } else if (_.isObject(ab)) {
        const { min, max } = ab;
        _.isNumber(min) && filters.push(`-minrate:a:${i}`, `${min}k`);
        _.isNumber(max) && filters.push(`-maxrate:a:${i}`, `${max}k`);
      }

      if (_.isNumber(vb)) {
        filters.push(`-b:v:${i}`, `${vb}k`);
      } else if (_.isObject(vb)) {
        const { min, max } = vb;
        _.isNumber(min) && filters.push(`-minrate:v:${i}`, `${min}k`);
        _.isNumber(max) && filters.push(`-maxrate:v:${i}`, `${max}k`);
      }
    }

    argv.push(...maps);
    argv.push(...filters);
    argv.push('-var_stream_map', `"${streams.join(' ')}"`);
    argv.push('-master_pl_name', 'index.m3u8');
    argv.push('-ignore_io_errors', 1);
    argv.push('-method', 'PUT', output + '/' + '%v' + '/' + 'index.m3u8');

    return argv;
  }

  /**
   * Callback when a stream has been stopped
   *
   * @param {string} id The RTMP session ID
   */
  kill(id) {
    const proc = this.processes.get(id);
    if (proc) {
      this.logger.info('RtmpSession=%s | Killing child process', id);
      proc.kill('SIGTERM');
    }
  }

  stop() {
    this.processes.forEach((proc, id) => {
      this.logger.info('RtmpSession=%s | Killing child process', id);
      proc.kill('SIGTERM');
    });
  }
}

module.exports = { TransformWorker };
