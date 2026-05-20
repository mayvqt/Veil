package web

import (
	"log"
	"net/http"
	"time"

	"veil/internal/auth"
	"veil/internal/invite"
)

type bootstrapReq struct {
	RoomName     string `json:"room_name"`
	DisplayName  string `json:"display_name"`
	PublicKey    string `json:"public_key"`
	CredentialID string `json:"credential_id"`
	RoomKeyEnc   string `json:"room_key_enc"`
}

func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request) {
	initialized, err := s.Store.IsInitialized()
	if err == nil && initialized {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "room already initialized"})
		return
	}

	var req bootstrapReq
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.RoomName = cleanInput(req.RoomName, maxRoomNameLen)
	req.DisplayName = cleanInput(req.DisplayName, maxDisplayNameLen)
	req.CredentialID = cleanInput(req.CredentialID, maxCredentialIDLen)
	req.PublicKey = cleanInput(req.PublicKey, maxPublicKeyLen)
	req.RoomKeyEnc = cleanInput(req.RoomKeyEnc, maxRoomKeyEncLen)
	if req.RoomName == "" || req.DisplayName == "" || req.CredentialID == "" || req.RoomKeyEnc == "" {
		writeJSON(w, 400, map[string]string{"error": "room and display name required"})
		return
	}
	u, err := s.Store.InitRoom(req.RoomName, req.DisplayName, req.PublicKey, req.CredentialID, req.RoomKeyEnc)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	session := auth.Sign(auth.NewSession(u.ID), s.Secret)
	setSessionCookie(w, session, s.CookieSecure, s.SessionMaxAge)
	writeJSON(w, 200, map[string]any{"ok": true, "user": u})
}

func (s *Server) createInvite(w http.ResponseWriter, r *http.Request) {
	if !checkRateLimit(w, r, "create_invite", 15, time.Minute) {
		return
	}
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	token, err := randomToken()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "could not create invite"})
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomManager(w, u, roomID) {
		return
	}
	h := invite.HashToken(token)
	id, err := s.Store.CreateInvite(roomID, h, u.ID, 24, 1)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "could not create invite"})
		return
	}
	log.Printf("invite_created by=%s invite_id=%s", u.ID, id)
	writeJSON(w, 200, map[string]string{"invite_id": id, "invite_link": "/invite/" + token})
}

func (s *Server) joinInvite(w http.ResponseWriter, r *http.Request) {
	if !checkRateLimit(w, r, "join_invite", 20, time.Minute) {
		return
	}
	var req struct {
		Token        string `json:"token"`
		DisplayName  string `json:"display_name"`
		PublicKey    string `json:"public_key"`
		CredentialID string `json:"credential_id"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.Token = cleanInput(req.Token, maxInviteIDLen)
	req.DisplayName = cleanInput(req.DisplayName, maxDisplayNameLen)
	req.PublicKey = cleanInput(req.PublicKey, maxPublicKeyLen)
	req.CredentialID = cleanInput(req.CredentialID, maxCredentialIDLen)
	if req.Token == "" || req.DisplayName == "" || req.CredentialID == "" {
		writeJSON(w, 400, map[string]string{"error": "invite token and display name required"})
		return
	}
	match, err := s.Store.ValidateInvite(invite.HashToken(req.Token))
	if err != nil {
		writeJSON(w, 403, map[string]string{"error": "access denied"})
		return
	}
	u, err := s.Store.AddMember(req.DisplayName, req.PublicKey, req.CredentialID)
	if err != nil {
		writeJSON(w, 403, map[string]string{"error": "access denied"})
		return
	}
	if err := s.Store.AddUserToRoom(match.RoomID, u.ID); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to join room"})
		return
	}
	roomKeyEnc, err := s.Store.GetRoomKeyEnc()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "could not load room key"})
		return
	}
	session := auth.Sign(auth.NewSession(u.ID), s.Secret)
	setSessionCookie(w, session, s.CookieSecure, s.SessionMaxAge)
	log.Printf("invite_join_success user_id=%s display_name=%q", u.ID, u.DisplayName)
	writeJSON(w, 200, map[string]any{"ok": true, "user": u, "room_key_enc": roomKeyEnc, "room_id": match.RoomID})
}

func (s *Server) sessionFromCredential(w http.ResponseWriter, r *http.Request) {
	if !checkRateLimit(w, r, "session_credential", 30, time.Minute) {
		return
	}
	var req struct {
		CredentialID string `json:"credential_id"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.CredentialID = cleanInput(req.CredentialID, maxCredentialIDLen)
	u, err := s.Store.FindUserByCredential(req.CredentialID)
	if err != nil || u == nil {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	session := auth.Sign(auth.NewSession(u.ID), s.Secret)
	setSessionCookie(w, session, s.CookieSecure, s.SessionMaxAge)
	log.Printf("web_session_issued user_id=%s", u.ID)
	writeJSON(w, 200, map[string]any{"ok": true, "display_name": u.DisplayName})
}
