const { MediaApplication } = require('./src/core');
const { HttpServer } = require('./src/http');
const { RtmpServer } = require('./src/rtmp');
const { TransformWorker } = require('./src/workers');
const { EnvService, PrismaService } = require('./src/services');

const app = new MediaApplication();

app.register([
  {
    provide: EnvService,
    useValue: new EnvService({
      path: process.env.NODE_ENV === 'production' ? '.env' : 'dev.env',
    }),
  },
  {
    provide: PrismaService,
    inject: [EnvService],
    useFactory: env => {
      const url = env.get('DATABASE_URL', 'postgresql://localhost:5432/media?schema=public');
      return new PrismaService(url);
    },
  },
  {
    provide: RtmpServer,
    inject: [EnvService],
    useFactory: env => {
      return new RtmpServer({
        port: env.get('RTMP_PORT', 1935, 'number'),
        gop: env.get('RTMP_GOP', 'true', 'boolean'),
        ping: env.get('RTMP_PING', 60000, 'number'),
        ping_timeout: env.get('RTMP_PING_TIMEOUT', 30000, 'number'),
        chunk_size: env.get('RTMP_CHUNK_SIZE', 128, 'number'),
        auth: {
          play: env.get('RTMP_AUTH_PLAY', 'false', 'boolean'),
          publish: env.get('RTMP_AUTH_PUBLISH', 'false', 'boolean'),
        },
      });
    },
  },
  {
    provide: HttpServer,
    inject: [EnvService],
    useFactory: env => {
      return new HttpServer({
        port: env.get('HTTP_PORT', 8000, 'number'),
      });
    },
  },
  {
    provide: TransformWorker,
    inject: [EnvService],
    useFactory: env => {
      return new TransformWorker({
        port: env.get('RTMP_PORT', 1935, 'number'),
        transfer_url: env.get('MEDIA_TRANSFER_URL', 'http://localhost:5333'),
        hls: {
          vcodec: 'h264',
          acodec: 'aac',
          ac: 2,
          ar: 44100,
          preset: 'medium',
          hls_time: 8,
          hls_playlist_type: 'event',
          resolutions: [
            {
              w: 640,
              h: 480,
              vb: {
                max: 2000,
              },
              ab: 96,
            },
            {
              w: 1280,
              h: 720,
              vb: {
                max: 4000,
              },
              ab: 128,
            },
            {
              w: 1920,
              h: 1080,
              vb: {
                max: 6000,
              },
              ab: 128,
            },
            {
              w: 2048,
              h: 1440,
              vb: {
                max: 10000,
              },
              ab: 128,
            },
          ],
        },
      });
    },
  },
]);

app.on('pre-connect', (id, args) => {
  app.logger.info('[PreConnect]: SessionID=%s | Args=%o', id, args);
});

app.on('post-connect', (id, args) => {
  app.logger.info('[PostConnect]: SessionID=%s | Args=%o', id, args);
});

app.on('done-connect', (id, args) => {
  app.logger.info('[DoneConnect]: SessionID=%s | Args=%o', id, args);
});

app.on('pre-publish', (id, path, args) => {
  app.logger.info('[PrePublish]: SessionID=%s | Path=%s | Args=%o', id, path, args);
});

app.on('post-publish', (id, path, args) => {
  app.logger.info('[PostPublish]: SessionID=%s | Path=%s | Args=%o', id, path, args);
});

app.on('done-publish', (id, path, args) => {
  app.logger.info('[DonePublish]: SessionID=%s | Path=%s | Args=%o', id, path, args);
});

app.on('pre-play', (id, path, args) => {
  app.logger.info('[PrePlay]: SessionID=%s | Path=%s | Args=%o', id, path, args);
});

app.on('post-play', (id, path, args) => {
  app.logger.info('[PostPlay]: SessionID=%s | Path=%s | Args=%o', id, path, args);
});

app.on('done-play', (id, path, args) => {
  app.logger.info('[DonePlay]: SessionID=%s | Path=%s | Args=%o', id, path, args);
});

process.on('uncaughtException', error => {
  app.logger.error(error);
});

process.on('unhandledRejection', error => {
  app.logger.error(error);
});

process.on('SIGTERM', () => {
  app
    .stop()
    .then(() => process.exit(0))
    .catch(error => {
      app.logger.error(error);
      process.exit(1);
    });
});

process.on('SIGINT', () => {
  app
    .stop()
    .then(() => process.exit(0))
    .catch(error => {
      app.logger.error(error);
      process.exit(1);
    });
});

app.run();
