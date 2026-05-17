# Veil

Go-based private room chat MVP with:
- Web client (dark purple/red theme)
- Alternative Go TUI client (Bubble Tea)
- SQLite backend + WebSocket realtime transport

## Local run (no domain)

```bash
go mod tidy
go run ./cmd/server
```

Open `http://localhost:3847`.

In another terminal for TUI:

```bash
VEIL_BASE=http://127.0.0.1:3847 go run ./cmd/veilclient
```

The TUI opens a setup wizard on launch. Use your public HTTPS URL when connecting through Nginx Proxy Manager or Cloudflare.

TUI key import:

```bash
go run ./cmd/veilclient import room.keys
```

Build release binaries for the TUI:

```bash
./scripts/build-tui.sh
```

## Docker Compose (local testing)

```bash
docker compose up --build
```

Then open `http://localhost:3847`.

The compose setup persists SQLite in a named volume (`veil_config`).

## Unraid Docker App Template

Recommended Unraid mappings:

- `Network Type`: `bridge`
- `WebUI`: `http://[IP]:[PORT:3847]`
- Port mapping: host `<your choice>` -> container `3847`
- Path mapping: `/mnt/user/appdata/veil` -> container `/config`

Recommended variables:

- `PUID=99`
- `PGID=100`
- `TZ=America/New_York` (or your local timezone)
- `UMASK=022`
- `APP_BIND_ADDR=:3847`
- `VEIL_DATA_DIR=/config`
- `DATABASE_PATH=/config/veil.db`
- `SESSION_SECRET=<set a strong random value>`
- `COOKIE_SECURE=false` (set `true` behind HTTPS reverse proxy)

## Env vars

- `APP_BIND_ADDR` default `:3847`
- `VEIL_DATA_DIR` default `/config` in container images
- `DATABASE_PATH` default `./veil.db` for local `go run`; container default `/config/veil.db`
- `SESSION_SECRET` default `dev-secret-change-me` (set this yourself)
- `COOKIE_SECURE` default `false` for localhost HTTP
- `SESSION_MAX_AGE_HOURS` default `720` (30 days)
- `PUBLIC_ORIGIN` optional comma-separated allowed browser origins for WebSocket checks, for example `https://veil.example.com`
- `PUID` default `99` (container only)
- `PGID` default `100` (container only)
- `TZ` default `UTC` (container only)
- `UMASK` default `022` (container only)

## Reverse proxy later

When running behind TLS termination (Caddy/Nginx/Traefik):

1. Set `COOKIE_SECURE=true`
2. Keep proxy forwarding WebSocket upgrades for `/ws`
3. Publish only proxy ports, keep Veil private on the internal network

## Nginx Proxy Manager + Cloudflare

Use this when you want both the web UI and TUI client to connect through your public domain.

### 1) Veil container settings

- Keep Veil listening on `:3847`
- Set `COOKIE_SECURE=true`
- Set `PUBLIC_ORIGIN=https://veil.example.com`
- Set a strong `SESSION_SECRET`
- If NPM and Veil are on the same Docker host, put both on the same Docker network and point NPM to the Veil container name + port `3847`

Example compose env:

```yaml
environment:
  APP_BIND_ADDR: ":3847"
  DATABASE_PATH: "/config/veil.db"
  SESSION_SECRET: "replace-with-long-random-secret"
  COOKIE_SECURE: "true"
  PUBLIC_ORIGIN: "https://veil.example.com"
```

### 2) Nginx Proxy Manager host

Create a Proxy Host in NPM:

- `Domain Names`: `veil.example.com`
- `Scheme`: `http`
- `Forward Hostname / IP`: `veil` (or your Veil host IP)
- `Forward Port`: `3847`
- Enable:
1. `Websockets Support`
2. `Block Common Exploits`
3. `SSL` tab: request/use a cert for `veil.example.com` and enable `Force SSL`

No custom location is required. Veil serves web + API + websocket on the same origin (`/`, `/api/*`, `/ws`).

### 3) Cloudflare DNS/SSL

- Create `A`/`CNAME` record for `veil.example.com` pointing to your NPM endpoint
- Proxy can be ON (orange cloud)
- SSL/TLS mode: `Full (strict)` (recommended)
- Do not cache dynamic paths (`/api/*`, `/ws`); default Cloudflare behavior is already fine for websocket

### 4) TUI client through Cloudflare/NPM

Point the TUI client at the HTTPS domain:

```bash
VEIL_BASE=https://veil.example.com ./veilclient
```

Or with `go run`:

```bash
VEIL_BASE=https://veil.example.com go run ./cmd/veilclient
```

The client automatically upgrades websocket to `wss://` when `VEIL_BASE` is `https://`.

### 5) Quick verification

1. Open `https://veil.example.com/health` and confirm `{"ok":true,...}`
2. Open web UI at `https://veil.example.com`
3. Connect TUI with `VEIL_BASE=https://veil.example.com`
4. Send one message from web and one from TUI to confirm realtime sync
