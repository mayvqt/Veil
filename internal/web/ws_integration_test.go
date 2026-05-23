package web

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"veil/internal/auth"
	"veil/internal/db"

	"github.com/gorilla/websocket"
)

func TestWebSocketTypingAndMessageBroadcast(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skipf("skipping websocket integration test in restricted environment: %v", err)
		return
	}
	_ = ln.Close()
	store, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.DB.Exec("INSERT INTO users (id, display_name, role, active, created_at) VALUES (?, ?, ?, 1, ?)", "u1", "alice", "member", time.Now().UTC().Format(time.RFC3339)); err != nil {
		t.Fatal(err)
	}
	if _, err := store.DB.Exec("INSERT OR IGNORE INTO room_memberships (room_id, user_id, joined_at) VALUES (?, ?, ?)", db.DefaultRoomID, "u1", time.Now().UTC().Format(time.RFC3339)); err != nil {
		t.Fatal(err)
	}
	srv := New(store)
	srv.Secret = "test-secret"
	srv.SessionMaxAge = 24 * time.Hour

	ts := httptest.NewServer(srv.Routes())
	defer ts.Close()

	u, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatal(err)
	}
	wsURL := "ws://" + u.Host + "/ws"
	token := auth.Sign(auth.NewSession("u1"), srv.Secret)
	header := http.Header{}
	header.Set("Cookie", "veil_session="+token)
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(4 * time.Second))

	if err := conn.WriteJSON(map[string]any{"type": "typing", "typing": true}); err != nil {
		t.Fatal(err)
	}
	for {
		var typing struct {
			Type string            `json:"type"`
			Data map[string]string `json:"data"`
		}
		if err := conn.ReadJSON(&typing); err != nil {
			t.Fatal(err)
		}
		if typing.Type != "typing" {
			continue
		}
		if typing.Data["typing"] != "1" || typing.Data["user_id"] != "u1" {
			t.Fatalf("unexpected typing event: %#v", typing)
		}
		break
	}

	if err := conn.WriteJSON(map[string]any{
		"type":          "message",
		"ciphertext":    "ct",
		"nonce":         "n",
		"client_msg_id": "c1",
	}); err != nil {
		t.Fatal(err)
	}
	for {
		var evt struct {
			Type string            `json:"type"`
			Data map[string]string `json:"data"`
		}
		if err := conn.ReadJSON(&evt); err != nil {
			t.Fatal(err)
		}
		if evt.Type != "message" {
			continue
		}
		if evt.Data["ciphertext"] != "ct" || evt.Data["nonce"] != "n" || evt.Data["client_msg_id"] != "c1" {
			t.Fatalf("unexpected message event payload: %#v", evt)
		}
		if evt.Data["row_id"] == "" || evt.Data["id"] == "" {
			t.Fatalf("expected row_id/id in message event: %#v", evt)
		}
		break
	}
}

func TestWebSocketRejectsInvalidSession(t *testing.T) {
	if os.Getenv("SKIP_WS_INTEGRATION") == "1" {
		t.Skip("SKIP_WS_INTEGRATION enabled")
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skipf("skipping websocket integration test in restricted environment: %v", err)
		return
	}
	_ = ln.Close()
	store, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	srv := New(store)
	srv.Secret = "test-secret"
	ts := httptest.NewServer(srv.Routes())
	defer ts.Close()

	u, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatal(err)
	}
	wsURL := "ws://" + u.Host + "/ws"
	header := http.Header{}
	header.Set("Cookie", "veil_session=bad-token")
	_, resp, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err == nil {
		t.Fatal("expected websocket dial with bad token to fail")
	}
	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		if resp == nil {
			t.Fatalf("expected 401 response, got nil response and err=%v", err)
		}
		t.Fatalf("expected 401 response, got %d", resp.StatusCode)
	}
}

func TestWSRequestOrigin(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "http://example.test/ws", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "veil.example")
	if got := requestOrigin(req); got != "https://veil.example" {
		t.Fatalf("unexpected origin: %q", got)
	}
	raw, _ := json.Marshal(map[string]string{"origin": requestOrigin(req)})
	if len(raw) == 0 {
		t.Fatal("sanity")
	}
}
