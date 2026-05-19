# Veil

Private realtime room chat with client-side encryption.

## Quickstart

```bash
cp .env.example .env
go run ./cmd/server
```

Open `http://localhost:3847`.

## Docker

```bash
docker compose up --build
```

## Test

```bash
go test ./...
```

## Docs

- [Documentation Index](docs/index.md)
- [Setup](docs/setup.md)
- [Development](docs/development.md)
- [Configuration](docs/configuration.md)
- [Deployment](docs/deployment.md)
- [Security](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Contributing](docs/contributing.md)
- [Unraid](docs/unraid.md)

## Required Env

- `SESSION_SECRET`: required outside local dev
- `APP_ENV`: use `dev` for local development
