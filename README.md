# Veil

Veil is a private, browser-based realtime room chat app with end-to-end encrypted messages.

## Features

- End-to-end AES-GCM encryption in the browser (room-key model)
- Realtime chat over WebSocket with automatic reconnect and history re-sync
- Image sharing support:
  - PNG, JPEG, WebP, GIF
  - Paste image from clipboard
  - Drag-and-drop image upload (input, composer, and chat area)
  - Inline image rendering with click-to-expand lightbox
- File attachment support with inline download links
- GIF support for users in chat (including animated GIF rendering)
- Emoji support:
  - Emoji picker
  - Emoticon-to-emoji conversion while typing
- Mentions (`@name`) with autocomplete:
  - Type `@` to open suggestions
  - Keyboard navigation (`↑/↓`, `Enter`/`Tab`, `Esc`)
  - Mention highlighting in message rendering
- User display-name color selection (local browser preference)
- Invite-based onboarding
- Admin and root-admin control center
- Local key export/import and device sync code flow
- Theme studio with presets and custom color tokens (local browser preference)

## What Is Stored Where

- Server stores encrypted message ciphertext + nonce only
- Decryption keys remain client-side
- Theme choices and chat color preferences are stored in browser local storage

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
- `PUBLIC_ORIGIN` (optional, comma-separated allowed origins for WebSocket origin checks)

### Security Behavior

- `APP_ENV`:
  - `dev` / `development` / `local` allow default dev secret
- `ALLOW_INSECURE_DEFAULT_SECRET=true`:
  - explicit override to allow default secret in non-dev

In non-dev deployments, Veil refuses startup if `SESSION_SECRET` is still default unless override is set.

### Message Retention Policy

- `MESSAGE_RETENTION_DAYS`: optional auto-prune by age
- `MESSAGE_RETENTION_COUNT`: optional auto-prune to newest N messages

### Container-Focused

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

## Roles and Admin Capabilities

### Admin + Root Admin

- Create invites
- List invites
- Revoke individual invites
- Revoke all unused invites
- Purge used/revoked invites
- Manage user roles (`member` / `admin`)
- Revoke user access

### Root Admin Only

- Delete all messages
- Keep only latest N messages

### Invite UX Note

- Creating an invite auto-copies the invite URL to clipboard when browser permissions allow it.

## Security Notes

- Message encryption happens client-side before send
- Anyone with room-key material and ciphertext history can decrypt that history
- Rotate room keys when trust boundaries change (for example after account/device removals)

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
