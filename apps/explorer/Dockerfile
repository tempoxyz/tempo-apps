# syntax=docker/dockerfile:1
FROM node:24.14.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@10.33.0
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN CLOUDFLARE_ENV=zone-prover VITE_TEMPO_ENV=zone-prover pnpm --filter explorer build
RUN pnpm --filter explorer-zone-prover-runtime deploy --legacy --prod --ignore-scripts --frozen-lockfile /runtime

FROM node:24.14.0-bookworm-slim
ENV NODE_ENV=production PORT=8080 EXPLORER_DIST=/app/dist
WORKDIR /app
COPY --from=build /runtime/ ./
COPY --from=build /app/apps/explorer/dist/ ./dist/
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
