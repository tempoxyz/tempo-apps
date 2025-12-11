# syntax=docker/dockerfile:1
FROM oven/bun AS build

ENV NODE_ENV="production"

WORKDIR /usr/src/app

COPY container/index.ts index.ts
RUN bun build /usr/src/app/index.ts --compile --outfile container

FROM gcr.io/distroless/base  
WORKDIR /usr/src/app

COPY --from=build /usr/src/app/container /usr/src/app/container

EXPOSE $PORT
EXPOSE 8080

ENTRYPOINT ["/usr/src/app/container"]