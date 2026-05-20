package web

import (
	"encoding/json"
	"net/http"
	"testing"

	"veil/internal/db"
)

func decodeJSONBody(t *testing.T, rrBody []byte) map[string]any {
	t.Helper()
	out := map[string]any{}
	if err := json.Unmarshal(rrBody, &out); err != nil {
		t.Fatalf("failed to decode json body: %v body=%s", err, string(rrBody))
	}
	return out
}

func TestBootstrapInviteJoinSingleUseFlow(t *testing.T) {
	_, h := testServer(t)

	boot := doReq(t, h, http.MethodPost, "/api/bootstrap", "", map[string]any{
		"room_name":     "team",
		"display_name":  "owner",
		"public_key":    "pk-owner",
		"credential_id": "cred-owner",
		"room_key_enc":  "roomkey",
	})
	if boot.Code != http.StatusOK {
		t.Fatalf("bootstrap status=%d body=%s", boot.Code, boot.Body.String())
	}
	if len(boot.Result().Cookies()) == 0 {
		t.Fatal("expected bootstrap to set session cookie")
	}

	// Re-bootstrap should fail once initialized.
	boot2 := doReq(t, h, http.MethodPost, "/api/bootstrap", "", map[string]any{
		"room_name":     "team2",
		"display_name":  "owner2",
		"public_key":    "pk-owner2",
		"credential_id": "cred-owner2",
		"room_key_enc":  "roomkey2",
	})
	if boot2.Code != http.StatusConflict {
		t.Fatalf("expected 409 on second bootstrap, got %d body=%s", boot2.Code, boot2.Body.String())
	}

	ownerToken := boot.Result().Cookies()[0].Value
	inviteResp := doReq(t, h, http.MethodPost, "/api/invite", ownerToken, map[string]any{})
	if inviteResp.Code != http.StatusOK {
		t.Fatalf("create invite status=%d body=%s", inviteResp.Code, inviteResp.Body.String())
	}
	inviteData := decodeJSONBody(t, inviteResp.Body.Bytes())
	link, _ := inviteData["invite_link"].(string)
	if link == "" {
		t.Fatalf("expected invite_link in response: %#v", inviteData)
	}
	token := link[len("/invite/"):]

	join := doReq(t, h, http.MethodPost, "/api/join", "", map[string]any{
		"token":         token,
		"display_name":  "member1",
		"public_key":    "pk-m1",
		"credential_id": "cred-m1",
	})
	if join.Code != http.StatusOK {
		t.Fatalf("join status=%d body=%s", join.Code, join.Body.String())
	}
	joinData := decodeJSONBody(t, join.Body.Bytes())
	if joinData["room_key_enc"] != "roomkey" {
		t.Fatalf("expected room key to be returned, got %#v", joinData["room_key_enc"])
	}

	// Single-use invite must now fail.
	join2 := doReq(t, h, http.MethodPost, "/api/join", "", map[string]any{
		"token":         token,
		"display_name":  "member2",
		"public_key":    "pk-m2",
		"credential_id": "cred-m2",
	})
	if join2.Code != http.StatusForbidden {
		t.Fatalf("expected single-use invite to fail second join, got %d body=%s", join2.Code, join2.Body.String())
	}

	// Credential-based session restore should work for joined member.
	restore := doReq(t, h, http.MethodPost, "/api/session/from-credential", "", map[string]any{
		"credential_id": "cred-m1",
	})
	if restore.Code != http.StatusOK {
		t.Fatalf("session restore status=%d body=%s", restore.Code, restore.Body.String())
	}
}

func TestInviteJoinsTargetRoom(t *testing.T) {
	_, h := testServer(t)

	boot := doReq(t, h, http.MethodPost, "/api/bootstrap", "", map[string]any{
		"room_name":     "team",
		"display_name":  "owner",
		"public_key":    "pk-owner",
		"credential_id": "cred-owner",
		"room_key_enc":  "roomkey",
	})
	if boot.Code != http.StatusOK {
		t.Fatalf("bootstrap status=%d body=%s", boot.Code, boot.Body.String())
	}
	ownerToken := boot.Result().Cookies()[0].Value

	createRoom := doReq(t, h, http.MethodPost, "/api/rooms", ownerToken, map[string]any{
		"room_id":   "ops",
		"room_name": "Ops",
	})
	if createRoom.Code != http.StatusOK {
		t.Fatalf("create room status=%d body=%s", createRoom.Code, createRoom.Body.String())
	}

	inviteResp := doReq(t, h, http.MethodPost, "/api/invite?room_id=ops", ownerToken, map[string]any{})
	if inviteResp.Code != http.StatusOK {
		t.Fatalf("create invite status=%d body=%s", inviteResp.Code, inviteResp.Body.String())
	}
	inviteData := decodeJSONBody(t, inviteResp.Body.Bytes())
	link, _ := inviteData["invite_link"].(string)
	token := link[len("/invite/"):]

	join := doReq(t, h, http.MethodPost, "/api/join", "", map[string]any{
		"token":         token,
		"display_name":  "member1",
		"public_key":    "pk-m1",
		"credential_id": "cred-m1",
	})
	if join.Code != http.StatusOK {
		t.Fatalf("join status=%d body=%s", join.Code, join.Body.String())
	}
	joinData := decodeJSONBody(t, join.Body.Bytes())
	if joinData["room_id"] != "ops" {
		t.Fatalf("expected room_id=ops in join response, got %#v", joinData["room_id"])
	}

	var joinToken string
	for _, c := range join.Result().Cookies() {
		if c.Name == "veil_session" {
			joinToken = c.Value
			break
		}
	}
	if joinToken == "" {
		t.Fatal("expected join to set session cookie")
	}
	allowed := doReq(t, h, http.MethodGet, "/api/messages?room_id=ops", joinToken, nil)
	if allowed.Code != http.StatusOK {
		t.Fatalf("expected invited member room access, got %d body=%s", allowed.Code, allowed.Body.String())
	}
}

