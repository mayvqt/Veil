package web

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"veil/internal/chat"
	"veil/internal/db"
)

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	users, err := s.Store.ListUsers()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to list users"})
		return
	}
	writeJSON(w, 200, map[string]any{"users": users, "me": u.ID, "my_role": u.Role})
}

func (s *Server) changeRole(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if u.Role != "root_admin" {
		writeJSON(w, 403, map[string]string{"error": "only root admins can update roles"})
		return
	}

	var req struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	nextRole := strings.TrimSpace(req.Role)
	if nextRole != "member" && nextRole != "admin" {
		writeJSON(w, 400, map[string]string{"error": "role must be member or admin"})
		return
	}
	target, found, err := s.findActiveUser(req.UserID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load users"})
		return
	}
	if !found {
		writeJSON(w, 404, map[string]string{"error": "user not found"})
		return
	}
	if target.Role == "root_admin" {
		writeJSON(w, 400, map[string]string{"error": "cannot change root admin role"})
		return
	}
	if err := s.Store.UpdateUserRole(target.ID, nextRole); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to update role"})
		return
	}
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "role_change", target.ID, "role="+nextRole)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) setRoomRole(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "only global admins can update room roles"})
		return
	}
	var req struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.UserID = cleanInput(req.UserID, maxUserIDLen)
	role := strings.TrimSpace(req.Role)
	if role != "moderator" {
		writeJSON(w, 400, map[string]string{"error": "role must be moderator"})
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	target, found, err := s.findActiveUser(req.UserID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load users"})
		return
	}
	if !found {
		writeJSON(w, 404, map[string]string{"error": "user not found"})
		return
	}
	inRoom, err := s.Store.IsRoomMember(roomID, target.ID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to verify room membership"})
		return
	}
	if !inRoom {
		writeJSON(w, 400, map[string]string{"error": "target user is not in this room"})
		return
	}
	if err := s.Store.SetRoomRole(roomID, target.ID, role); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to set room role"})
		return
	}
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "room_role_set", target.ID, "room="+roomID+",role="+role)
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID, "user_id": target.ID, "role": role})
}

func (s *Server) clearRoomRole(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "only global admins can clear room roles"})
		return
	}
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.UserID = cleanInput(req.UserID, maxUserIDLen)
	if req.UserID == "" {
		writeJSON(w, 400, map[string]string{"error": "user_id required"})
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	if err := s.Store.ClearRoomRole(roomID, req.UserID); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to clear room role"})
		return
	}
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "room_role_clear", req.UserID, "room="+roomID)
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID, "user_id": req.UserID})
}

func (s *Server) removeUser(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if u.Role != "root_admin" {
		writeJSON(w, 403, map[string]string{"error": "only root admins can remove users"})
		return
	}
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	targetID := strings.TrimSpace(req.UserID)
	if targetID == "" {
		writeJSON(w, 400, map[string]string{"error": "user_id required"})
		return
	}
	if targetID == u.ID {
		writeJSON(w, 400, map[string]string{"error": "cannot remove yourself"})
		return
	}
	target, found, err := s.findActiveUser(targetID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load users"})
		return
	}
	if !found {
		writeJSON(w, 404, map[string]string{"error": "user not found"})
		return
	}
	if target.Role == "root_admin" {
		writeJSON(w, 400, map[string]string{"error": "cannot remove root admin"})
		return
	}
	avatarURL, _ := s.Store.GetUserAvatarURL(target.ID)
	if err := s.Store.DeactivateUser(target.ID); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to remove user"})
		return
	}
	_ = s.Store.ClearUserAvatarURL(target.ID)
	removeAvatarFileIfLocal(s.AvatarDir, avatarURL)
	s.pruneUnusedAvatarFiles()
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "remove_user", target.ID, "role="+target.Role)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) listInvites(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomManager(w, u, roomID) {
		return
	}
	items, err := s.Store.ListInvitesByRoom(roomID, 100)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to list invites"})
		return
	}
	writeJSON(w, 200, map[string]any{"invites": items, "room_id": roomID})
}

func (s *Server) revokeInvite(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	var req struct {
		InviteID string `json:"invite_id"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.InviteID = cleanInput(req.InviteID, maxInviteIDLen)
	if req.InviteID == "" {
		writeJSON(w, 400, map[string]string{"error": "invite_id required"})
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomManager(w, u, roomID) {
		return
	}
	if err := s.Store.RevokeInviteInRoom(roomID, req.InviteID); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to revoke invite"})
		return
	}
	log.Printf("invite_revoked by=%s invite_id=%s", u.ID, req.InviteID)
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "invite_revoke", req.InviteID, "room="+roomID)
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID})
}

func (s *Server) revokeUnusedInvites(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomManager(w, u, roomID) {
		return
	}
	n, err := s.Store.RevokeUnusedInvitesInRoom(roomID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to revoke unused invites"})
		return
	}
	log.Printf("invite_revoke_unused by=%s room=%s revoked=%d", u.ID, roomID, n)
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "invite_revoke_unused", roomID, "count="+strconv.FormatInt(n, 10))
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID, "revoked": n})
}

func (s *Server) purgeUsedRevokedInvites(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomManager(w, u, roomID) {
		return
	}
	n, err := s.Store.PurgeUsedOrRevokedInvitesInRoom(roomID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to purge invites"})
		return
	}
	log.Printf("invite_purge_used_revoked by=%s room=%s purged=%d", u.ID, roomID, n)
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "invite_purge_used_revoked", roomID, "count="+strconv.FormatInt(n, 10))
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID, "purged": n})
}

func (s *Server) messageStats(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomManager(w, u, roomID) {
		return
	}
	count, err := s.Store.MessageCountInRoom(roomID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load message stats"})
		return
	}
	writeJSON(w, 200, map[string]any{"room_id": roomID, "count": count, "retain_days": s.RetainDays, "retain_count": s.RetainCount})
}

func (s *Server) updateRoomName(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	var req struct {
		RoomName string `json:"room_name"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.RoomName = cleanInput(req.RoomName, maxRoomNameLen)
	if req.RoomName == "" {
		writeJSON(w, 400, map[string]string{"error": "room_name required"})
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomManager(w, u, roomID) {
		return
	}
	if err := s.Store.SetRoomNameByID(roomID, req.RoomName); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to update room name"})
		return
	}
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "room_rename", roomID, req.RoomName)
	s.Hub.Broadcast(chat.Outbound{Type: "room_update", Data: map[string]string{
		"room_id":   roomID,
		"room_name": req.RoomName,
	}})
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID, "room_name": req.RoomName})
}

