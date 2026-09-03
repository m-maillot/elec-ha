# syntax=docker/dockerfile:1.7
# ---------- build ----------
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# Dépendances de prod seulement pour l'API (et core, dépendance workspace)
RUN pnpm --filter @elec-ha/api --prod deploy --legacy /out/api

# ---------- runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    TZ=Europe/Paris \
    DATA_DIR=/data \
    WEB_DIST_DIR=/app/web
RUN apk add --no-cache tzdata && mkdir -p /data && chown node:node /data
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
COPY --from=build --chown=node:node /app/apps/web/dist ./web
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "dist/server.js"]
