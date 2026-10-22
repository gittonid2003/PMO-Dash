FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --chown=node:node server/package*.json ./server/
COPY --chown=node:node server ./server
COPY --chown=node:node web ./web

USER node
RUN npm install --prefix server --omit=dev

EXPOSE 3000
CMD ["npm", "--prefix", "server", "start"]