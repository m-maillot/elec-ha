# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22-alpine

# ---------- base : manifestes du monorepo ----------
FROM ${NODE_IMAGE} AS base
# Outils de compilation : repli node-gyp pour better-sqlite3 si le binaire précompilé musl est indisponible
RUN apk add --no-cache python3 make g++ && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# ---------- build : toutes les dépendances + compilation ----------
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---------- deps : dépendances de production uniquement ----------
FROM base AS deps
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    TZ=Europe/Paris \
    DATA_DIR=/data \
    WEB_DIST_DIR=/app/apps/web/dist
RUN apk add --no-cache tzdata && mkdir -p /data && chown node:node /data
WORKDIR /app
COPY --from=deps --chown=node:node /app/package.json ./
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/packages/core/package.json ./packages/core/
COPY --from=deps --chown=node:node /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps --chown=node:node /app/apps/api/package.json ./apps/api/
COPY --from=deps --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/packages/core/dist ./packages/core/dist
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "apps/api/dist/server.js"]
