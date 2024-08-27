/**
 * @typedef {import('express').RequestHandler} RequestHandler
 */
const _ = require('lodash');
const { AppContext } = require('../../core');
const { NotFoundError } = require('../errors');
const { PrismaService, EnvService } = require('../../services');
const { Hash, Random } = require('../../utils');

const createStream = async (req, res) => {
  const prisma = AppContext.get(PrismaService);
  const env = AppContext.get(EnvService);

  const name = Random.name();
  const token = Random.token();
  const title = req.body.title || `Stream ${name}`;
  const minioURL = env.get('MINIO_URL', 'http://localhost:9001/live');
  const serverURL = env.get('RTMP_URL', 'rtmp://localhost:1935/live');

  await prisma.stream.create({
    data: {
      title,
      name,
      server_url: serverURL,
      manifest_url: `${minioURL}/${name}/index.m3u8`,
      token: Hash.make(token),
    },
  });

  return { server_url: serverURL, name, token };
};

const getStreams = (req, res) => {
  const stats = {};
  const re = /\/(.*)\/(.*)/gi;

  for (const session of AppContext.sessions.values()) {
    if (!session.isStarting) {
      continue;
    }

    let regRes = re.exec(session.publish.streamPath || session.play.streamPath);

    if (regRes === null) {
      continue;
    }

    let [app, stream] = _.slice(regRes, 1);

    if (!_.get(stats, [app, stream])) {
      _.setWith(
        stats,
        [app, stream],
        {
          publisher: null,
          subscribers: [],
        },
        Object
      );
    }

    switch (true) {
      case session.isPublishing: {
        _.setWith(
          stats,
          [app, stream, 'publisher'],
          {
            app: app,
            stream: stream,
            clientId: session.id,
            connectCreated: session.connectTime,
            bytes: session.socket.bytesRead,
            ip: session.socket.remoteAddress,
            audio:
              session.audio.codec > 0
                ? {
                    codec: session.audio.codec,
                    profile: session.audio.profileName,
                    samplerate: session.audio.samplerate,
                    channels: session.audio.channels,
                  }
                : null,
            video:
              session.video.codec > 0
                ? {
                    codec: session.video.codecName,
                    width: session.video.width,
                    height: session.video.height,
                    profile: session.video.profileName,
                    level: session.video.level,
                    fps: session.video.fps,
                  }
                : null,
          },
          Object
        );
        break;
      }
      case !!session.playStreamPath: {
        stats[app][stream]['subscribers'].push({
          app: app,
          stream: stream,
          clientId: session.id,
          connectCreated: session.connectTime,
          bytes: session.socket.bytesWritten,
          ip: session.socket.remoteAddress,
          protocol: 'rtmp',
        });
        break;
      }
    }
  }

  return stats;
};

const getStream = (req, res) => {
  const path = `/${req.params.app}/${req.params.stream}`;
  const rtmpSessionID = AppContext.getPublisherID(path);
  const session = AppContext.getSession(rtmpSessionID);

  if (_.isNil(session)) {
    throw new NotFoundError('Stream not found');
  }

  const stats = {
    viewers: 0,
    duration: session.duration / 1000,
    bitrate: session.bitrate,
    startTime: session.connectTime,
    arguments: session.publish.args,
  };

  stats.viewers = _.filter([...AppContext.sessions.values()], session => session.play.streamPath === path).length;
  stats.duration = session.duration / 1000;
  stats.bitrate = session.bitrate;
  stats.startTime = session.connectTime;
  stats.arguments = session.publish.args;

  return stats;
};

const deleteStream = (req, res) => {
  const path = `/${req.params.app}/${req.params.stream}`;
  const rtmpSessionID = AppContext.getPublisherID(path);
  const session = AppContext.getSession(rtmpSessionID);
  if (_.isNil(session)) {
    throw new NotFoundError('Stream not found');
  }
  session.stop();
  return;
};

module.exports = {
  createStream,
  getStream,
  getStreams,
  deleteStream,
};
