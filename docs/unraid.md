# Veil on Unraid (Add Container Setup)

This guide covers running Veil from a public image (GHCR) using Unraid's **Add Container** UI.

## Image

- Repository: `ghcr.io/mayvqt/veil`
- Tag: `latest` (or a pinned release tag)

## Add Container Fields

- **Name**: `veil`
- **Repository**: `ghcr.io/mayvqt/veil:latest`
- **Network Type**: `bridge` (recommended)

### Port Mapping

- **Container Port**: `3847`
- **Host Port**: `3847` (or change if needed)
- **Protocol**: `TCP`

Important:

- This is **not** controlled by env vars.
- `APP_BIND_ADDR` only controls what address/port Veil listens on **inside** the container.
- You still must publish container port `3847` to a host port in Unraid.

Expected `docker ps` output when correct:

- `0.0.0.0:3847->3847/tcp` (and usually `[::]:3847->3847/tcp`)

If you only see:

- `3847/tcp`

then the port is exposed internally but **not** reachable from host/browser.

### Path Mapping

- **Container Path**: `/config`
- **Host Path**: `/mnt/user/appdata/veil`

## Environment Variables (Add Container -> Add another Path, Port, Variable, Label -> Variable)

Required:

- `SESSION_SECRET` = long random string (required in production)

Recommended defaults:

- `APP_ENV` = `production`
- `APP_BIND_ADDR` = `:3847`
- `VEIL_DATA_DIR` = `/config`
- `DATABASE_PATH` = `/config/veil.db`
- `COOKIE_SECURE` = `false` (set `true` if behind HTTPS reverse proxy)
- `SESSION_MAX_AGE_HOURS` = `720`
- `TZ` = your timezone (for example `Pacific/Auckland`)
- `PUID` = your Unraid user id (often `99`)
- `PGID` = your Unraid group id (often `100`)
- `UMASK` = `022`

Optional:

- `PUBLIC_ORIGIN` = your public origin, e.g. `https://veil.example.com`
- `MESSAGE_RETENTION_DAYS` = e.g. `30`
- `MESSAGE_RETENTION_COUNT` = e.g. `5000`

## Reverse Proxy Notes

If exposing Veil through a reverse proxy:

1. Set `COOKIE_SECURE=true`
2. Set `PUBLIC_ORIGIN` to your exact HTTPS origin
3. Ensure WebSocket upgrades are enabled for `/ws`

## First Run Check

After starting container:

1. Open `http://<unraid-ip>:3847`
2. Create room/admin if first launch
3. Verify `/config/veil.db` exists in `/mnt/user/appdata/veil`

## Updating

1. Pull latest image in Unraid (or enable auto-update tooling)
2. Recreate/restart container with same `/config` mapping
3. Keep env vars unchanged unless intentionally updating config

## Troubleshooting

- Startup fails with secret warning:
    - Set `SESSION_SECRET` to a strong non-default value.
- Can load UI but sessions/cookies seem wrong behind proxy:
    - Set `COOKIE_SECURE=true` and `PUBLIC_ORIGIN=https://your-domain`.
- Data not persisting:
    - Confirm host path is `/mnt/user/appdata/veil` -> container `/config`.
