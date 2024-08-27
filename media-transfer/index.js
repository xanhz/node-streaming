const { MediaTransferServer } = require('./src');

const env = (key, $default = undefined, cast = 'string') => {
  let value = process.env[key] ?? $default;
  if (value) {
    if (cast === 'number') {
      return +value;
    }
    if (cast === 'boolean') {
      return value === 'true' ? true : false;
    }
  }
  return value;
};

const port = env('PORT', 5333, 'number');

const server = new MediaTransferServer({
  bucket: env('MINIO_BUCKET', 'live'),
  minio: {
    endPoint: env('MINIO_ENDPOINT', 'localhost'),
    port: env('MINIO_PORT', 9000, 'number'),
    accessKey: env('MINIO_ACCESS_KEY', 'XZAzxHj32Avsomx678VD'),
    secretKey: env('MINIO_SECRET_KEY', 'ck74Muz316ZYgbv4smYza47UuIwQTnTPMyU6MTLI'),
    useSSL: env('MINIO_SSL', false, 'boolean'),
  },
});

server.listen(port);
