// Package db contains persistence access for room state, users, invites, and messages.
//
// Responsibilities:
//   - Opening and migrating the SQLite database
//   - CRUD operations and transactional workflows for core entities
//   - Retention and pruning operations
//
// Non-responsibilities:
//   - HTTP transport concerns (internal/web)
//   - Session/token semantics (internal/auth)
package db
