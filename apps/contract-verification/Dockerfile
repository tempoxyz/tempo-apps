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

# Build each pinned solar compiler (container/solar-builds.json) from source: solar publishes no
# binaries for arbitrary commits. Each lands in /opt/solar/<rev>/bin/solar, where compiler.ts finds it.
FROM rust:1.99-bookworm AS solar
COPY container/solar-builds.json /tmp/solar-builds.json
RUN --mount=type=cache,target=/usr/local/cargo/registry \
  --mount=type=cache,target=/usr/local/cargo/git \
  set -eu; \
  for rev in $(grep -o '"rev": *"[0-9a-f]\{40\}"' /tmp/solar-builds.json | grep -o '[0-9a-f]\{40\}'); do \
    cargo install --locked --git https://github.com/paradigmxyz/solar --rev "$rev" \
      --root "/opt/solar/$rev" solar-compiler; \
  done; \
  cp /usr/lib/*-linux-gnu/libgcc_s.so.1 /opt/solar/

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
# pinned solar builds, and the libgcc_s they link against (distroless/base lacks it)
COPY --from=solar /opt/solar /opt/solar
COPY --from=solar /opt/solar/libgcc_s.so.1 /usr/local/lib/

ENV NODE_ENV="production"
ENV LD_LIBRARY_PATH="/usr/local/lib"

EXPOSE $PORT
EXPOSE 8080

ENTRYPOINT ["/usr/src/app/container"]
