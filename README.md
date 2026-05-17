# Veil

Veil is a private room chat app with end-to-end encrypted messages, a browser client, and a Go TUI client.

## What It Includes

- Web client with image message support
- Go TUI client (Bubble Tea)
- End-to-end AES-GCM message encryption (room key model)
- SQLite storage + WebSocket realtime transport
- Invite-based member onboarding
- Admin controls for users, invites, and message retention

## Quick Start (Local)

### 1) Run the server

```bash
go run ./cmd/server
```

Open `http://localhost:3847`.

### 2) Run the TUI client

```bash
VEIL_BASE=http://127.0.0.1:3847 go run ./cmd/veilclient
```

The TUI launches a setup/restore flow on first run.

### 3) Build TUI binaries

```bash
./scripts/build-tui.sh
```

## Docker Compose

```bash
docker compose up --build
```

Then open `http://localhost:3847`.

SQLite data persists in the `veil_config` volume.

## Environment Variables

### Core

- `APP_BIND_ADDR` default `:3847`
- `DATABASE_PATH` default `./veil.db` (container default usually `/config/veil.db`)
- `SESSION_SECRET` default `dev-secret-change-me`
- `COOKIE_SECURE` default `false`
- `SESSION_MAX_AGE_HOURS` default `720`
- `PUBLIC_ORIGIN` optional comma-separated allowed origins for WebSocket checks

### Security behavior

- `APP_ENV`:
  - `dev` / `development` / `local` allow default dev secret
- `ALLOW_INSECURE_DEFAULT_SECRET=true`:
  - explicit override to allow default secret in non-dev

Important: in non-dev deployments, Veil will refuse startup if `SESSION_SECRET` is still the default unless override is set.

### Message retention policy

- `MESSAGE_RETENTION_DAYS` optional auto-prune by age
- `MESSAGE_RETENTION_COUNT` optional auto-prune to newest N messages

### Container-focused

- `PUID` default `99`
- `PGID` default `100`
- `TZ` default `UTC`
- `UMASK` default `022`

## Reverse Proxy / HTTPS

For TLS-terminated deployments (Nginx/Caddy/Traefik):

1. Set `COOKIE_SECURE=true`
2. Keep WebSocket upgrades enabled for `/ws`
3. Keep Veil private behind proxy where possible
4. Set `PUBLIC_ORIGIN` to your public origin (for example `https://veil.example.com`)

## TUI: Inline Image Previews

Veil TUI supports inline image previews in compatible terminals.

Auto-detected:

1. Kitty
2. iTerm2

Manual override:

- `VEIL_TUI_IMAGE_PROTOCOL=kitty`
- `VEIL_TUI_IMAGE_PROTOCOL=iterm`
- `VEIL_TUI_IMAGE_PROTOCOL=off`

## Admin Capabilities

Admin and root-admin features include:

- Invite creation
- Invite listing + revoke individual invite
- Revoke all unused invites
- Role management (`member` / `admin`)
- User access revocation

Root-admin-only message controls:

- Delete all messages
- Keep only latest N messages

## Realtime Reliability Notes

- Web client reconnects automatically and re-syncs history
- TUI reconnects automatically and merges missed history
- Message IDs are used to deduplicate after reconnect

## Security Notes

- Message content is encrypted client-side before send
- Server stores ciphertext + nonce only
- Anyone with both room key material and ciphertext history can decrypt that history
- Rotate room keys when your trust boundary changes

## Health Check

`GET /health` returns service health and initialization state.

## Typical Deploy Checklist

1. Set strong `SESSION_SECRET`
2. Set `COOKIE_SECURE=true` behind HTTPS
3. Set `PUBLIC_ORIGIN`
4. Set `DATABASE_PATH` to persistent storage
5. Decide retention policy (`MESSAGE_RETENTION_DAYS`/`MESSAGE_RETENTION_COUNT`)
6. Verify WebSocket proxying for `/ws`

## License

Add your preferred license here.
