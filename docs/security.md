# Security

## Model

- Encryption happens client-side
- Server stores ciphertext and metadata
- Room key holders can decrypt matching history

## Session

- Never use default dev secret in production
- Use strong random `SESSION_SECRET`
- Set `COOKIE_SECURE=true` on HTTPS deployments

## Ops

- Rotate room keys when trust changes
- Keep app data on trusted persistent storage
- Restrict network access to trusted users
