# Development

## Prereqs

- Go 1.22+

## Run

```bash
go run ./cmd/server
```

## Test

```bash
go test ./...
```

## Layout

- `cmd/server`: entrypoint
- `internal/web`: HTTP, websocket, handlers, session/auth
- `internal/db`: storage and models
- `internal/chat`: realtime hub
- `internal/auth`: auth helpers
- `web/static`: frontend assets
