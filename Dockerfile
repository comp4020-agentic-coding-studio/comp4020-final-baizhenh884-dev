# syntax = docker/dockerfile:1

# The image Fly builds and runs: install, build, then keep only the built
# server, its production dependencies and the migrations. It serves HTTP on
# 0.0.0.0:$PORT (fly.toml sets PORT=8080) and publishes README.md at /readme/.

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS base

WORKDIR /app
ENV NODE_ENV=production

ARG PNPM_VERSION=11.9.0
RUN npm install -g pnpm@$PNPM_VERSION

# --- build stage: install everything, build, then prune to prod deps -------
FROM base AS build

# toolchain for better-sqlite3, in case no prebuilt binary matches the platform
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY . .
RUN pnpm run build
RUN pnpm prune --prod

# --- runtime stage -----------------------------------------------------------
FROM base

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
# the committed migrations, applied when the app opens the database
COPY --from=build /app/drizzle /app/drizzle

# The database lives on the Fly volume. /data is deliberately not created here:
# without the volume mounted, the app refuses to start rather than writing to
# the container's own disk. Runs as root, so the root-owned volume is writable.
ENV DATABASE_PATH=/data/theseus.db
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
CMD ["node", "./dist/server/entry.mjs"]
