package web

import "net/http"

func (s *Server) listMembers(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	users, err := s.Store.ListUsersByRoom(roomID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to list members"})
		return
	}
	presence := s.presenceSnapshot()
	members := make([]map[string]any, 0, len(users))
	for _, user := range users {
		members = append(members, map[string]any{
			"id":                      user.ID,
			"display_name":            user.DisplayName,
			"role":                    user.Role,
			"room_role":               user.RoomRole,
			"status_text":             user.StatusText,
			"chat_color":              user.ChatColor,
			"avatar_url":              user.AvatarURL,
			"avatar_ring_color":       user.AvatarRingColor,
			"avatar_ring_color2":      user.AvatarRingColor2,
			"avatar_ring_color3":      user.AvatarRingColor3,
			"avatar_ring_color4":      user.AvatarRingColor4,
			"avatar_ring_mode":        user.AvatarRingMode,
			"profile_about":           user.ProfileAbout,
			"profile_accent":          user.ProfileAccent,
			"profile_banner_url":      user.ProfileBannerURL,
			"profile_card_bg_url":     user.ProfileCardBgURL,
			"profile_banner_opacity":  user.ProfileBannerOpacity,
			"profile_card_bg_opacity": user.ProfileCardBgOpacity,
			"online":                  presence[user.ID] > 0,
		})
	}
	writeJSON(w, 200, map[string]any{"members": members, "me": u.ID, "room_id": roomID})
}
