# syntax=docker/dockerfile:1

FROM node:24.14.0-alpine AS build
WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY packages ./packages
COPY apps/perf ./apps/perf

RUN pnpm install --frozen-lockfile
RUN pnpm --filter perf build

FROM node:24.14.0-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/apps/perf/dist ./dist
COPY apps/perf/server.mjs ./server.mjs

USER node
EXPOSE 3000

CMD ["node", "server.mjs"]
