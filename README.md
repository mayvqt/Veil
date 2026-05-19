# Veil

Private realtime room chat with client-side encryption.

## Dev Quickstart

### 1. Prereqs

- Go 1.22+
- SQLite (embedded via Go driver, no external DB service needed)

### 2. Configure env

```bash
cp .env.example .env
```

Set at least:

- `SESSION_SECRET` (required for non-dev env)

Useful defaults:

- `APP_ENV=dev`
- `APP_BIND_ADDR=:3847`
- `DATABASE_PATH=./veil.db`
- `VEIL_DATA_DIR=.`

### 3. Run

```bash
go run ./cmd/server
```

Open `http://localhost:3847`.

## Docker (Dev)

```bash
docker compose up --build
```

App is available at `http://localhost:3847`.

## Tests

```bash
go test ./...
```

## Key Env Vars

- `SESSION_SECRET`: session signing secret
- `APP_ENV`: `dev|development|local` allows default dev secret fallback
- `APP_BIND_ADDR`: HTTP bind address (default `:3847`)
- `DATABASE_PATH`: SQLite file path
- `VEIL_DATA_DIR`: base dir for runtime files
- `AVATAR_DIR`: avatar storage dir (default `${VEIL_DATA_DIR}/avatars`)
- `MEDIA_DIR`: media storage dir (default `${VEIL_DATA_DIR}/media`)
- `PUBLIC_ORIGIN`: optional origin allowlist for websocket checks

## Notes

- Server stores ciphertext; decryption happens client-side.
- Health endpoint: `GET /health`.
