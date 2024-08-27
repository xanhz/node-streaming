# Media Transfer

- A middleware server for ffmpeg to put manifests to Minio Storage.
- This server should run locally with rtmp-node.

# 1. Quick start

```bash
# Install dependencies
yarn install

# Start project
node index.js
```

# 2. Usage

## 2.1. Environment Variables

- `MINIO_BUCKET`: Bucket where manifests are stored in - Default `live`
- `MINIO_ENDPOINT`: Minio host - Default `localhost`
- `MINIO_ACCESS_KEY`: Access key
- `MINIO_SECRET_KEY`: Secret key
- `MINIO_SSL`: Enable ssl (should be true if endpoint is not local) - Default `false`

## 2.2. API

```
PUT http://localhost:5333/<minio-key>
Body <binary>
```

## 2.2 Docker

```bash
# Build image
docker build -t media-transfer:latest .

# Run image
docker run \
    -e MINIO_BUCKET=live \
    -e MINIO_ENDPOINT=localhost \
    -e MINIO_ACCESS_KEY=accesskey \
    -e MINIO_SECRET_KEY=secretkey \
    -e MINIO_SSL=false \
    -p 5333:5333 \
    media-transfer
```
