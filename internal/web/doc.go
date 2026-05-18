// Package web contains HTTP/WebSocket transport and request handling.
//
// Responsibilities:
//   - Route wiring and middleware
//   - Session and request authentication
//   - Input validation at API boundaries
//   - Broadcasting realtime chat events
//
// Non-responsibilities:
//   - Database schema/migrations (internal/db)
//   - Cryptographic message payload contents (handled client-side)
package web
