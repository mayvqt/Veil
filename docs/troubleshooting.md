# Troubleshooting

## Secret Error on Startup

- Cause: missing/default `SESSION_SECRET` outside dev
- Fix: set `SESSION_SECRET`, or use `APP_ENV=dev` for local only

## App Not Reachable

- Check `APP_BIND_ADDR`
- Check port publish/mapping (`3847`)

## Data Not Persisting

- Verify persistent `/config` mapping
- Verify DB/media dirs use persistent paths

## Proxy Cookie/Login Issues

- Set `COOKIE_SECURE=true`
- Set exact `PUBLIC_ORIGIN`
- Ensure websocket upgrades for `/ws`

## Tests Failing

- Confirm Go 1.22+
- Run `go test ./...` from repo root
