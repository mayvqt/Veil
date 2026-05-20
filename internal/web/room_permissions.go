package web

import (
	"net/http"
	"strings"

	"veil/internal/db"
)

func (s *Server) canManageRoom(user *db.User, roomID string) (bool, error) {
	if user == nil {
		return false, nil
	}
	if isAdminRole(user.Role) {
		return true, nil
	}
	role, err := s.Store.GetRoomRole(roomID, user.ID)
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(role) == "moderator", nil
}

func (s *Server) requireRoomManager(w http.ResponseWriter, user *db.User, roomID string) bool {
	if !s.requireRoomMembership(w, user.ID, roomID) {
		return false
	}
	ok, err := s.canManageRoom(user, roomID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to verify room permissions"})
		return false
	}
	if !ok {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
		return false
	}
	return true
}
