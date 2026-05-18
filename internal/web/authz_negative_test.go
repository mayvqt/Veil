package web

import (
	"net/http"
	"testing"
	"time"
)

func TestInviteRequiresAdminRole(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "u1", "member", "member")
	token := sessionToken(srv.Secret, "u1")

	rr := doReq(t, h, http.MethodPost, "/api/invite", token, map[string]any{})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for member invite creation, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestJoinAndSessionCredentialRejectInvalidRequests(t *testing.T) {
	srv, h := testServer(t)

	rr := doReq(t, h, http.MethodPost, "/api/join", "", map[string]any{
		"token":         "",
		"display_name":  "",
		"credential_id": "",
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid join payload, got %d body=%s", rr.Code, rr.Body.String())
	}

	rr = doReq(t, h, http.MethodPost, "/api/session/from-credential", "", map[string]any{
		"credential_id": "does-not-exist",
	})
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unknown credential, got %d body=%s", rr.Code, rr.Body.String())
	}

	// Also verify this still works when room is initialized and users exist.
	addUser(t, srv.Store, "u1", "alice", "member")
	rr = doReq(t, h, http.MethodPost, "/api/session/from-credential", "", map[string]any{
		"credential_id": "missing-cred",
	})
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing credential in initialized state, got %d", rr.Code)
	}
}

func TestAdminStatsForbiddenForNonAdmin(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "u1", "member", "member")
	token := sessionToken(srv.Secret, "u1")

	rr := doReq(t, h, http.MethodGet, "/api/admin/messages/stats", token, nil)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-admin stats access, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestSessionFromCredentialRateLimitDoesNotBreakValidRequest(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "u1", "alice", "member")
	_, err := srv.Store.DB.Exec("INSERT INTO devices (id, user_id, public_key, credential_id, created_at) VALUES (?, ?, ?, ?, ?)", "d1", "u1", "pk", "cred-1", time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatal(err)
	}
	rr := doReq(t, h, http.MethodPost, "/api/session/from-credential", "", map[string]any{
		"credential_id": "cred-1",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected valid session restore, got %d body=%s", rr.Code, rr.Body.String())
	}
}
