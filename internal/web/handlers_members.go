package web

import "net/http"

func (s *Server) listMembers(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	users, err := s.Store.ListUsers()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to list members"})
		return
	}
	presence := s.presenceSnapshot()
	members := make([]map[string]any, 0, len(users))
	for _, user := range users {
		members = append(members, map[string]any{
			"id":                 user.ID,
			"display_name":       user.DisplayName,
			"role":               user.Role,
			"chat_color":         user.ChatColor,
			"avatar_url":         user.AvatarURL,
			"avatar_ring_color":  user.AvatarRingColor,
			"avatar_ring_color2": user.AvatarRingColor2,
			"avatar_ring_color3": user.AvatarRingColor3,
			"avatar_ring_color4": user.AvatarRingColor4,
			"avatar_ring_mode":   user.AvatarRingMode,
			"online":             presence[user.ID] > 0,
		})
	}
	writeJSON(w, 200, map[string]any{"members": members, "me": u.ID})
}
