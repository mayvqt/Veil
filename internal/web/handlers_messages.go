package web

import (
	"net/http"
	"strconv"
	"strings"

	"veil/internal/chat"
)

func (s *Server) listMessages(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	limit := 50
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	var beforeRowID int64
	if raw := strings.TrimSpace(r.URL.Query().Get("before_rowid")); raw != "" {
		if n, err := strconv.ParseInt(raw, 10, 64); err == nil && n > 0 {
			beforeRowID = n
		}
	}
	msgs, err := s.Store.ListRecentMessages(limit, beforeRowID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load messages"})
		return
	}
	receipts, _ := s.Store.ListReadReceipts()
	writeJSON(w, 200, map[string]any{
		"messages":   msgs,
		"has_more":   len(msgs) >= limit,
		"receipts":   receipts,
		"my_user_id": u.ID,
	})
}

func (s *Server) markMessagesRead(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	var req struct {
		LastSeenRowID int64 `json:"last_seen_rowid"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	if req.LastSeenRowID <= 0 {
		writeJSON(w, 400, map[string]string{"error": "last_seen_rowid must be > 0"})
		return
	}
	if err := s.Store.UpsertReadReceipt(u.ID, req.LastSeenRowID); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to mark read"})
		return
	}
	s.Hub.Broadcast(chat.Outbound{Type: "receipt", Data: map[string]string{
		"user_id":         u.ID,
		"display_name":    u.DisplayName,
		"last_seen_rowid": strconv.FormatInt(req.LastSeenRowID, 10),
	}})
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) editMessage(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	var req struct {
		MessageID  string `json:"message_id"`
		Ciphertext string `json:"ciphertext"`
		Nonce      string `json:"nonce"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.MessageID = cleanInput(req.MessageID, maxMessageIDLen)
	req.Ciphertext = cleanInput(req.Ciphertext, maxCiphertextLen)
	req.Nonce = cleanInput(req.Nonce, maxNonceLen)
	if req.MessageID == "" || req.Ciphertext == "" || req.Nonce == "" {
		writeJSON(w, 400, map[string]string{"error": "message_id, ciphertext, nonce required"})
		return
	}
	msg, err := s.Store.EditMessage(req.MessageID, u.ID, req.Ciphertext, req.Nonce)
	if err != nil {
		writeJSON(w, 404, map[string]string{"error": "message not found"})
		return
	}
	s.Hub.Broadcast(chat.Outbound{Type: "message_update", Data: outboundMessageData(msg, "")})
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) deleteMessage(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	var req struct {
		MessageID string `json:"message_id"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.MessageID = cleanInput(req.MessageID, maxMessageIDLen)
	if req.MessageID == "" {
		writeJSON(w, 400, map[string]string{"error": "message_id required"})
		return
	}
	msg, err := s.Store.DeleteMessage(req.MessageID, u.ID)
	if err != nil {
		writeJSON(w, 404, map[string]string{"error": "message not found"})
		return
	}
	s.Hub.Broadcast(chat.Outbound{Type: "message_update", Data: outboundMessageData(msg, "")})
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) roomInfo(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAPIUser(w, r); !ok {
		return
	}
	roomName, err := s.Store.GetRoomName()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load room"})
		return
	}
	writeJSON(w, 200, map[string]any{"room_name": roomName})
}
