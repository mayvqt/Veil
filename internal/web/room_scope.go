package web

import (
	"net/http"
	"strings"

	"veil/internal/db"
)

func roomIDFromRequest(r *http.Request) string {
	roomID := strings.TrimSpace(r.URL.Query().Get("room_id"))
	if roomID == "" {
		return db.DefaultRoomID
	}
	return roomID
}

func roomIDFromPayload(value string) string {
	roomID := strings.TrimSpace(value)
	if roomID == "" {
		return db.DefaultRoomID
	}
	return roomID
}

func (s *Server) requireRoomMembership(w http.ResponseWriter, userID, roomID string) bool {
	ok, err := s.Store.IsRoomMember(roomID, userID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to verify room access"})
		return false
	}
	if !ok {
		writeJSON(w, 403, map[string]string{"error": "room access denied"})
		return false
	}
	return true
}
