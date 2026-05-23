package web

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var chatColorHexPattern = regexp.MustCompile(`^#[0-9a-f]{6}$`)
var ringColorHexPattern = regexp.MustCompile(`^#[0-9a-f]{6}([0-9a-f]{2})?$`)
var avatarDataURLPattern = regexp.MustCompile(`^data:(image/(png|jpeg|webp|gif));base64,([a-zA-Z0-9+/=]+)$`)
var avatarRingModes = map[string]struct{}{"none": {}, "pulse": {}, "glow": {}, "rainbow": {}}

func (s *Server) updateProfileName(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	var req struct {
		DisplayName string `json:"display_name"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	name := cleanInput(req.DisplayName, maxDisplayNameLen)
	if name == "" {
		writeJSON(w, 400, map[string]string{"error": "display_name required"})
		return
	}
	if err := s.Store.SetUserDisplayName(u.ID, name); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to update display name"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "display_name": name})
}

func (s *Server) updateProfileStatus(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	var req struct {
		StatusText string `json:"status_text"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	statusText := cleanTextInput(req.StatusText, maxProfileStatusLen)
	if err := s.Store.SetUserStatusText(u.ID, statusText); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to update status"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "status_text": statusText})
}

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

func (s *Server) updateProfileAvatar(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	var req struct {
		AvatarURL string `json:"avatar_url"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	avatarURL := strings.TrimSpace(cleanInput(req.AvatarURL, maxAvatarURLLen))
	previousURL, _ := s.Store.GetUserAvatarURL(u.ID)
	if avatarURL == "" {
		removeAvatarFileIfLocal(s.AvatarDir, previousURL)
		if err := s.Store.SetUserAvatarURL(u.ID, ""); err != nil {
			writeJSON(w, 500, map[string]string{"error": "failed to clear avatar"})
			return
		}
		s.pruneUnusedAvatarFiles()
		writeJSON(w, 200, map[string]any{"ok": true, "avatar_url": ""})
		return
	}
	matches := avatarDataURLPattern.FindStringSubmatch(avatarURL)
	if len(matches) != 4 {
		writeJSON(w, 400, map[string]string{"error": "avatar_url must be a base64 data URL for png/jpeg/webp/gif"})
		return
	}
	mime := matches[1]
	decoded, err := base64.StdEncoding.DecodeString(matches[3])
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": "avatar data is not valid base64"})
		return
	}
	if len(decoded) == 0 || len(decoded) > 4*1024*1024 {
		writeJSON(w, 400, map[string]string{"error": "avatar image must be between 1 byte and 4MB"})
		return
	}
	ext := ".png"
	switch mime {
	case "image/jpeg":
		ext = ".jpg"
	case "image/webp":
		ext = ".webp"
	case "image/gif":
		ext = ".gif"
	}
	if err := os.MkdirAll(s.AvatarDir, 0o755); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to prepare avatar storage"})
		return
	}
	baseName := fmt.Sprintf("user_%s_%d%s", strings.ReplaceAll(u.ID, "-", ""), time.Now().UnixNano(), ext)
	fullPath := filepath.Join(s.AvatarDir, baseName)
	if err := os.WriteFile(fullPath, decoded, 0o644); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to save avatar"})
		return
	}
	base := strings.TrimSpace(s.AvatarURLBase)
	if base == "" {
		base = "/avatars"
	}
	base = "/" + strings.Trim(base, "/")
	publicURL := fmt.Sprintf("%s/%s?v=%d", base, baseName, time.Now().Unix())
	if err := s.Store.SetUserAvatarURL(u.ID, publicURL); err != nil {
		_ = os.Remove(fullPath)
		writeJSON(w, 500, map[string]string{"error": "failed to update avatar"})
		return
	}
	removeAvatarFileIfLocal(s.AvatarDir, previousURL)
	s.pruneUnusedAvatarFiles()
	writeJSON(w, 200, map[string]any{"ok": true, "avatar_url": publicURL})
}

func (s *Server) updateProfileAvatarRing(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	var req struct {
		RingColor  string `json:"avatar_ring_color"`
		RingColor2 string `json:"avatar_ring_color2"`
		RingColor3 string `json:"avatar_ring_color3"`
		RingColor4 string `json:"avatar_ring_color4"`
		RingMode   string `json:"avatar_ring_mode"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	color := strings.ToLower(cleanInput(req.RingColor, 9))
	if color != "" && !ringColorHexPattern.MatchString(color) {
		writeJSON(w, 400, map[string]string{"error": "avatar_ring_color must be empty, #aabbcc, or #aabbccdd"})
		return
	}
	color2 := strings.ToLower(cleanInput(req.RingColor2, 9))
	if color2 != "" && !ringColorHexPattern.MatchString(color2) {
		writeJSON(w, 400, map[string]string{"error": "avatar_ring_color2 must be empty, #aabbcc, or #aabbccdd"})
		return
	}
	color3 := strings.ToLower(cleanInput(req.RingColor3, 9))
	if color3 != "" && !ringColorHexPattern.MatchString(color3) {
		writeJSON(w, 400, map[string]string{"error": "avatar_ring_color3 must be empty, #aabbcc, or #aabbccdd"})
		return
	}
	color4 := strings.ToLower(cleanInput(req.RingColor4, 9))
	if color4 != "" && !ringColorHexPattern.MatchString(color4) {
		writeJSON(w, 400, map[string]string{"error": "avatar_ring_color4 must be empty, #aabbcc, or #aabbccdd"})
		return
	}
	mode := strings.ToLower(cleanInput(req.RingMode, 16))
	if mode == "" {
		mode = "none"
	}
	if _, ok := avatarRingModes[mode]; !ok {
		writeJSON(w, 400, map[string]string{"error": "avatar_ring_mode must be none, pulse, glow, or rainbow"})
		return
	}
	if color == "" {
		color2 = ""
		color3 = ""
		color4 = ""
		mode = "none"
	}
	if err := s.Store.SetUserAvatarRing(u.ID, color, color2, color3, color4, mode); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to update avatar ring"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "avatar_ring_color": color, "avatar_ring_color2": color2, "avatar_ring_color3": color3, "avatar_ring_color4": color4, "avatar_ring_mode": mode})
}

func (s *Server) updateProfileCard(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	var req struct {
		About         string  `json:"profile_about"`
		Accent        string  `json:"profile_accent"`
		StatusColor   *string `json:"profile_status_color"`
		NoteColor     *string `json:"profile_note_color"`
		BannerURL     *string `json:"profile_banner_url"`
		CardBgURL     *string `json:"profile_card_bg_url"`
		BannerOpacity *int    `json:"profile_banner_opacity"`
		CardBgOpacity *int    `json:"profile_card_bg_opacity"`
		DisableBanner *bool   `json:"profile_disable_banner"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	about := cleanTextInput(req.About, maxProfileAboutLen)
	accent := strings.ToLower(cleanInput(req.Accent, 7))
	if accent != "" && !chatColorHexPattern.MatchString(accent) {
		writeJSON(w, 400, map[string]string{"error": "profile_accent must be empty or a hex color like #aabbcc"})
		return
	}
	statusColor := strings.ToLower(cleanInput(u.ProfileStatusColor, 7))
	if req.StatusColor != nil {
		statusColor = strings.ToLower(cleanInput(*req.StatusColor, 7))
	}
	if statusColor != "" && !chatColorHexPattern.MatchString(statusColor) {
		writeJSON(w, 400, map[string]string{"error": "profile_status_color must be empty or a hex color like #aabbcc"})
		return
	}
	noteColor := strings.ToLower(cleanInput(u.ProfileNoteColor, 7))
	if req.NoteColor != nil {
		noteColor = strings.ToLower(cleanInput(*req.NoteColor, 7))
	}
	if noteColor != "" && !chatColorHexPattern.MatchString(noteColor) {
		writeJSON(w, 400, map[string]string{"error": "profile_note_color must be empty or a hex color like #aabbcc"})
		return
	}
	previousBannerURL, previousCardBgURL, previousBannerOpacity, previousCardBgOpacity, _ := s.Store.GetUserProfileMedia(u.ID)
	bannerOpacity := boundedPercent(req.BannerOpacity, previousBannerOpacity)
	cardBgOpacity := boundedPercent(req.CardBgOpacity, previousCardBgOpacity)
	bannerURL, bannerErrCode, bannerErr := s.profileCardMediaURL(u.ID, req.BannerURL, previousBannerURL, "profile_banner", "banner")
	if bannerErr != "" {
		writeJSON(w, bannerErrCode, map[string]string{"error": bannerErr})
		return
	}
	cardBgURL, bgErrCode, bgErr := s.profileCardMediaURL(u.ID, req.CardBgURL, previousCardBgURL, "profile_bg", "card background")
	if bgErr != "" {
		writeJSON(w, bgErrCode, map[string]string{"error": bgErr})
		return
	}
	disableBanner := u.ProfileDisableBanner
	if req.DisableBanner != nil {
		disableBanner = *req.DisableBanner
	}
	if err := s.Store.SetUserProfileCard(u.ID, about, accent, statusColor, noteColor, bannerURL, cardBgURL, bannerOpacity, cardBgOpacity, disableBanner); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to update profile card"})
		return
	}
	if previousBannerURL != bannerURL || previousCardBgURL != cardBgURL {
		if previousBannerURL != bannerURL {
			removeAvatarFileIfLocal(s.AvatarDir, previousBannerURL)
		}
		if previousCardBgURL != cardBgURL {
			removeAvatarFileIfLocal(s.AvatarDir, previousCardBgURL)
		}
		s.pruneUnusedAvatarFiles()
	}
	writeJSON(w, 200, map[string]any{"ok": true, "profile_about": about, "profile_accent": accent, "profile_status_color": statusColor, "profile_note_color": noteColor, "profile_banner_url": bannerURL, "profile_card_bg_url": cardBgURL, "profile_banner_opacity": bannerOpacity, "profile_card_bg_opacity": cardBgOpacity, "profile_disable_banner": disableBanner})
}

func boundedPercent(in *int, fallback int) int {
	if fallback < 0 || fallback > 100 {
		fallback = 100
	}
	if in == nil {
		return fallback
	}
	if *in < 0 {
		return 0
	}
	if *in > 100 {
		return 100
	}
	return *in
}

func (s *Server) profileCardMediaURL(userID string, incoming *string, previousURL, namePrefix, label string) (string, int, string) {
	if incoming == nil {
		return previousURL, 0, ""
	}
	raw := strings.TrimSpace(cleanInput(*incoming, maxAvatarURLLen))
	if raw == "" || raw == previousURL {
		return raw, 0, ""
	}
	matches := avatarDataURLPattern.FindStringSubmatch(raw)
	if len(matches) != 4 {
		return "", 400, fmt.Sprintf("%s must be a base64 data URL for png/jpeg/webp/gif", label)
	}
	mime := matches[1]
	decoded, err := base64.StdEncoding.DecodeString(matches[3])
	if err != nil {
		return "", 400, fmt.Sprintf("%s data is not valid base64", label)
	}
	if len(decoded) == 0 || len(decoded) > 4*1024*1024 {
		return "", 400, fmt.Sprintf("%s image must be between 1 byte and 4MB", label)
	}
	ext := ".png"
	switch mime {
	case "image/jpeg":
		ext = ".jpg"
	case "image/webp":
		ext = ".webp"
	case "image/gif":
		ext = ".gif"
	}
	if err := os.MkdirAll(s.AvatarDir, 0o755); err != nil {
		return "", 500, "failed to prepare profile media storage"
	}
	baseName := fmt.Sprintf("%s_%s_%d%s", namePrefix, strings.ReplaceAll(userID, "-", ""), time.Now().UnixNano(), ext)
	fullPath := filepath.Join(s.AvatarDir, baseName)
	if err := os.WriteFile(fullPath, decoded, 0o644); err != nil {
		return "", 500, fmt.Sprintf("failed to save %s", label)
	}
	base := strings.TrimSpace(s.AvatarURLBase)
	if base == "" {
		base = "/avatars"
	}
	base = "/" + strings.Trim(base, "/")
	return fmt.Sprintf("%s/%s?v=%d", base, baseName, time.Now().Unix()), 0, ""
}
