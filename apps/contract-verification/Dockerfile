# syntax=docker/dockerfile:1
FROM oven/bun AS builder

RUN apt-get update --yes \
  && apt-get install --yes --no-install-recommends libz1 \
  && apt-get clean --yes \
  && rm -rf /var/lib/apt/lists/*

ARG NODE_ENV="production"
ENV NODE_ENV=${NODE_ENV}

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
FROM --platform=linux/amd64 debian:trixie-slim AS amd64-libs-provider
RUN apt-get update --yes \
  && apt-get install --yes --no-install-recommends zlib1g \
  && apt-get clean --yes \
  && rm -rf /var/lib/apt/lists/*

FROM gcr.io/distroless/base AS runtime

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/container /usr/src/app/container
# x86_64 dynamic linker + libc + libz for amd64 solc/vyper on arm64 hosts via QEMU
COPY --from=amd64-libs-provider /lib64/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2
COPY --from=amd64-libs-provider /lib/x86_64-linux-gnu/libc.so.6 /lib/x86_64-linux-gnu/libc.so.6
COPY --from=amd64-libs-provider /lib/x86_64-linux-gnu/libm.so.6 /lib/x86_64-linux-gnu/libm.so.6
COPY --from=amd64-libs-provider /lib/x86_64-linux-gnu/libz.so.1 /lib/x86_64-linux-gnu/libz.so.1
COPY --from=amd64-libs-provider /lib/x86_64-linux-gnu/libdl.so.2 /lib/x86_64-linux-gnu/libdl.so.2
COPY --from=amd64-libs-provider /lib/x86_64-linux-gnu/libpthread.so.0 /lib/x86_64-linux-gnu/libpthread.so.0
# native-arch libz for any native binaries that need it
COPY --from=builder /usr/lib/*-linux-gnu/libz.so.1 /usr/local/lib/

ARG NODE_ENV="production"
ENV NODE_ENV=${NODE_ENV}
ENV LD_LIBRARY_PATH="/usr/local/lib"

EXPOSE $PORT
EXPOSE 8080

ENTRYPOINT ["/usr/src/app/container"]
