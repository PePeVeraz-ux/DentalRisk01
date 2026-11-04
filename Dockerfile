FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY apps ./apps
COPY database ./database
COPY scripts ./scripts
COPY tests ./tests
COPY tsconfig.json ./
RUN npm run build

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM postgres:17-bookworm AS backup
WORKDIR /app
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=production-dependencies /app /app
ENV NODE_ENV=production
USER postgres
CMD ["node","--import","tsx","scripts/backup-worker.ts"]

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=production-dependencies /app /app
USER node
EXPOSE 3000
CMD ["node","--import","tsx","scripts/serve.ts"]
