package web

import (
	"net/http"

	"veil/internal/db"
)

func (s *Server) listRooms(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
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
