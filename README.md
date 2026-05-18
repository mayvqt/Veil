# Veil

Veil is a private, browser-based realtime room chat app with end-to-end encrypted messages.

## Features

- End-to-end AES-GCM encryption in the browser (room-key model)
- Realtime chat over WebSocket with reconnect + history catch-up
- Messages:
  - Text, emoji, mentions (`@name`) with autocomplete
  - Image attachments (PNG, JPEG, WebP, GIF)
  - File attachments with download links
  - Reply, edit, delete
  - Read receipts (`sent` / `seen`) for your latest outgoing message
- Presence + members:
  - Online members button with live count
  - Member list popover with online/offline state
- Profile + identity:
  - Display-name color
  - Profile picture upload (visible to all users)
  - Profile picture clear/replace
- Theme + display preferences (local to each browser):
  - Presets + custom theme tokens
  - Show/hide avatars
  - Timestamp mode (`Always` / `On Hover`)
- Notifications:
  - Sound on/off
  - Volume slider with boost range
- Admin / root-admin controls:
  - Invite management
  - Role management
  - User removal
  - Message retention controls
- Key management:
  - Encrypted key export/import
  - Device sync code flow

## What Is Stored Where

- Server stores encrypted message ciphertext + nonce.
- Decryption keys stay client-side.
- Browser local storage keeps local preferences (theme/display/sound settings).
- Server stores profile attributes such as chat color and profile picture URL.
- Profile pictures are stored as files on disk and served by URL.

## Quick Start (Local)

```bash
go run ./cmd/server
```

Open: `http://localhost:3847`

## Docker Compose

```bash
docker compose up --build
```

Open: `http://localhost:3847`

By default:
- Host `./data` maps to container `/config`
- Database: `/config/veil.db`
- Avatars: `/config/avatars`

## Environment Variables

### Core

- `APP_BIND_ADDR` (default `:3847`)
- `DATABASE_PATH` (default `./veil.db`, container default `/config/veil.db`)
- `SESSION_SECRET` (required for production)
- `COOKIE_SECURE` (default `false`; set `true` behind HTTPS)
- `SESSION_MAX_AGE_HOURS` (default `720`)
- `PUBLIC_ORIGIN` (optional comma-separated origins for WebSocket origin checks)

### Avatar Storage

- `VEIL_DATA_DIR` (container default `/config`)
- `AVATAR_DIR` (default `${VEIL_DATA_DIR}/avatars`; e.g. `/config/avatars`)
- `AVATAR_URL_BASE` (default `/avatars`)

Veil serves uploaded avatar files via:
- `GET /avatars/*`

### Security Behavior

- `APP_ENV`:
  - `dev` / `development` / `local` allow default dev secret behavior
- `ALLOW_INSECURE_DEFAULT_SECRET=true`:
  - explicit override to allow default secret outside dev

In non-dev deployments, Veil refuses startup if `SESSION_SECRET` is still default unless override is set.

### Message Retention

- `MESSAGE_RETENTION_DAYS` (optional auto-prune by age)
- `MESSAGE_RETENTION_COUNT` (optional auto-prune to newest N)

### Container-focused

- `PUID` (default `99`)
- `PGID` (default `100`)
- `TZ` (default `UTC`)
- `UMASK` (default `022`)

## Reverse Proxy / HTTPS

For TLS-terminated deployments (Nginx/Caddy/Traefik):

1. Set `COOKIE_SECURE=true`
2. Keep WebSocket upgrades enabled for `/ws`
3. Set `PUBLIC_ORIGIN` to your public origin (for example `https://veil.example.com`)
4. Keep Veil private behind your normal auth/network boundaries

## Roles and Admin Capabilities

### Admin + Root Admin

- Create/list/revoke invites
- Revoke unused invites
- Purge used/revoked invites
- Manage user roles (`member` / `admin`)
- Remove users

### Root Admin Only

- Delete all messages
- Retain latest N messages

## Avatar Behavior

- Accepted image types: PNG, JPEG, WebP, GIF
- Max image size: 4MB
- On avatar replace:
  - new file is written
  - DB URL updated
  - previous file cleaned up
- On avatar clear or user removal:
  - avatar file is cleaned up
- Unused local avatar files are pruned automatically during avatar mutation/removal flows.

## Security Notes

- Message encryption happens client-side before send.
- Anyone with room-key material and ciphertext history can decrypt that history.
- Rotate room keys when trust boundaries change (for example after user/device removals).

## Health Check

- `GET /health` returns service health and initialization status.

## Deploy Checklist

1. Set strong `SESSION_SECRET`
2. Set `COOKIE_SECURE=true` behind HTTPS
3. Set `PUBLIC_ORIGIN`
4. Put `DATABASE_PATH` on persistent storage
5. Ensure `AVATAR_DIR` is writable and persistent
6. Configure retention policy (`MESSAGE_RETENTION_DAYS` / `MESSAGE_RETENTION_COUNT`)
7. Verify WebSocket proxying for `/ws`

## License

Add your preferred license here.
