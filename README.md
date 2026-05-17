# Veil

Veil is a private, browser-based room chat app with end-to-end encrypted messages.

## Features

- Browser chat UI with realtime updates over WebSocket
- End-to-end AES-GCM encryption in the client
- Image and file attachments
- Invite-based onboarding
- Admin controls for users, invites, and message retention
- SQLite-backed server storage

## Quick Start (Local)

1. Start the server:

```bash
go run ./cmd/server
```

2. Open:

`http://localhost:3847`

## Docker Compose

```bash
docker compose up --build
```

Then open `http://localhost:3847`.

Data persists in the `veil_config` volume.

## Environment Variables

### Core

- `APP_BIND_ADDR` (default `:3847`)
- `DATABASE_PATH` (default `./veil.db`, container default `/config/veil.db`)
- `SESSION_SECRET` (default `dev-secret-change-me`)
- `COOKIE_SECURE` (default `false`)
- `SESSION_MAX_AGE_HOURS` (default `720`)
- `PUBLIC_ORIGIN` (optional, comma-separated allowed origins for WebSocket checks)

### Security behavior

- `APP_ENV`:
  - `dev` / `development` / `local` allow default dev secret
- `ALLOW_INSECURE_DEFAULT_SECRET=true`:
  - explicit override to allow default secret in non-dev

In non-dev deployments, Veil refuses startup if `SESSION_SECRET` is still default unless override is set.

### Message retention policy

- `MESSAGE_RETENTION_DAYS`: optional auto-prune by age
- `MESSAGE_RETENTION_COUNT`: optional auto-prune to newest N messages

### Container-focused

- `PUID` default `99`
- `PGID` default `100`
- `TZ` default `UTC`
- `UMASK` default `022`

## Reverse Proxy / HTTPS

For TLS-terminated deployments (Nginx/Caddy/Traefik):

1. Set `COOKIE_SECURE=true`
2. Keep WebSocket upgrades enabled for `/ws`
3. Set `PUBLIC_ORIGIN` to your public origin (for example `https://veil.example.com`)
4. Keep Veil private behind your proxy/auth boundaries where possible

## Admin Capabilities

Admin and root-admin features include:

- Invite creation
- Invite listing and revoke
- Revoke all unused invites
- Role management (`member` / `admin`)
- User access revocation

Root-admin-only message controls:

- Delete all messages
- Keep only latest N messages

## Reliability Notes

- Web client reconnects automatically and re-syncs history
- Message IDs are used for de-duplication after reconnect

## Security Notes

- Message content is encrypted client-side before send
- Server stores ciphertext + nonce only
- Anyone with room key material and ciphertext history can decrypt that history
- Rotate room keys when trust boundaries change

## Health Check

`GET /health` returns service health and initialization state.

## Deploy Checklist

1. Set a strong `SESSION_SECRET`
2. Set `COOKIE_SECURE=true` behind HTTPS
3. Set `PUBLIC_ORIGIN`
4. Put `DATABASE_PATH` on persistent storage
5. Configure retention policy (`MESSAGE_RETENTION_DAYS`/`MESSAGE_RETENTION_COUNT`)
6. Verify WebSocket proxying for `/ws`

## License

Add your preferred license here.