func (s *Server) updateRoomStatusText(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	var req struct {
		RoomStatusText string `json:"room_status_text"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.RoomStatusText = cleanInput(req.RoomStatusText, maxRoomStatusLen)
	if req.RoomStatusText == "" {
		req.RoomStatusText = db.DefaultRoomStatusText
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomManager(w, u, roomID) {
		return
	}
	if err := s.Store.SetRoomStatusTextByID(roomID, req.RoomStatusText); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to update room status text"})
		return
	}
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "room_status_text", roomID, req.RoomStatusText)
	s.Hub.Broadcast(chat.Outbound{Type: "room_update", Data: map[string]string{
		"room_id":          roomID,
		"room_status_text": req.RoomStatusText,
	}})
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID, "room_status_text": req.RoomStatusText})
}

func (s *Server) pinMessage(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	var req struct {
		MessageID string `json:"message_id"`
		Pin       bool   `json:"pin"`
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
	if !s.requireRoomManager(w, u, roomID) {
		return
	}
	exists, err := s.Store.MessageExists(roomID, req.MessageID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to update pin"})
		return
	}
	if !exists {
		writeJSON(w, 404, map[string]string{"error": "message not found"})
		return
	}
	if err := s.Store.SetMessagePinned(roomID, req.MessageID, u.ID, req.Pin); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to update pin"})
		return
	}
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "message_pin", req.MessageID, "room="+roomID+",pin="+boolToFlag(req.Pin))
	writeJSON(w, 200, map[string]any{"ok": true, "message_id": req.MessageID, "pin": req.Pin})
}

func (s *Server) listAdminAudit(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	roomID := roomIDFromRequest(r)
	allRooms := strings.TrimSpace(r.URL.Query().Get("all_rooms")) == "1"
	if allRooms {
		if u.Role != "root_admin" {
			writeJSON(w, 403, map[string]string{"error": "only root admins can view all-room audit"})
			return
		}
		items, err := s.Store.ListAdminAudit(120)
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": "failed to load audit log"})
			return
		}
		writeJSON(w, 200, map[string]any{"items": items, "room_id": "all"})
		return
	}
	if !s.requireRoomManager(w, u, roomID) {
		return
	}
	items, err := s.Store.ListAdminAuditByRoom(roomID, 120)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load audit log"})
		return
	}
	writeJSON(w, 200, map[string]any{"items": items, "room_id": roomID})
}

func (s *Server) clearMessages(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if u.Role != "root_admin" {
		writeJSON(w, 403, map[string]string{"error": "only root admins can clear messages"})
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	n, err := s.Store.DeleteAllMessagesInRoom(roomID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to clear messages"})
		return
	}
	log.Printf("messages_cleared by=%s room=%s deleted=%d", u.ID, roomID, n)
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "messages_clear", roomID, "deleted="+strconv.FormatInt(n, 10))
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID, "deleted": n})
}

func (s *Server) retainMessages(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if u.Role != "root_admin" {
		writeJSON(w, 403, map[string]string{"error": "only root admins can retain messages"})
		return
	}
	var req struct {
		KeepLatest int `json:"keep_latest"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	if req.KeepLatest <= 0 {
		writeJSON(w, 400, map[string]string{"error": "keep_latest must be > 0"})
		return
	}
	if err := s.Store.PruneMessagesToLimitInRoom(roomID, req.KeepLatest); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to prune messages"})
		return
	}
	count, _ := s.Store.MessageCountInRoom(roomID)
	log.Printf("messages_pruned by=%s room=%s keep_latest=%d remaining=%d", u.ID, roomID, req.KeepLatest, count)
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "messages_retain", roomID, "keep="+strconv.Itoa(req.KeepLatest)+",remaining="+strconv.Itoa(count))
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID, "remaining": count})
}

func (s *Server) findActiveUser(userID string) (*db.User, bool, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, false, nil
	}
	user, err := s.Store.GetActiveUser(userID)
	if err != nil {
		return nil, false, err
	}
	if user == nil {
		return nil, false, nil
	}
	return user, true, nil
}
