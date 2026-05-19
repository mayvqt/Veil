# Configuration

## Core

- `SESSION_SECRET`: session signing secret
- `APP_ENV`: `dev|development|local|production`
- `APP_BIND_ADDR`: default `:3847`
- `DATABASE_PATH`: default `./veil.db`

## Storage

- `VEIL_DATA_DIR`: base runtime data dir
- `AVATAR_DIR`: default `${VEIL_DATA_DIR}/avatars`
- `MEDIA_DIR`: default `${VEIL_DATA_DIR}/media`
- `AVATAR_URL_BASE`: optional avatar URL base
- `MEDIA_URL_BASE`: optional media URL base

## Session / Network

- `COOKIE_SECURE`: set `true` behind HTTPS
- `SESSION_MAX_AGE_HOURS`: cookie age
- `PUBLIC_ORIGIN`: optional comma-separated allowed origins

## Retention

- `MESSAGE_RETENTION_DAYS`
- `MESSAGE_RETENTION_COUNT`

## Container

- `PUID`, `PGID`, `TZ`, `UMASK`
