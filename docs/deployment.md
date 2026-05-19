# Deployment

## Compose

```bash
cp .env.example .env
# set SESSION_SECRET
docker compose up -d --build
```

## Production Checklist

- Set strong `SESSION_SECRET`
- Set `APP_ENV=production`
- Set `COOKIE_SECURE=true` when behind HTTPS
- Set `PUBLIC_ORIGIN=https://your-domain`
- Persist DB + media dirs (`DATABASE_PATH`, `AVATAR_DIR`, `MEDIA_DIR`)

## Reverse Proxy

- Enable websocket upgrades for `/ws`
- Preserve host/proto headers

## Health

- `GET /health`
