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
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	msgs, err := s.Store.ListRecentMessages(roomID, limit, beforeRowID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load messages"})
		return
	}
	receipts, err := s.Store.ListReadReceipts(roomID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load read receipts"})
		return
	}
	messageIDs := make([]string, 0, len(msgs))
	for _, m := range msgs {
		if id := strings.TrimSpace(m["id"]); id != "" {
			messageIDs = append(messageIDs, id)
		}
	}
	reactions, err := s.Store.ListMessageReactions(messageIDs, u.ID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load reactions"})
		return
	}
	myReactions := map[string][]string{}
	for messageID, emojis := range reactions.Mine {
		arr := make([]string, 0, len(emojis))
		for emoji := range emojis {
			arr = append(arr, emoji)
		}
		myReactions[messageID] = arr
	}
	pinnedIDs, err := s.Store.ListPinnedMessageIDs(roomID, 100)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load pinned messages"})
		return
	}
	writeJSON(w, 200, map[string]any{
		"room_id":               roomID,
		"messages":              msgs,
		"has_more":              len(msgs) >= limit,
		"receipts":              receipts,
		"reactions":             reactions.Counts,
		"reaction_authors":      reactions.Authors,
		"my_reactions":          myReactions,
		"pinned_ids":            pinnedIDs,
		"my_user_id":            u.ID,
		"my_chat_color":         u.ChatColor,
		"my_avatar_ring_color":  u.AvatarRingColor,
		"my_avatar_ring_color2": u.AvatarRingColor2,
		"my_avatar_ring_color3": u.AvatarRingColor3,
		"my_avatar_ring_color4": u.AvatarRingColor4,
		"my_avatar_ring_mode":   u.AvatarRingMode,
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
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	if err := s.Store.UpsertReadReceipt(roomID, u.ID, req.LastSeenRowID); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to mark read"})
		return
	}
	s.Hub.Broadcast(chat.Outbound{Type: "receipt", Data: map[string]string{
		"room_id":         roomID,
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
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	msg, err := s.Store.EditMessage(roomID, req.MessageID, u.ID, req.Ciphertext, req.Nonce)
	if err != nil {
		writeJSON(w, 404, map[string]string{"error": "message not found"})
		return
	}
	data := outboundMessageData(msg, "")
	data["room_id"] = roomID
	s.Hub.Broadcast(chat.Outbound{Type: "message_update", Data: data})
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
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	msg, err := s.Store.DeleteMessage(roomID, req.MessageID, u.ID, u.DisplayName, isAdminRole(u.Role))
	if err != nil {
		writeJSON(w, 404, map[string]string{"error": "message not found"})
		return
	}
	data := outboundMessageData(msg, "")
	data["room_id"] = roomID
	s.Hub.Broadcast(chat.Outbound{Type: "message_update", Data: data})
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) reactMessage(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	var req struct {
		MessageID string `json:"message_id"`
		Emoji     string `json:"emoji"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.MessageID = cleanInput(req.MessageID, maxMessageIDLen)
	req.Emoji = cleanInput(req.Emoji, 32)
	if req.MessageID == "" || req.Emoji == "" {
		writeJSON(w, 400, map[string]string{"error": "message_id and emoji required"})
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	exists, err := s.Store.MessageExists(roomID, req.MessageID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to process reaction"})
		return
	}
	if !exists {
		writeJSON(w, 404, map[string]string{"error": "message not found"})
		return
	}
	count, active, err := s.Store.ToggleMessageReaction(roomID, req.MessageID, u.ID, req.Emoji)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to process reaction"})
		return
	}
	s.Hub.Broadcast(chat.Outbound{Type: "reaction_update", Data: map[string]string{
		"room_id":      roomID,
		"message_id":   req.MessageID,
		"user_id":      u.ID,
		"display_name": u.DisplayName,
		"emoji":        req.Emoji,
		"count":        strconv.Itoa(count),
		"active":       boolToFlag(active),
	}})
	writeJSON(w, 200, map[string]any{"ok": true, "message_id": req.MessageID, "emoji": req.Emoji, "count": count, "active": active})
}

func (s *Server) pinnedMessages(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	ids, err := s.Store.ListPinnedMessageIDs(roomID, 100)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load pinned messages"})
		return
	}
	writeJSON(w, 200, map[string]any{"pinned_ids": ids})
}

func (s *Server) roomInfo(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	info, err := s.Store.GetRoomInfoByID(roomID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load room"})
		return
	}
	writeJSON(w, 200, info)
}
