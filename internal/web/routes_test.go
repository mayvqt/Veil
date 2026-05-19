package web

import (
	"net/http"
	"path/filepath"
	"testing"

	"veil/internal/db"

	"github.com/go-chi/chi/v5"
)

func TestRoutesContainExpectedEndpoints(t *testing.T) {
	store, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	srv := New(store)
	h := srv.Routes()
	mux, ok := h.(*chi.Mux)
	if !ok {
		t.Fatalf("expected chi mux, got %T", h)
	}

	expected := map[string]bool{
		http.MethodGet + " /health":                                false,
		http.MethodPost + " /api/bootstrap":                        false,
		http.MethodPost + " /api/session/from-credential":          false,
		http.MethodPost + " /api/profile/avatar":                   false,
		http.MethodPost + " /api/profile/avatar-ring":              false,
		http.MethodGet + " /api/messages":                          false,
		http.MethodGet + " /api/members":                           false,
		http.MethodPost + " /api/messages/read":                    false,
		http.MethodPost + " /api/messages/edit":                    false,
		http.MethodPost + " /api/messages/delete":                  false,
		http.MethodPost + " /api/messages/react":                   false,
		http.MethodGet + " /api/messages/pins":                     false,
		http.MethodGet + " /api/custom-media":                      false,
		http.MethodGet + " /api/admin/users":                       false,
		http.MethodGet + " /api/admin/audit":                       false,
		http.MethodPost + " /api/admin/pin-message":                false,
		http.MethodPost + " /api/admin/room-name":                  false,
		http.MethodPost + " /api/admin/room-status-text":           false,
		http.MethodPost + " /api/admin/messages/retain":            false,
		http.MethodPost + " /api/admin/messages/clear":             false,
		http.MethodPost + " /api/admin/purge-used-revoked-invites": false,
		http.MethodPost + " /api/admin/custom-media":               false,
		http.MethodDelete + " /api/admin/custom-media/{name}":      false,
		http.MethodGet + " /ws":                                    false,
		http.MethodGet + " /avatars/*":                             false,
		http.MethodGet + " /media/*":                               false,
	}

	if err := chi.Walk(mux, func(method string, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		key := method + " " + route
		if _, ok := expected[key]; ok {
			expected[key] = true
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}

	for route, seen := range expected {
		if !seen {
			t.Fatalf("expected route missing: %s", route)
		}
	}
}
