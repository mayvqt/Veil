package web

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
)

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(securityHeaders)

	r.Get("/health", s.health)
	r.Get("/", s.home)
	r.Get("/invite/{token}", s.home)

	r.Post("/api/bootstrap", s.bootstrap)
	r.Post("/api/invite", s.createInvite)
	r.Post("/api/join", s.joinInvite)
	r.Post("/api/session/from-credential", s.sessionFromCredential)
	r.Post("/api/profile/name", s.updateProfileName)
	r.Post("/api/profile/status", s.updateProfileStatus)
	r.Post("/api/profile/color", s.updateProfileColor)
	r.Post("/api/profile/avatar", s.updateProfileAvatar)
	r.Post("/api/profile/avatar-ring", s.updateProfileAvatarRing)

	r.Get("/api/messages", s.listMessages)
	r.Get("/api/rooms", s.listRooms)
	r.Post("/api/rooms", s.createRoom)
	r.Delete("/api/rooms/{room_id}", s.deleteRoom)
	r.Post("/api/rooms/join", s.joinRoom)
	r.Post("/api/messages/read", s.markMessagesRead)
	r.Post("/api/messages/edit", s.editMessage)
	r.Post("/api/messages/delete", s.deleteMessage)
	r.Post("/api/messages/react", s.reactMessage)
	r.Get("/api/messages/pins", s.pinnedMessages)
	r.Get("/api/members", s.listMembers)
	r.Get("/api/room", s.roomInfo)
	r.Get("/api/custom-media", s.listCustomMedia)

	r.Get("/api/admin/users", s.listUsers)
	r.Post("/api/admin/role", s.changeRole)
	r.Post("/api/admin/room-role", s.setRoomRole)
	r.Post("/api/admin/room-role/clear", s.clearRoomRole)
	r.Post("/api/admin/remove-user", s.removeUser)
	r.Get("/api/admin/invites", s.listInvites)
	r.Post("/api/admin/revoke-invite", s.revokeInvite)
	r.Post("/api/admin/revoke-unused-invites", s.revokeUnusedInvites)
	r.Post("/api/admin/purge-used-revoked-invites", s.purgeUsedRevokedInvites)
	r.Get("/api/admin/audit", s.listAdminAudit)
	r.Post("/api/admin/pin-message", s.pinMessage)
	r.Get("/api/admin/messages/stats", s.messageStats)
	r.Post("/api/admin/room-name", s.updateRoomName)
	r.Post("/api/admin/room-status-text", s.updateRoomStatusText)
	r.Post("/api/admin/room-pin", s.updateRoomPin)
	r.Post("/api/admin/room-move", s.moveRoom)
	r.Post("/api/admin/messages/clear", s.clearMessages)
	r.Post("/api/admin/messages/retain", s.retainMessages)
	r.Post("/api/admin/custom-media", s.uploadCustomMedia)
	r.Delete("/api/admin/custom-media/{name}", s.deleteCustomMedia)

	r.Get("/ws", s.ws)
	r.Handle("/avatars/*", cacheControlledFileServer("/avatars/", s.AvatarDir))
	r.Handle("/media/*", cacheControlledFileServer("/media/", s.MediaDir))
	r.Handle("/static/*", cacheControlledFileServer("/static/", "web/static"))
	return r
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	initialized, err := s.Store.IsInitialized()
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "initialized": initialized, "version": AppVersion})
}

func (s *Server) home(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	http.ServeFile(w, r, "web/static/index.html")
}

func cacheControlledFileServer(prefix, dir string) http.Handler {
	files := http.StripPrefix(prefix, http.FileServer(http.Dir(dir)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", cacheControlForPath(r.URL.Path))
		files.ServeHTTP(w, r)
	})
}

func cacheControlForPath(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".avif", ".gif", ".ico", ".jpg", ".jpeg", ".png", ".svg", ".webp":
		return "public, max-age=31536000, immutable"
	default:
		return "no-store"
	}
}
