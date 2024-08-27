FROM node:lts-alpine

RUN apk update && \
    apk upgrade && \
    apk add --no-cache ffmpeg

WORKDIR /app

COPY . .

RUN yarn install --frozen-lockfile --production=true
RUN yarn prisma generate

ENV NODE_ENV=production

EXPOSE 1935 8000

CMD ["node", "index.js"]
