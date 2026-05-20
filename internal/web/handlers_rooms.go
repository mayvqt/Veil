package web

import (
	"net/http"

	"veil/internal/db"

	"github.com/go-chi/chi/v5"
)

func (s *Server) listRooms(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	if err := s.Store.AddUserToAllRooms(u.ID); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to sync rooms"})
		return
	}
	rooms, err := s.Store.ListRoomsForUser(u.ID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load rooms"})
		return
	}
	writeJSON(w, 200, map[string]any{"rooms": rooms, "default_room_id": db.DefaultRoomID})
}

func (s *Server) createRoom(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	var req struct {
		RoomID     string `json:"room_id"`
		RoomName   string `json:"room_name"`
		StatusText string `json:"status_text"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.RoomID = cleanInput(req.RoomID, 48)
	req.RoomName = cleanInput(req.RoomName, maxRoomNameLen)
	req.StatusText = cleanInput(req.StatusText, maxRoomStatusLen)
	room, err := s.Store.CreateRoom(req.RoomID, req.RoomName, req.StatusText, u.ID)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "room_create", room.ID, room.Name)
	writeJSON(w, 200, map[string]any{"ok": true, "room": room})
}

func (s *Server) deleteRoom(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	roomID := cleanInput(chi.URLParam(r, "room_id"), 48)
	if roomID == "" {
		writeJSON(w, 400, map[string]string{"error": "room_id required"})
		return
	}
	if roomID == db.DefaultRoomID {
		writeJSON(w, 400, map[string]string{"error": "cannot delete the main channel"})
		return
	}
	exists, err := s.Store.RoomExists(roomID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to check room"})
		return
	}
	if !exists {
		writeJSON(w, 404, map[string]string{"error": "room not found"})
		return
	}
	if err := s.Store.DeleteRoom(roomID); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to delete room"})
		return
	}
	if _, err := removeCustomMediaByPrefix(s.MediaDir, customMediaRoomPrefix(sanitizeCustomMediaRoomID(roomID))); err != nil {
		writeJSON(w, 500, map[string]string{"error": "room deleted, but custom media cleanup failed"})
		return
	}
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "room_delete", roomID, "")
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID})
}

func (s *Server) joinRoom(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	var req struct {
		RoomID string `json:"room_id"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.RoomID = cleanInput(req.RoomID, 48)
	if req.RoomID == "" {
		writeJSON(w, 400, map[string]string{"error": "room_id required"})
		return
	}
	exists, err := s.Store.RoomExists(req.RoomID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to check room"})
		return
	}
	if !exists {
		writeJSON(w, 404, map[string]string{"error": "room not found"})
		return
	}
	if err := s.Store.AddUserToRoom(req.RoomID, u.ID); err != nil {
		writeJSON(w, 400, map[string]string{"error": "failed to join room"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": req.RoomID})
}

func (s *Server) updateRoomPin(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	var req struct {
		RoomID string `json:"room_id"`
		Pinned bool   `json:"pinned"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	roomID := cleanInput(req.RoomID, 48)
	if roomID == "" {
		roomID = roomIDFromRequest(r)
	}
	exists, err := s.Store.RoomExists(roomID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to check room"})
		return
	}
	if !exists {
		writeJSON(w, 404, map[string]string{"error": "room not found"})
		return
	}
	if err := s.Store.SetRoomPinned(roomID, req.Pinned); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to update pin"})
		return
	}
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "room_pin", roomID, "pinned="+boolString(req.Pinned))
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID, "pinned": req.Pinned})
}

func (s *Server) moveRoom(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	var req struct {
		RoomID    string `json:"room_id"`
		Direction string `json:"direction"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	roomID := cleanInput(req.RoomID, 48)
	if roomID == "" {
		writeJSON(w, 400, map[string]string{"error": "room_id required"})
		return
	}
	direction := 0
	switch req.Direction {
	case "up":
		direction = -1
	case "down":
		direction = 1
	default:
		writeJSON(w, 400, map[string]string{"error": "direction must be up or down"})
		return
	}
	if err := s.Store.MoveRoom(roomID, direction); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to move room"})
		return
	}
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "room_move", roomID, req.Direction)
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID, "direction": req.Direction})
}

func boolString(v bool) string {
	if v {
		return "true"
	}
	return "false"
}
