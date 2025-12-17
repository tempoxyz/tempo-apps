# syntax=docker/dockerfile:1
FROM oven/bun AS build

RUN apt-get update \
  && apt-get install --yes libz1 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV="production"

WORKDIR /usr/src/app

COPY container gg
RUN bun build \
  --compile \
  --target bun \
  --minify-syntax \
  --minify-whitespace \
  --outfile container \
  /usr/src/app/gg/index.ts

FROM gcr.io/distroless/base

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/container /usr/src/app/container
# needed for vyper compiler
COPY --from=build /usr/lib/x86_64-linux-gnu/libz.so.1 /usr/lib/x86_64-linux-gnu/libz.so.1

ENV NODE_ENV="production"

EXPOSE $PORT
EXPOSE 8080

ENTRYPOINT ["/usr/src/app/container"]