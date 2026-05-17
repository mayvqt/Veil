package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

var httpClient = &http.Client{Timeout: 15 * time.Second}

func connectSession(base, cred string) (*websocket.Conn, string, string, error) {
	if strings.TrimSpace(base) == "" {
		base = getenv("VEIL_BASE", "http://127.0.0.1:3847")
	}
	b, _ := json.Marshal(map[string]string{"credential_id": cred})
	r, err := httpClient.Post(base+"/api/tui/session", "application/json", bytes.NewReader(b))
	if err != nil {
		return nil, base, "", err
	}
	defer r.Body.Close()
	if r.StatusCode >= 300 {
		return nil, base, "", fmt.Errorf("%s", r.Status)
	}

	var sess struct {
		Session string `json:"session"`
	}
	_ = json.NewDecoder(r.Body).Decode(&sess)

	wsURL := strings.Replace(base, "http://", "ws://", 1)
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	wsURL += "/ws"
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+sess.Session)
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		return nil, base, "", err
	}
	return ws, base, sess.Session, nil
}

func fetchHistory(base, sessionToken string, roomKey []byte) []line {
	req, err := http.NewRequest(http.MethodGet, base+"/api/messages", nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Authorization", "Bearer "+sessionToken)
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil
	}

	var payload struct {
		Messages []struct {
			ID          string `json:"id"`
			DisplayName string `json:"display_name"`
			Ciphertext  string `json:"ciphertext"`
			Nonce       string `json:"nonce"`
			CreatedAt   string `json:"created_at"`
		} `json:"messages"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil
	}
	if len(payload.Messages) == 0 {
		return nil
	}

	out := make([]line, 0, len(payload.Messages))
	for i := len(payload.Messages) - 1; i >= 0; i-- {
		m := payload.Messages[i]
		out = append(out, line{id: m.ID, user: m.DisplayName, text: decryptMessage(roomKey, m.Nonce, m.Ciphertext), createdAt: m.CreatedAt})
	}
	return out
}

func fetchRoomName(base, sessionToken string) string {
	req, err := http.NewRequest(http.MethodGet, base+"/api/room", nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Bearer "+sessionToken)
	resp, err := httpClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return ""
	}
	var payload struct {
		RoomName string `json:"room_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return ""
	}
	return strings.TrimSpace(payload.RoomName)
}
