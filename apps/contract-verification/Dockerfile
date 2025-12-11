# syntax=docker/dockerfile:1
FROM oven/bun AS build

# TODO: switch to `gcr.io/distroless/base` before production

ENV NODE_ENV="production"

ARG PORT
ENV PORT=$PORT

WORKDIR /usr/src/app

# Copy solc binary. TODO: switch to dynamic solc version
COPY --from=ghcr.io/argotorg/solc:0.8.30-alpine /usr/local/bin/solc /usr/local/bin/solc
COPY container/index.ts index.ts

RUN bun build /usr/src/app/index.ts --compile --outfile container
EXPOSE $PORT
EXPOSE 8080

ENTRYPOINT ["/usr/src/app/container"]