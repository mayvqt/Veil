package web

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"veil/internal/auth"
	"veil/internal/db"
)

func (s *Server) requireUser(w http.ResponseWriter, r *http.Request) (*db.User, bool) {
	u, err := s.userFromCookie(r)
	if err != nil {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return nil, false
	}
	return u, true
}

func (s *Server) userFromCookie(r *http.Request) (*db.User, error) {
	c, err := r.Cookie("veil_session")
	if err != nil {
		return nil, err
	}
	return s.userFromSignedToken(c.Value)
}

func (s *Server) userFromSignedToken(signed string) (*db.User, error) {
	raw, ok := auth.Verify(signed, s.Secret)
	if !ok {
		return nil, fmt.Errorf("invalid session token")
	}
	parts := strings.Split(raw, "|")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid session payload")
	}
	issuedAt, err := time.Parse(time.RFC3339, parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid session timestamp")
	}
	if time.Since(issuedAt) > s.SessionMaxAge {
		return nil, fmt.Errorf("session expired")
	}
	id := parts[0]
	row := s.Store.DB.QueryRow("SELECT id, display_name, role FROM users WHERE id=? AND active=1", id)
	u := &db.User{}
	if err := row.Scan(&u.ID, &u.DisplayName, &u.Role); err != nil {
		return nil, err
	}
	return u, nil
}

func sessionTokenFromRequest(r *http.Request) string {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return strings.TrimSpace(authHeader[7:])
	}
	return r.URL.Query().Get("session")
}
