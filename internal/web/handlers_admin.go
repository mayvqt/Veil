package web

import (
	"log"
	"net/http"
	"strings"

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
	writeJSON(w, 200, map[string]any{"ok": true})
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
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) listInvites(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	items, err := s.Store.ListInvites(100)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to list invites"})
		return
	}
	writeJSON(w, 200, map[string]any{"invites": items})
}

func (s *Server) revokeInvite(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
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
	if err := s.Store.RevokeInvite(req.InviteID); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to revoke invite"})
		return
	}
	log.Printf("invite_revoked by=%s invite_id=%s", u.ID, req.InviteID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) revokeUnusedInvites(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	n, err := s.Store.RevokeUnusedInvites()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to revoke unused invites"})
		return
	}
	log.Printf("invite_revoke_unused by=%s revoked=%d", u.ID, n)
	writeJSON(w, 200, map[string]any{"ok": true, "revoked": n})
}

func (s *Server) purgeUsedRevokedInvites(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	n, err := s.Store.PurgeUsedOrRevokedInvites()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to purge invites"})
		return
	}
	log.Printf("invite_purge_used_revoked by=%s purged=%d", u.ID, n)
	writeJSON(w, 200, map[string]any{"ok": true, "purged": n})
}

func (s *Server) messageStats(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	count, err := s.Store.MessageCount()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load message stats"})
		return
	}
	writeJSON(w, 200, map[string]any{"count": count, "retain_days": s.RetainDays, "retain_count": s.RetainCount})
}

func (s *Server) updateRoomName(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
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
	if err := s.Store.SetRoomName(req.RoomName); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to update room name"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "room_name": req.RoomName})
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
	n, err := s.Store.DeleteAllMessages()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to clear messages"})
		return
	}
	log.Printf("messages_cleared by=%s deleted=%d", u.ID, n)
	writeJSON(w, 200, map[string]any{"ok": true, "deleted": n})
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
	if req.KeepLatest <= 0 {
		writeJSON(w, 400, map[string]string{"error": "keep_latest must be > 0"})
		return
	}
	if err := s.Store.PruneMessagesToLimit(req.KeepLatest); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to prune messages"})
		return
	}
	count, _ := s.Store.MessageCount()
	log.Printf("messages_pruned by=%s keep_latest=%d remaining=%d", u.ID, req.KeepLatest, count)
	writeJSON(w, 200, map[string]any{"ok": true, "remaining": count})
}

func (s *Server) findActiveUser(userID string) (*db.User, bool, error) {
	users, err := s.Store.ListUsers()
	if err != nil {
		return nil, false, err
	}
	for i := range users {
		if users[i].ID == userID {
			return &users[i], true, nil
		}
	}
	return nil, false, nil
}