func TestAdminMessageRetentionPermissionsAndBehavior(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "root", "root", "root_admin")
	addUser(t, srv.Store, "member", "member", "member")
	rootTok := sessionToken(srv.Secret, "root")
	memberTok := sessionToken(srv.Secret, "member")

	if _, err := srv.Store.SaveMessage(db.DefaultRoomID, "root", "root", "ct1", "n1", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.Store.SaveMessage(db.DefaultRoomID, "member", "member", "ct2", "n2", ""); err != nil {
		t.Fatal(err)
	}

	deny := doReq(t, h, http.MethodPost, "/api/admin/messages/retain", memberTok, map[string]any{"keep_latest": 1})
	if deny.Code != http.StatusForbidden {
		t.Fatalf("expected member retain to be forbidden, got %d body=%s", deny.Code, deny.Body.String())
	}

	okRetain := doReq(t, h, http.MethodPost, "/api/admin/messages/retain", rootTok, map[string]any{"keep_latest": 1})
	if okRetain.Code != http.StatusOK {
		t.Fatalf("retain as root status=%d body=%s", okRetain.Code, okRetain.Body.String())
	}
	count, err := srv.Store.MessageCount()
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("expected 1 message after retain, got %d", count)
	}

	okClear := doReq(t, h, http.MethodPost, "/api/admin/messages/clear", rootTok, map[string]any{})
	if okClear.Code != http.StatusOK {
		t.Fatalf("clear as root status=%d body=%s", okClear.Code, okClear.Body.String())
	}
	count, err = srv.Store.MessageCount()
	if err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("expected 0 messages after clear, got %d", count)
	}
}

func TestAdminMessageRetentionScopedByRoom(t *testing.T) {
	srv, h := testServer(t)
	addUser(t, srv.Store, "root", "root", "root_admin")
	rootTok := sessionToken(srv.Secret, "root")

	if _, err := srv.Store.CreateRoom("ops", "Ops", db.DefaultRoomStatusText, "root"); err != nil {
		t.Fatal(err)
	}

	if _, err := srv.Store.SaveMessage(db.DefaultRoomID, "root", "root", "main-1", "n1", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.Store.SaveMessage(db.DefaultRoomID, "root", "root", "main-2", "n2", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.Store.SaveMessage("ops", "root", "root", "ops-1", "n3", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := srv.Store.SaveMessage("ops", "root", "root", "ops-2", "n4", ""); err != nil {
		t.Fatal(err)
	}

	retainOps := doReq(t, h, http.MethodPost, "/api/admin/messages/retain?room_id=ops", rootTok, map[string]any{"keep_latest": 1})
	if retainOps.Code != http.StatusOK {
		t.Fatalf("retain ops status=%d body=%s", retainOps.Code, retainOps.Body.String())
	}
	opsCount, err := srv.Store.MessageCountInRoom("ops")
	if err != nil {
		t.Fatal(err)
	}
	if opsCount != 1 {
		t.Fatalf("expected 1 ops message after retain, got %d", opsCount)
	}
	mainCount, err := srv.Store.MessageCountInRoom(db.DefaultRoomID)
	if err != nil {
		t.Fatal(err)
	}
	if mainCount != 2 {
		t.Fatalf("expected main room unaffected at 2, got %d", mainCount)
	}

	clearMain := doReq(t, h, http.MethodPost, "/api/admin/messages/clear?room_id=main", rootTok, map[string]any{})
	if clearMain.Code != http.StatusOK {
		t.Fatalf("clear main status=%d body=%s", clearMain.Code, clearMain.Body.String())
	}
	mainCount, err = srv.Store.MessageCountInRoom(db.DefaultRoomID)
	if err != nil {
		t.Fatal(err)
	}
	if mainCount != 0 {
		t.Fatalf("expected main room cleared to 0, got %d", mainCount)
	}
	opsCount, err = srv.Store.MessageCountInRoom("ops")
	if err != nil {
		t.Fatal(err)
	}
	if opsCount != 1 {
		t.Fatalf("expected ops room unchanged at 1, got %d", opsCount)
	}
}
