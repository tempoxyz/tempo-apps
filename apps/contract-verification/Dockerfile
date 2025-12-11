# syntax=docker/dockerfile:1
FROM oven/bun AS build

ENV NODE_ENV="production"

WORKDIR /usr/src/app

# Copy solc binary. TODO: switch to dynamic solc version
COPY --from=ghcr.io/argotorg/solc:0.8.30-alpine /usr/local/bin/solc /usr/local/bin/solc
COPY container/index.ts index.ts

RUN bun build /usr/src/app/index.ts --compile --outfile container

FROM gcr.io/distroless/base

ARG PORT
ENV PORT=$PORT

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/container container

EXPOSE $PORT
EXPOSE 8080

ENTRYPOINT ["container"]