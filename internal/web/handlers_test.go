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
	if _, err := store.DB.Exec("INSERT OR IGNORE INTO room_memberships (room_id, user_id, joined_at) VALUES (?, ?, ?)", db.DefaultRoomID, id, time.Now().UTC().Format(time.RFC3339)); err != nil {
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

	m1, err := srv.Store.SaveMessage(db.DefaultRoomID, "u1", "alice", "ct1", "n1", "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = srv.Store.SaveMessage(db.DefaultRoomID, "u2", "bob", "ct2", "n2", m1.ID)
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
	receipts, err := srv.Store.ListReadReceipts(db.DefaultRoomID)
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

func TestMessageReactionsPinsAndAuditEndpoints(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "root", "root", "root_admin")
	addUser(t, srv.Store, "u1", "alice", "member")
	rootTok := sessionToken(srv.Secret, "root")
	userTok := sessionToken(srv.Secret, "u1")

	msg, err := srv.Store.SaveMessage(db.DefaultRoomID, "u1", "alice", "ct1", "n1", "")
	if err != nil {
		t.Fatal(err)
	}

	rr := doReq(t, h, http.MethodPost, "/api/messages/react", userTok, map[string]any{
		"message_id": msg.ID,
		"emoji":      "👍",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("react status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = doReq(t, h, http.MethodGet, "/api/messages?limit=20", userTok, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("list messages with reactions status=%d body=%s", rr.Code, rr.Body.String())
	}
	list := decodeBody(t, rr)
	if _, ok := list["reactions"]; !ok {
		t.Fatalf("expected reactions in list response, got %#v", list)
	}
	authors, ok := list["reaction_authors"].(map[string]any)
	if !ok {
		t.Fatalf("expected reaction_authors in list response, got %#v", list)
	}
	byEmoji, ok := authors[msg.ID].(map[string]any)
	if !ok {
		t.Fatalf("expected reaction authors for message %s, got %#v", msg.ID, authors)
	}
	reactors, ok := byEmoji["👍"].([]any)
	if !ok || len(reactors) != 1 {
		t.Fatalf("expected one reaction author for emoji, got %#v", byEmoji["👍"])
	}
	reactor, ok := reactors[0].(map[string]any)
	if !ok || reactor["display_name"] != "alice" || reactor["user_id"] != "u1" {
		t.Fatalf("expected alice as reaction author, got %#v", reactors[0])
	}

	rr = doReq(t, h, http.MethodPost, "/api/admin/pin-message", userTok, map[string]any{
		"message_id": msg.ID,
		"pin":        true,
	})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("member pin should be forbidden, got %d body=%s", rr.Code, rr.Body.String())
	}

	rr = doReq(t, h, http.MethodPost, "/api/admin/pin-message", rootTok, map[string]any{
		"message_id": msg.ID,
		"pin":        true,
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("root pin status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = doReq(t, h, http.MethodGet, "/api/messages/pins", userTok, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("pins list status=%d body=%s", rr.Code, rr.Body.String())
	}
	pins := decodeBody(t, rr)
	ids, ok := pins["pinned_ids"].([]any)
	if !ok || len(ids) == 0 {
		t.Fatalf("expected pinned_ids to include one message, got %#v", pins["pinned_ids"])
	}

	rr = doReq(t, h, http.MethodGet, "/api/admin/audit", rootTok, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("audit status=%d body=%s", rr.Code, rr.Body.String())
	}
	audit := decodeBody(t, rr)
	items, ok := audit["items"].([]any)
	if !ok || len(items) == 0 {
		t.Fatalf("expected audit items, got %#v", audit["items"])
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

func TestProfileAvatarRingEndpointPersistsRing(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "u1", "alice", "member")
	token := sessionToken(srv.Secret, "u1")

	rr := doReq(t, h, http.MethodPost, "/api/profile/avatar-ring", token, map[string]any{
		"avatar_ring_color":  "#78B2FF80",
		"avatar_ring_color2": "#FF78B2",
		"avatar_ring_color3": "#57DB84",
		"avatar_ring_color4": "#9D7BFF",
		"avatar_ring_mode":   "rainbow",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("profile avatar ring status=%d body=%s", rr.Code, rr.Body.String())
	}

	var color, color2, color3, color4, mode string
	if err := srv.Store.DB.QueryRow("SELECT avatar_ring_color, avatar_ring_color2, avatar_ring_color3, avatar_ring_color4, avatar_ring_mode FROM users WHERE id='u1'").Scan(&color, &color2, &color3, &color4, &mode); err != nil {
		t.Fatal(err)
	}
	if color != "#78b2ff80" || color2 != "#ff78b2" || color3 != "#57db84" || color4 != "#9d7bff" || mode != "rainbow" {
		t.Fatalf("expected persisted rainbow ring colors, got %q/%q/%q/%q/%q", color, color2, color3, color4, mode)
	}

	rr = doReq(t, h, http.MethodPost, "/api/profile/avatar-ring", token, map[string]any{
		"avatar_ring_color": "#78b2ff",
		"avatar_ring_mode":  "spin",
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid ring mode 400, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestMessagesRoomIsolationAndMembership(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "u1", "alice", "member")
	addUser(t, srv.Store, "u2", "bob", "member")
	if _, err := srv.Store.DB.Exec("INSERT INTO rooms (id, name, status_text, created_by, created_at) VALUES ('alpha', 'Alpha', 'encrypted room', 'u1', ?)", time.Now().UTC().Format(time.RFC3339)); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.Store.DB.Exec("INSERT INTO room_memberships (room_id, user_id, joined_at) VALUES ('alpha', 'u1', ?)", time.Now().UTC().Format(time.RFC3339)); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.Store.SaveMessage("alpha", "u1", "alice", "ct-alpha", "n-alpha", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.Store.SaveMessage(db.DefaultRoomID, "u1", "alice", "ct-main", "n-main", ""); err != nil {
		t.Fatal(err)
	}

	u1Tok := sessionToken(srv.Secret, "u1")
	u2Tok := sessionToken(srv.Secret, "u2")

	rr := doReq(t, h, http.MethodGet, "/api/messages?room_id=alpha", u1Tok, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected u1 alpha access status 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	alpha := decodeBody(t, rr)
	msgs, ok := alpha["messages"].([]any)
	if !ok || len(msgs) != 1 {
		t.Fatalf("expected 1 alpha message, got %#v", alpha["messages"])
	}

	rr = doReq(t, h, http.MethodGet, "/api/messages?room_id=alpha", u2Tok, nil)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected u2 alpha access 403, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestRoomsCreateAndJoinFlow(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "admin", "admin", "admin")
	addUser(t, srv.Store, "member", "member", "member")
	adminTok := sessionToken(srv.Secret, "admin")
	memberTok := sessionToken(srv.Secret, "member")

	create := doReq(t, h, http.MethodPost, "/api/rooms", adminTok, map[string]any{
		"room_id":   "ops",
		"room_name": "Ops Room",
	})
	if create.Code != http.StatusOK {
		t.Fatalf("create room status=%d body=%s", create.Code, create.Body.String())
	}

	rooms := doReq(t, h, http.MethodGet, "/api/rooms", adminTok, nil)
	if rooms.Code != http.StatusOK {
		t.Fatalf("list rooms status=%d body=%s", rooms.Code, rooms.Body.String())
	}

	forbidden := doReq(t, h, http.MethodGet, "/api/messages?room_id=ops", memberTok, nil)
	if forbidden.Code != http.StatusForbidden {
		t.Fatalf("expected member blocked from ops before join, got %d body=%s", forbidden.Code, forbidden.Body.String())
	}

	join := doReq(t, h, http.MethodPost, "/api/rooms/join", memberTok, map[string]any{"room_id": "ops"})
	if join.Code != http.StatusOK {
		t.Fatalf("join room status=%d body=%s", join.Code, join.Body.String())
	}

	allowed := doReq(t, h, http.MethodGet, "/api/messages?room_id=ops", memberTok, nil)
	if allowed.Code != http.StatusOK {
		t.Fatalf("expected member access after join, got %d body=%s", allowed.Code, allowed.Body.String())
	}
}

func TestAdminInvitesScopedByRoom(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "admin", "admin", "admin")
	adminTok := sessionToken(srv.Secret, "admin")

	if _, err := srv.Store.CreateRoom("ops", "Ops", db.DefaultRoomStatusText, "admin"); err != nil {
		t.Fatal(err)
	}

	// One invite in main, one in ops.
	if _, err := srv.Store.CreateInvite(db.DefaultRoomID, "h-main", "admin", 24, 1); err != nil {
		t.Fatal(err)
	}
	opsInviteID, err := srv.Store.CreateInvite("ops", "h-ops", "admin", 24, 1)
	if err != nil {
		t.Fatal(err)
	}

	mainList := doReq(t, h, http.MethodGet, "/api/admin/invites?room_id=main", adminTok, nil)
	if mainList.Code != http.StatusOK {
		t.Fatalf("main list status=%d body=%s", mainList.Code, mainList.Body.String())
	}
	mainData := decodeBody(t, mainList)
	mainInvites, ok := mainData["invites"].([]any)
	if !ok || len(mainInvites) != 1 {
		t.Fatalf("expected 1 main invite, got %#v", mainData["invites"])
	}

	opsList := doReq(t, h, http.MethodGet, "/api/admin/invites?room_id=ops", adminTok, nil)
	if opsList.Code != http.StatusOK {
		t.Fatalf("ops list status=%d body=%s", opsList.Code, opsList.Body.String())
	}
	opsData := decodeBody(t, opsList)
	opsInvites, ok := opsData["invites"].([]any)
	if !ok || len(opsInvites) != 1 {
		t.Fatalf("expected 1 ops invite, got %#v", opsData["invites"])
	}

	// Revoking in ops should not affect main.
	revoke := doReq(t, h, http.MethodPost, "/api/admin/revoke-invite?room_id=ops", adminTok, map[string]any{"invite_id": opsInviteID})
	if revoke.Code != http.StatusOK {
		t.Fatalf("revoke invite status=%d body=%s", revoke.Code, revoke.Body.String())
	}

	mainList2 := doReq(t, h, http.MethodGet, "/api/admin/invites?room_id=main", adminTok, nil)
	if mainList2.Code != http.StatusOK {
		t.Fatalf("main list2 status=%d body=%s", mainList2.Code, mainList2.Body.String())
	}
	mainData2 := decodeBody(t, mainList2)
	mainInvites2, ok := mainData2["invites"].([]any)
	if !ok || len(mainInvites2) != 1 {
		t.Fatalf("expected main invite unaffected, got %#v", mainData2["invites"])
	}
	mainItem, ok := mainInvites2[0].(map[string]any)
	if !ok {
		t.Fatalf("expected map invite item, got %#v", mainInvites2[0])
	}
	if mainItem["revoked"] == true {
		t.Fatalf("main invite should not be revoked, got %#v", mainItem)
	}
}

func TestAdminAuditScopedByRoomAndAllRoomsPermission(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "root", "root", "root_admin")
	addUser(t, srv.Store, "admin", "admin", "admin")
	rootTok := sessionToken(srv.Secret, "root")
	adminTok := sessionToken(srv.Secret, "admin")

	if _, err := srv.Store.CreateRoom("ops", "Ops", db.DefaultRoomStatusText, "root"); err != nil {
		t.Fatal(err)
	}
	if err := srv.Store.AddUserToRoom("ops", "admin"); err != nil {
		t.Fatal(err)
	}
	if err := srv.Store.AddAdminAudit("root", "root", "room_rename", db.DefaultRoomID, "main title"); err != nil {
		t.Fatal(err)
	}
	if err := srv.Store.AddAdminAudit("root", "root", "room_rename", "ops", "ops title"); err != nil {
		t.Fatal(err)
	}

	mainAudit := doReq(t, h, http.MethodGet, "/api/admin/audit?room_id=main", adminTok, nil)
	if mainAudit.Code != http.StatusOK {
		t.Fatalf("main audit status=%d body=%s", mainAudit.Code, mainAudit.Body.String())
	}
	mainData := decodeBody(t, mainAudit)
	mainItems, ok := mainData["items"].([]any)
	if !ok || len(mainItems) != 1 {
		t.Fatalf("expected 1 main audit item, got %#v", mainData["items"])
	}

	opsAudit := doReq(t, h, http.MethodGet, "/api/admin/audit?room_id=ops", adminTok, nil)
	if opsAudit.Code != http.StatusOK {
		t.Fatalf("ops audit status=%d body=%s", opsAudit.Code, opsAudit.Body.String())
	}
	opsData := decodeBody(t, opsAudit)
	opsItems, ok := opsData["items"].([]any)
	if !ok || len(opsItems) != 1 {
		t.Fatalf("expected 1 ops audit item, got %#v", opsData["items"])
	}

	adminAllRooms := doReq(t, h, http.MethodGet, "/api/admin/audit?all_rooms=1", adminTok, nil)
	if adminAllRooms.Code != http.StatusForbidden {
		t.Fatalf("expected admin all_rooms forbidden, got %d body=%s", adminAllRooms.Code, adminAllRooms.Body.String())
	}

	rootAllRooms := doReq(t, h, http.MethodGet, "/api/admin/audit?all_rooms=1", rootTok, nil)
	if rootAllRooms.Code != http.StatusOK {
		t.Fatalf("expected root all_rooms ok, got %d body=%s", rootAllRooms.Code, rootAllRooms.Body.String())
	}
	rootData := decodeBody(t, rootAllRooms)
	rootItems, ok := rootData["items"].([]any)
	if !ok || len(rootItems) < 2 {
		t.Fatalf("expected root to see all audit items, got %#v", rootData["items"])
	}
}

func TestRoomModeratorPermissionsAndAssignmentGuards(t *testing.T) {
	srv, h := testServer(t)
	srv.MediaDir = t.TempDir()
	addUser(t, srv.Store, "root", "root", "root_admin")
	addUser(t, srv.Store, "mod", "mod", "member")
	addUser(t, srv.Store, "member", "member", "member")
	rootTok := sessionToken(srv.Secret, "root")
	modTok := sessionToken(srv.Secret, "mod")
	memberTok := sessionToken(srv.Secret, "member")
	smallPNG := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2jvKsAAAAASUVORK5CYII="

	if _, err := srv.Store.CreateRoom("ops", "Ops", db.DefaultRoomStatusText, "root"); err != nil {
		t.Fatal(err)
	}
	if err := srv.Store.AddUserToRoom("ops", "mod"); err != nil {
		t.Fatal(err)
	}
	if err := srv.Store.AddUserToRoom("ops", "member"); err != nil {
		t.Fatal(err)
	}

	denyAssign := doReq(t, h, http.MethodPost, "/api/admin/room-role?room_id=ops", memberTok, map[string]any{"user_id": "mod", "role": "moderator"})
	if denyAssign.Code != http.StatusForbidden {
		t.Fatalf("member should not assign room roles, got %d body=%s", denyAssign.Code, denyAssign.Body.String())
	}

	assign := doReq(t, h, http.MethodPost, "/api/admin/room-role?room_id=ops", rootTok, map[string]any{"user_id": "mod", "role": "moderator"})
	if assign.Code != http.StatusOK {
		t.Fatalf("root assign moderator status=%d body=%s", assign.Code, assign.Body.String())
	}

	// Moderator can create invite in their room.
	invite := doReq(t, h, http.MethodPost, "/api/invite?room_id=ops", modTok, map[string]any{})
	if invite.Code != http.StatusOK {
		t.Fatalf("moderator invite create status=%d body=%s", invite.Code, invite.Body.String())
	}

	// Moderator can upload custom media in their room.
	up := doReq(t, h, http.MethodPost, "/api/admin/custom-media?room_id=ops", modTok, map[string]any{
		"kind": "emoji", "name": "ops_mod_blob", "data_url": smallPNG,
	})
	if up.Code != http.StatusOK {
		t.Fatalf("moderator custom media upload status=%d body=%s", up.Code, up.Body.String())
	}

	clear := doReq(t, h, http.MethodPost, "/api/admin/room-role/clear?room_id=ops", rootTok, map[string]any{"user_id": "mod"})
	if clear.Code != http.StatusOK {
		t.Fatalf("root clear moderator status=%d body=%s", clear.Code, clear.Body.String())
	}

	inviteAfterClear := doReq(t, h, http.MethodPost, "/api/invite?room_id=ops", modTok, map[string]any{})
	if inviteAfterClear.Code != http.StatusForbidden {
		t.Fatalf("expected moderator permissions removed, got %d body=%s", inviteAfterClear.Code, inviteAfterClear.Body.String())
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

func TestCustomMediaUploadListDelete(t *testing.T) {
	srv, h := testServer(t)
	srv.MediaDir = t.TempDir()
	addUser(t, srv.Store, "root", "root", "root_admin")
	addUser(t, srv.Store, "u1", "alice", "member")
	rootTok := sessionToken(srv.Secret, "root")
	userTok := sessionToken(srv.Secret, "u1")
	smallPNG := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2jvKsAAAAASUVORK5CYII="
	if _, err := srv.Store.CreateRoom("ops", "Ops", db.DefaultRoomStatusText, "root"); err != nil {
		t.Fatal(err)
	}
	if err := srv.Store.AddUserToRoom("ops", "root"); err != nil {
		t.Fatal(err)
	}

	deny := doReq(t, h, http.MethodPost, "/api/admin/custom-media", userTok, map[string]any{
		"kind": "emoji", "name": "party_blob", "data_url": smallPNG,
	})
	if deny.Code != http.StatusForbidden {
		t.Fatalf("member custom media upload should be forbidden, got %d body=%s", deny.Code, deny.Body.String())
	}

	up := doReq(t, h, http.MethodPost, "/api/admin/custom-media?room_id=main", rootTok, map[string]any{
		"kind": "emoji", "name": "party_blob", "data_url": smallPNG,
	})
	if up.Code != http.StatusOK {
		t.Fatalf("admin custom media upload status=%d body=%s", up.Code, up.Body.String())
	}
	upOps := doReq(t, h, http.MethodPost, "/api/admin/custom-media?room_id=ops", rootTok, map[string]any{
		"kind": "emoji", "name": "ops_blob", "data_url": smallPNG,
	})
	if upOps.Code != http.StatusOK {
		t.Fatalf("admin custom media upload ops status=%d body=%s", upOps.Code, upOps.Body.String())
	}

	list := doReq(t, h, http.MethodGet, "/api/custom-media?room_id=main", userTok, nil)
	if list.Code != http.StatusOK {
		t.Fatalf("custom media list status=%d body=%s", list.Code, list.Body.String())
	}
	body := decodeBody(t, list)
	items, ok := body["items"].([]any)
	if !ok || len(items) == 0 {
		t.Fatalf("expected at least one custom media item, got %#v", body["items"])
	}
	firstItem, ok := items[0].(map[string]any)
	if !ok || firstItem["name"] != "party_blob" {
		t.Fatalf("expected main room media only, got %#v", items)
	}

	denyOpsList := doReq(t, h, http.MethodGet, "/api/custom-media?room_id=ops", userTok, nil)
	if denyOpsList.Code != http.StatusForbidden {
		t.Fatalf("expected non-member ops list forbidden, got %d body=%s", denyOpsList.Code, denyOpsList.Body.String())
	}

	del := doReq(t, h, http.MethodDelete, "/api/admin/custom-media/party_blob?kind=emoji&room_id=main", rootTok, nil)
	if del.Code != http.StatusOK {
		t.Fatalf("custom media delete status=%d body=%s", del.Code, del.Body.String())
	}
	opsList := doReq(t, h, http.MethodGet, "/api/custom-media?room_id=ops", rootTok, nil)
	if opsList.Code != http.StatusOK {
		t.Fatalf("ops list status=%d body=%s", opsList.Code, opsList.Body.String())
	}
	opsBody := decodeBody(t, opsList)
	opsItems, ok := opsBody["items"].([]any)
	if !ok || len(opsItems) != 1 {
		t.Fatalf("expected ops media untouched, got %#v", opsBody["items"])
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

func TestAdminRoomNameUpdate(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "root", "root", "root_admin")
	addUser(t, srv.Store, "adm", "admin", "admin")
	addUser(t, srv.Store, "mem", "member", "member")
	tokRoot := sessionToken(srv.Secret, "root")
	tokAdmin := sessionToken(srv.Secret, "adm")
	tokMember := sessionToken(srv.Secret, "mem")

	rr := doReq(t, h, http.MethodPost, "/api/admin/room-name", tokMember, map[string]any{"room_name": "Nope"})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("member room rename expected 403, got %d body=%s", rr.Code, rr.Body.String())
	}

	rr = doReq(t, h, http.MethodPost, "/api/admin/room-name", tokAdmin, map[string]any{"room_name": "Team Alpha"})
	if rr.Code != http.StatusOK {
		t.Fatalf("admin room rename expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	gotName, err := srv.Store.GetRoomName()
	if err != nil {
		t.Fatal(err)
	}
	if gotName != "Team Alpha" {
		t.Fatalf("expected room name Team Alpha, got %q", gotName)
	}
	roomInfo := doReq(t, h, http.MethodGet, "/api/room", tokAdmin, nil)
	if roomInfo.Code != http.StatusOK {
		t.Fatalf("room info expected 200, got %d body=%s", roomInfo.Code, roomInfo.Body.String())
	}
	roomPayload := decodeJSONBody(t, roomInfo.Body.Bytes())
	if roomPayload["room_name"] != "Team Alpha" {
		t.Fatalf("expected room info room_name Team Alpha, got %#v", roomPayload["room_name"])
	}

	rr = doReq(t, h, http.MethodPost, "/api/admin/room-status-text", tokMember, map[string]any{"room_status_text": "Quiet mode"})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("member room status text expected 403, got %d body=%s", rr.Code, rr.Body.String())
	}
	rr = doReq(t, h, http.MethodPost, "/api/admin/room-status-text", tokAdmin, map[string]any{"room_status_text": "Quiet mode"})
	if rr.Code != http.StatusOK {
		t.Fatalf("admin room status text expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	gotStatusText, err := srv.Store.GetRoomStatusText()
	if err != nil {
		t.Fatal(err)
	}
	if gotStatusText != "Quiet mode" {
		t.Fatalf("expected room status text Quiet mode, got %q", gotStatusText)
	}
	roomInfo = doReq(t, h, http.MethodGet, "/api/room", tokAdmin, nil)
	if roomInfo.Code != http.StatusOK {
		t.Fatalf("room info expected 200, got %d body=%s", roomInfo.Code, roomInfo.Body.String())
	}
	roomPayload = decodeJSONBody(t, roomInfo.Body.Bytes())
	if roomPayload["room_status_text"] != "Quiet mode" {
		t.Fatalf("expected room info room_status_text Quiet mode, got %#v", roomPayload["room_status_text"])
	}
	rr = doReq(t, h, http.MethodPost, "/api/admin/room-status-text", tokRoot, map[string]any{"room_status_text": "   "})
	if rr.Code != http.StatusOK {
		t.Fatalf("blank room status text reset expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	gotStatusText, err = srv.Store.GetRoomStatusText()
	if err != nil {
		t.Fatal(err)
	}
	if gotStatusText != db.DefaultRoomStatusText {
		t.Fatalf("expected blank room status text to reset to default, got %q", gotStatusText)
	}

	rr = doReq(t, h, http.MethodPost, "/api/admin/room-name", tokRoot, map[string]any{"room_name": "   "})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("blank room rename expected 400, got %d body=%s", rr.Code, rr.Body.String())
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
	ringByID := map[string]string{}
	for _, m := range members {
		item, ok := m.(map[string]any)
		if !ok {
			continue
		}
		onlineByID[item["id"].(string)] = item["online"] == true
		ringByID[item["id"].(string)] = item["avatar_ring_mode"].(string)
	}
	if onlineByID["u1"] {
		t.Fatal("u1 should be offline in this test")
	}
	if !onlineByID["u2"] {
		t.Fatal("u2 should be online in this test")
	}
	if ringByID["u1"] != "none" {
		t.Fatalf("expected default ring mode none, got %q", ringByID["u1"])
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
