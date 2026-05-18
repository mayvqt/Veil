package web

import (
	"net/http"
	"regexp"
	"strings"
)

var chatColorHexPattern = regexp.MustCompile(`^#[0-9a-f]{6}$`)

func (s *Server) updateProfileColor(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	var req struct {
		ChatColor string `json:"chat_color"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	color := strings.ToLower(cleanInput(req.ChatColor, 7))
	if !chatColorHexPattern.MatchString(color) {
		writeJSON(w, 400, map[string]string{"error": "chat_color must be a hex color like #aabbcc"})
		return
	}
	if err := s.Store.SetUserChatColor(u.ID, color); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to update color"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "chat_color": color})
}
