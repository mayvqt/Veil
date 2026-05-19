# syntax=docker/dockerfile:1

FROM golang:1.25-bookworm AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
COPY web ./web

RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -o /out/veil-server ./cmd/server

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates sqlite3 gosu tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=build /out/veil-server /usr/local/bin/veil-server
COPY web ./web
COPY docker/entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENV APP_BIND_ADDR=:3847
ENV VEIL_DATA_DIR=/config
ENV DATABASE_PATH=/config/veil.db
ENV SESSION_SECRET=dev-secret-change-me
ENV COOKIE_SECURE=false
ENV PUID=99
ENV PGID=100
ENV TZ=UTC
ENV UMASK=022

VOLUME ["/config"]
EXPOSE 3847

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
