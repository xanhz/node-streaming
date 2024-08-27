FROM node:lts-alpine

WORKDIR /app

COPY . .

RUN yarn install --frozen-lockfile --production=true

ENV NODE_ENV=production

EXPOSE 5333

CMD [ "node", "index.js" ]
