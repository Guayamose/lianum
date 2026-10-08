FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
ENV NODE_ENV=production PORT=8080
WORKDIR /app/apps/platform
COPY apps/platform/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node apps/platform/src ./src
COPY --chown=node:node apps/platform/migrations ./migrations
COPY --chown=node:node packages/mobile-protocol /app/packages/mobile-protocol
USER node
EXPOSE 8080
CMD ["node", "src/run.mjs"]
