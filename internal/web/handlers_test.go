package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"veil/internal/auth"
	"veil/internal/db"
)

func testServer(t *testing.T) (*Server, http.Handler) {
	t.Helper()
	store, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	srv := New(store)
	srv.Secret = "test-secret"
	srv.SessionMaxAge = 24 * time.Hour
	return srv, srv.Routes()
}

func addUser(t *testing.T, store *db.Store, id, name, role string) {
	t.Helper()
	_, err := store.DB.Exec("INSERT INTO users (id, display_name, role, active, created_at) VALUES (?, ?, ?, 1, ?)", id, name, role, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatal(err)
	}
}

func sessionToken(secret, userID string) string {
	return auth.Sign(auth.NewSession(userID), secret)
}

func doReq(t *testing.T, h http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var payload []byte
	if body != nil {
		var err error
		payload, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.AddCookie(&http.Cookie{Name: "veil_session", Value: token})
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func decodeBody(t *testing.T, rr *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	out := map[string]any{}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v; body=%s", err, rr.Body.String())
	}
	return out
}

func TestMessagesEndpoints_ListReadEditDelete(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "u1", "alice", "member")
	addUser(t, srv.Store, "u2", "bob", "member")
	tokU1 := sessionToken(srv.Secret, "u1")
	tokU2 := sessionToken(srv.Secret, "u2")

	m1, err := srv.Store.SaveMessage("u1", "alice", "ct1", "n1", "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = srv.Store.SaveMessage("u2", "bob", "ct2", "n2", m1.ID)
	if err != nil {
		t.Fatal(err)
	}

	rr := doReq(t, h, http.MethodGet, "/api/messages?limit=1", tokU1, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("list messages status=%d body=%s", rr.Code, rr.Body.String())
	}
	list := decodeBody(t, rr)
	msgs, ok := list["messages"].([]any)
	if !ok || len(msgs) != 1 {
		t.Fatalf("expected one message page, got %#v", list["messages"])
	}
	if list["has_more"] != true {
		t.Fatalf("expected has_more=true, got %#v", list["has_more"])
	}
	if _, ok := list["my_chat_color"]; !ok {
		t.Fatalf("expected my_chat_color in list response, got %#v", list)
	}

	rr = doReq(t, h, http.MethodPost, "/api/messages/read", tokU1, map[string]any{"last_seen_rowid": m1.RowID})
	if rr.Code != http.StatusOK {
		t.Fatalf("mark read status=%d body=%s", rr.Code, rr.Body.String())
	}
	receipts, err := srv.Store.ListReadReceipts()
	if err != nil {
		t.Fatal(err)
	}
	if receipts["u1"] != m1.RowID {
		t.Fatalf("expected receipt row %d, got %d", m1.RowID, receipts["u1"])
	}

	rr = doReq(t, h, http.MethodPost, "/api/messages/edit", tokU1, map[string]any{
		"message_id": m1.ID, "ciphertext": "ct1-edit", "nonce": "n1-edit",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("edit status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = doReq(t, h, http.MethodPost, "/api/messages/edit", tokU2, map[string]any{
		"message_id": m1.ID, "ciphertext": "hijack", "nonce": "hijack",
	})
	if rr.Code != http.StatusNotFound {
		t.Fatalf("non-owner edit expected 404, got %d body=%s", rr.Code, rr.Body.String())
	}

	rr = doReq(t, h, http.MethodPost, "/api/messages/delete", tokU1, map[string]any{"message_id": m1.ID})
	if rr.Code != http.StatusOK {
		t.Fatalf("delete status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestProfileColorEndpointPersistsColor(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "u1", "alice", "member")
	token := sessionToken(srv.Secret, "u1")

	rr := doReq(t, h, http.MethodPost, "/api/profile/color", token, map[string]any{"chat_color": "#4BFFA8"})
	if rr.Code != http.StatusOK {
		t.Fatalf("profile color status=%d body=%s", rr.Code, rr.Body.String())
	}

	var got string
	if err := srv.Store.DB.QueryRow("SELECT chat_color FROM users WHERE id='u1'").Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != "#4bffa8" {
		t.Fatalf("expected persisted lowercase color #4bffa8, got %q", got)
	}

	rr = doReq(t, h, http.MethodPost, "/api/profile/color", token, map[string]any{"chat_color": "bad"})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid color 400, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestProfileAvatarEndpointPersistsAvatar(t *testing.T) {
	srv, h := testServer(t)
	srv.AvatarDir = t.TempDir()
	addUser(t, srv.Store, "u1", "alice", "member")
	token := sessionToken(srv.Secret, "u1")

	smallPNG := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2jvKsAAAAASUVORK5CYII="
	rr := doReq(t, h, http.MethodPost, "/api/profile/avatar", token, map[string]any{"avatar_url": smallPNG})
	if rr.Code != http.StatusOK {
		t.Fatalf("profile avatar status=%d body=%s", rr.Code, rr.Body.String())
	}
	var got string
	if err := srv.Store.DB.QueryRow("SELECT avatar_url FROM users WHERE id='u1'").Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got == "" || !strings.HasPrefix(got, "/avatars/") {
		t.Fatalf("expected avatar static URL, got %q", got)
	}
	entries, err := os.ReadDir(srv.AvatarDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 avatar file after first upload, got %d", len(entries))
	}
	firstURL := got

	rr = doReq(t, h, http.MethodPost, "/api/profile/avatar", token, map[string]any{"avatar_url": smallPNG})
	if rr.Code != http.StatusOK {
		t.Fatalf("profile avatar second upload status=%d body=%s", rr.Code, rr.Body.String())
	}
	if err := srv.Store.DB.QueryRow("SELECT avatar_url FROM users WHERE id='u1'").Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got == firstURL {
		t.Fatalf("expected avatar URL version to change on reupload, got %q", got)
	}
	entries, err = os.ReadDir(srv.AvatarDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected old avatar file cleanup after replace, got %d files", len(entries))
	}

	rr = doReq(t, h, http.MethodPost, "/api/profile/avatar", token, map[string]any{"avatar_url": "data:text/plain;base64,SGk="})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid mime 400, got %d body=%s", rr.Code, rr.Body.String())
	}

	rr = doReq(t, h, http.MethodPost, "/api/profile/avatar", token, map[string]any{"avatar_url": ""})
	if rr.Code != http.StatusOK {
		t.Fatalf("clear avatar status=%d body=%s", rr.Code, rr.Body.String())
	}
	if err := srv.Store.DB.QueryRow("SELECT avatar_url FROM users WHERE id='u1'").Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("expected avatar cleared, got %q", got)
	}
	entries, err = os.ReadDir(srv.AvatarDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected avatar files cleaned on clear, got %d", len(entries))
	}
}

func TestAdminEndpoints_RoleAndRemovalGuards(t *testing.T) {
	srv, h := testServer(t)
	srv.AvatarDir = t.TempDir()
	addUser(t, srv.Store, "root", "root", "root_admin")
	addUser(t, srv.Store, "adm", "admin", "admin")
	addUser(t, srv.Store, "mem", "member", "member")
	tokRoot := sessionToken(srv.Secret, "root")
	tokAdmin := sessionToken(srv.Secret, "adm")
	smallPNG := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2jvKsAAAAASUVORK5CYII="
	upload := doReq(t, h, http.MethodPost, "/api/profile/avatar", tokAdmin, map[string]any{"avatar_url": smallPNG})
	if upload.Code != http.StatusOK {
		t.Fatalf("admin avatar upload expected 200, got %d body=%s", upload.Code, upload.Body.String())
	}

	rr := doReq(t, h, http.MethodPost, "/api/admin/role", tokAdmin, map[string]any{
		"user_id": "mem", "role": "admin",
	})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("non-root change role expected 403, got %d", rr.Code)
	}

	rr = doReq(t, h, http.MethodPost, "/api/admin/role", tokRoot, map[string]any{
		"user_id": "mem", "role": "admin",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("root change role expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}

	users, err := srv.Store.ListUsers()
	if err != nil {
		t.Fatal(err)
	}
	role := ""
	for _, u := range users {
		if u.ID == "mem" {
			role = u.Role
		}
	}
	if role != "admin" {
		t.Fatalf("expected updated role=admin, got %q", role)
	}

	rr = doReq(t, h, http.MethodPost, "/api/admin/remove-user", tokRoot, map[string]any{
		"user_id": "root",
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("remove self expected 400, got %d", rr.Code)
	}

	rr = doReq(t, h, http.MethodPost, "/api/admin/remove-user", tokRoot, map[string]any{
		"user_id": "adm",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("remove user expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}

	active, err := srv.Store.IsUserActive("adm")
	if err != nil {
		t.Fatal(err)
	}
	if active {
		t.Fatal("expected removed admin to be inactive")
	}
	entries, err := os.ReadDir(srv.AvatarDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected removed user's avatar file to be cleaned, got %d files", len(entries))
	}
}

func TestAuthRequiredForProtectedEndpoints(t *testing.T) {
	_, h := testServer(t)

	rr := doReq(t, h, http.MethodGet, "/api/messages", "", nil)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated messages list, got %d", rr.Code)
	}
	rr = doReq(t, h, http.MethodGet, "/api/members", "", nil)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated members list, got %d", rr.Code)
	}
	rr = doReq(t, h, http.MethodPost, "/api/profile/avatar", "", map[string]any{"avatar_url": ""})
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated avatar update, got %d", rr.Code)
	}
	rr = doReq(t, h, http.MethodPost, "/api/messages/read", "", map[string]any{"last_seen_rowid": 1})
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated read receipt, got %d", rr.Code)
	}
}

func TestMessageEndpointsRejectInvalidPayloads(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "u1", "alice", "member")
	token := sessionToken(srv.Secret, "u1")

	rr := doReq(t, h, http.MethodPost, "/api/messages/read", token, map[string]any{"last_seen_rowid": 0})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid read payload, got %d body=%s", rr.Code, rr.Body.String())
	}

	rr = doReq(t, h, http.MethodPost, "/api/messages/edit", token, map[string]any{"message_id": "", "ciphertext": "", "nonce": ""})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid edit payload, got %d body=%s", rr.Code, rr.Body.String())
	}

	rr = doReq(t, h, http.MethodPost, "/api/messages/delete", token, map[string]any{"message_id": ""})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid delete payload, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestMembersEndpointListsPresence(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "u1", "alice", "member")
	addUser(t, srv.Store, "u2", "bob", "member")
	srv.trackPresenceConnect("u2")
	token := sessionToken(srv.Secret, "u1")

	rr := doReq(t, h, http.MethodGet, "/api/members", token, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("members status=%d body=%s", rr.Code, rr.Body.String())
	}
	body := decodeBody(t, rr)
	members, ok := body["members"].([]any)
	if !ok || len(members) != 2 {
		t.Fatalf("expected 2 members, got %#v", body["members"])
	}
	onlineByID := map[string]bool{}
	for _, m := range members {
		item, ok := m.(map[string]any)
		if !ok {
			continue
		}
		onlineByID[item["id"].(string)] = item["online"] == true
	}
	if onlineByID["u1"] {
		t.Fatal("u1 should be offline in this test")
	}
	if !onlineByID["u2"] {
		t.Fatal("u2 should be online in this test")
	}
}

func TestMembersEndpointRejectsInactiveSessionUser(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "u1", "alice", "member")
	if err := srv.Store.DeactivateUser("u1"); err != nil {
		t.Fatal(err)
	}
	token := sessionToken(srv.Secret, "u1")

	rr := doReq(t, h, http.MethodGet, "/api/members", token, nil)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for inactive members session, got %d body=%s", rr.Code, rr.Body.String())
	}
}
