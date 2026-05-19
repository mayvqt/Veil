# Setup

## Local

```bash
cp .env.example .env
# set SESSION_SECRET
go run ./cmd/server
```

App URL: `http://localhost:3847`

## Docker Compose

```bash
cp .env.example .env
# set SESSION_SECRET
docker compose up --build
```

## Minimum Env

- `SESSION_SECRET=<long-random-string>`
- `APP_ENV=dev` for local development
