package web

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"veil/internal/auth"
	"veil/internal/chat"
	"veil/internal/db"
	"veil/internal/invite"

	"github.com/go-chi/chi/v5"
)

type Server struct {
	Store          *db.Store
	Hub            *chat.Hub
	Secret         string
	CookieSecure   bool
	SessionMaxAge  time.Duration
	AllowedOrigins map[string]struct{}
	RetainDays     int
	RetainCount    int
}

func isAdminRole(role string) bool {
	return role == "root_admin" || role == "admin"
}

func New(store *db.Store) *Server {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		secret = "dev-secret-change-me"
	}
	cookieSecure := strings.EqualFold(os.Getenv("COOKIE_SECURE"), "true")
	if cookieSecure && secret == "dev-secret-change-me" {
		log.Println("warning: COOKIE_SECURE=true with default SESSION_SECRET; set a strong SESSION_SECRET before exposing Veil")
	}
	return &Server{
		Store:          store,
		Hub:            chat.NewHub(),
		Secret:         secret,
		CookieSecure:   cookieSecure,
		SessionMaxAge:  sessionMaxAgeFromEnv(),
		AllowedOrigins: allowedOriginsFromEnv(),
		RetainDays:     positiveIntFromEnv("MESSAGE_RETENTION_DAYS"),
		RetainCount:    positiveIntFromEnv("MESSAGE_RETENTION_COUNT"),
	}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(securityHeaders)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		initialized, err := s.Store.IsInitialized()
		if err != nil {
			writeJSON(w, 500, map[string]any{"ok": false})
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "initialized": initialized})
	})
	r.Get("/", s.home)
	r.Get("/invite/{token}", s.home)
	r.Post("/api/bootstrap", s.bootstrap)
	r.Post("/api/invite", s.createInvite)
	r.Post("/api/join", s.joinInvite)
	r.Post("/api/tui/session", s.tuiSession)
	r.Post("/api/session/from-credential", s.sessionFromCredential)
	r.Get("/api/messages", s.listMessages)
	r.Get("/api/room", s.roomInfo)
	r.Get("/api/admin/users", s.listUsers)
	r.Post("/api/admin/role", s.changeRole)
	r.Post("/api/admin/remove-user", s.removeUser)
	r.Get("/api/admin/invites", s.listInvites)
	r.Post("/api/admin/revoke-invite", s.revokeInvite)
	r.Post("/api/admin/revoke-unused-invites", s.revokeUnusedInvites)
	r.Get("/api/admin/messages/stats", s.messageStats)
	r.Post("/api/admin/messages/clear", s.clearMessages)
	r.Post("/api/admin/messages/retain", s.retainMessages)
	r.Get("/ws", s.ws)
	r.Handle("/static/*", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))
	return r
}

func (s *Server) home(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "web/static/index.html")
}

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
	req.RoomName = cleanInput(req.RoomName, 80)
	req.DisplayName = cleanInput(req.DisplayName, 48)
	req.CredentialID = cleanInput(req.CredentialID, 128)
	req.PublicKey = cleanInput(req.PublicKey, 4096)
	req.RoomKeyEnc = cleanInput(req.RoomKeyEnc, 256)
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
	if !isAdminRole(u.Role) {
		writeJSON(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	token := randomToken()
	h := invite.HashToken(token)
	id, err := s.Store.CreateInvite(h, u.ID, 24, 1)
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
	req.Token = cleanInput(req.Token, 128)
	req.DisplayName = cleanInput(req.DisplayName, 48)
	req.PublicKey = cleanInput(req.PublicKey, 4096)
	req.CredentialID = cleanInput(req.CredentialID, 128)
	if req.Token == "" || req.DisplayName == "" || req.CredentialID == "" {
		writeJSON(w, 400, map[string]string{"error": "invite token and display name required"})
		return
	}
	if _, err := s.Store.ValidateInvite(invite.HashToken(req.Token)); err != nil {
		writeJSON(w, 403, map[string]string{"error": "access denied"})
		return
	}
	u, err := s.Store.AddMember(req.DisplayName, req.PublicKey, req.CredentialID)
	if err != nil {
		writeJSON(w, 403, map[string]string{"error": "access denied"})
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
	writeJSON(w, 200, map[string]any{"ok": true, "user": u, "room_key_enc": roomKeyEnc})
}

func (s *Server) tuiSession(w http.ResponseWriter, r *http.Request) {
	if !checkRateLimit(w, r, "tui_session", 30, time.Minute) {
		return
	}
	var req struct {
		CredentialID string `json:"credential_id"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	req.CredentialID = cleanInput(req.CredentialID, 128)
	u, err := s.Store.FindUserByCredential(req.CredentialID)
	if err != nil || u == nil {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	tok := auth.Sign(auth.NewSession(u.ID), s.Secret)
	log.Printf("tui_session_issued user_id=%s", u.ID)
	writeJSON(w, 200, map[string]string{"session": tok})
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
	req.CredentialID = cleanInput(req.CredentialID, 128)
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

func (s *Server) listMessages(w http.ResponseWriter, r *http.Request) {
	_, err := s.userFromCookie(r)
	if err != nil {
		t := sessionTokenFromRequest(r)
		if t == "" {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		if _, err := s.userFromSignedToken(t); err != nil {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
	}
	msgs, err := s.Store.ListRecentMessages(100)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load messages"})
		return
	}
	writeJSON(w, 200, map[string]any{"messages": msgs})
}

func (s *Server) roomInfo(w http.ResponseWriter, r *http.Request) {
	_, err := s.userFromCookie(r)
	if err != nil {
		t := sessionTokenFromRequest(r)
		if t == "" {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		if _, err := s.userFromSignedToken(t); err != nil {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
	}
	roomName, err := s.Store.GetRoomName()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load room"})
		return
	}
	writeJSON(w, 200, map[string]any{"room_name": roomName})
}

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
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

	users, err := s.Store.ListUsers()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load users"})
		return
	}

	var target *db.User
	for i := range users {
		if users[i].ID == req.UserID {
			target = &users[i]
			break
		}
	}
	if target == nil {
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

	users, err := s.Store.ListUsers()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to load users"})
		return
	}

	var target *db.User
	for i := range users {
		if users[i].ID == targetID {
			target = &users[i]
			break
		}
	}
	if target == nil {
		writeJSON(w, 404, map[string]string{"error": "user not found"})
		return
	}
	if target.Role == "root_admin" {
		writeJSON(w, 400, map[string]string{"error": "cannot remove root admin"})
		return
	}

	if err := s.Store.DeactivateUser(target.ID); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to remove user"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func randomToken() string {
	b := make([]byte, 18)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
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
	req.InviteID = cleanInput(req.InviteID, 128)
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

func setSessionCookie(w http.ResponseWriter, session string, secure bool, maxAge time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     "veil_session",
		Value:    session,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		MaxAge:   int(maxAge.Seconds()),
		Expires:  time.Now().Add(maxAge),
	})
}
