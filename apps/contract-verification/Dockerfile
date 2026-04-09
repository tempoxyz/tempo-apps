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

# Pull x86_64 libs for cross-arch QEMU execution of amd64 solc/vyper compilers
FROM --platform=linux/amd64 debian:trixie-slim AS amd64-libs
RUN apt-get update && apt-get install -y --no-install-recommends zlib1g && rm -rf /var/lib/apt/lists/*

FROM gcr.io/distroless/base

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/container /usr/src/app/container
# x86_64 dynamic linker + libc + libz for amd64 solc/vyper on arm64 hosts via QEMU
COPY --from=amd64-libs /lib64/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2
COPY --from=amd64-libs /lib/x86_64-linux-gnu/libc.so.6 /lib/x86_64-linux-gnu/libc.so.6
COPY --from=amd64-libs /lib/x86_64-linux-gnu/libm.so.6 /lib/x86_64-linux-gnu/libm.so.6
COPY --from=amd64-libs /lib/x86_64-linux-gnu/libz.so.1 /lib/x86_64-linux-gnu/libz.so.1
COPY --from=amd64-libs /lib/x86_64-linux-gnu/libdl.so.2 /lib/x86_64-linux-gnu/libdl.so.2
COPY --from=amd64-libs /lib/x86_64-linux-gnu/libpthread.so.0 /lib/x86_64-linux-gnu/libpthread.so.0
# native-arch libz for any native binaries that need it
COPY --from=build /usr/lib/*-linux-gnu/libz.so.1 /usr/local/lib/

ENV NODE_ENV="production"
ENV LD_LIBRARY_PATH="/usr/local/lib"

EXPOSE $PORT
EXPOSE 8080

ENTRYPOINT ["/usr/src/app/container"]
