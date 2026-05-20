package web

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

var customMediaDataURLPattern = regexp.MustCompile(`^data:(image/(png|jpeg|webp|gif));base64,([a-zA-Z0-9+/=]+)$`)
var customMediaNamePattern = regexp.MustCompile(`^[a-z0-9_-]{1,32}$`)

func (s *Server) listCustomMedia(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomMembership(w, u.ID, roomID) {
		return
	}
	items, err := s.readCustomMediaItems(roomID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to list custom media"})
		return
	}
	writeJSON(w, 200, map[string]any{"items": items, "room_id": roomID})
}

func (s *Server) uploadCustomMedia(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomManager(w, u, roomID) {
		return
	}

	var req struct {
		Kind    string `json:"kind"`
		Name    string `json:"name"`
		DataURL string `json:"data_url"`
	}
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid payload"})
		return
	}
	kind := strings.ToLower(cleanInput(req.Kind, 12))
	if kind != "emoji" && kind != "sticker" {
		writeJSON(w, 400, map[string]string{"error": "kind must be emoji or sticker"})
		return
	}
	name := strings.ToLower(strings.TrimSpace(cleanInput(req.Name, 64)))
	if !customMediaNamePattern.MatchString(name) {
		writeJSON(w, 400, map[string]string{"error": "name must use a-z, 0-9, _ or - (max 32 chars)"})
		return
	}
	matches := customMediaDataURLPattern.FindStringSubmatch(strings.TrimSpace(req.DataURL))
	if len(matches) != 4 {
		writeJSON(w, 400, map[string]string{"error": "data_url must be a base64 image data URL (png/jpeg/webp/gif)"})
		return
	}
	mime := matches[1]
	raw, err := base64.StdEncoding.DecodeString(matches[3])
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": "image data is not valid base64"})
		return
	}
	if len(raw) == 0 || len(raw) > 8*1024*1024 {
		writeJSON(w, 400, map[string]string{"error": "image must be between 1 byte and 8MB"})
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
	if err := os.MkdirAll(s.MediaDir, 0o755); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to prepare custom media storage"})
		return
	}

	safeRoomID := sanitizeCustomMediaRoomID(roomID)
	prefix := customMediaPrefix(safeRoomID, kind, name)
	if _, err := removeCustomMediaByPrefix(s.MediaDir, prefix); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to replace existing custom media"})
		return
	}
	fileName := fmt.Sprintf("%s%d%s", prefix, time.Now().UnixNano(), ext)
	fullPath := filepath.Join(s.MediaDir, fileName)
	if err := os.WriteFile(fullPath, raw, 0o644); err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to save custom media"})
		return
	}

	base := strings.TrimSpace(s.MediaURLBase)
	if base == "" {
		base = "/media"
	}
	base = "/" + strings.Trim(base, "/")
	publicURL := fmt.Sprintf("%s/%s?v=%d", base, fileName, time.Now().Unix())
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "custom_media_upload", kind+":"+name, "room="+roomID)
	writeJSON(w, 200, map[string]any{
		"ok":      true,
		"room_id": roomID,
		"kind":    kind,
		"name":    name,
		"url":     publicURL,
		"token":   ":" + name + ":",
	})
}

func (s *Server) deleteCustomMedia(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	roomID := roomIDFromRequest(r)
	if !s.requireRoomManager(w, u, roomID) {
		return
	}
	kind := strings.ToLower(cleanInput(r.URL.Query().Get("kind"), 12))
	if kind != "emoji" && kind != "sticker" {
		writeJSON(w, 400, map[string]string{"error": "kind must be emoji or sticker"})
		return
	}
	name := strings.ToLower(cleanInput(chi.URLParam(r, "name"), 64))
	if !customMediaNamePattern.MatchString(name) {
		writeJSON(w, 400, map[string]string{"error": "invalid name"})
		return
	}
	n, err := removeCustomMediaByPrefix(s.MediaDir, customMediaPrefix(sanitizeCustomMediaRoomID(roomID), kind, name))
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "failed to delete custom media"})
		return
	}
	_ = s.Store.AddAdminAudit(u.ID, u.DisplayName, "custom_media_delete", kind+":"+name, "room="+roomID)
	writeJSON(w, 200, map[string]any{"ok": true, "room_id": roomID, "deleted": n})
}

func removeCustomMediaByPrefix(dir, prefix string) (int, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	deleted := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasPrefix(name, prefix) {
			continue
		}
		if err := os.Remove(filepath.Join(dir, name)); err != nil && !os.IsNotExist(err) {
			return deleted, err
		}
		deleted++
	}
	return deleted, nil
}

func (s *Server) readCustomMediaItems(roomID string) ([]map[string]string, error) {
	entries, err := os.ReadDir(s.MediaDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []map[string]string{}, nil
		}
		return nil, err
	}
	base := strings.TrimSpace(s.MediaURLBase)
	if base == "" {
		base = "/media"
	}
	base = "/" + strings.Trim(base, "/")
	items := make([]map[string]string, 0, len(entries))
	safeRoomID := sanitizeCustomMediaRoomID(roomID)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		fileName := entry.Name()
		fileRoomID, kind, name := parseCustomMediaName(fileName)
		if kind == "" || name == "" {
			continue
		}
		// Legacy files without explicit room prefix are treated as main-room assets.
		if fileRoomID == "" {
			fileRoomID = "main"
		}
		if fileRoomID != safeRoomID {
			continue
		}
		items = append(items, map[string]string{
			"kind":  kind,
			"name":  name,
			"url":   base + "/" + fileName,
			"token": ":" + name + ":",
		})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i]["kind"] != items[j]["kind"] {
			return items[i]["kind"] < items[j]["kind"]
		}
		return items[i]["name"] < items[j]["name"]
	})
	return items, nil
}

func parseCustomMediaName(fileName string) (string, string, string) {
	name := strings.TrimSpace(fileName)
	if strings.HasPrefix(name, "emoji_") {
		return "", "emoji", parseCustomMediaStem(strings.TrimPrefix(name, "emoji_"))
	}
	if strings.HasPrefix(name, "sticker_") {
		return "", "sticker", parseCustomMediaStem(strings.TrimPrefix(name, "sticker_"))
	}
	if strings.HasPrefix(name, "room_") {
		rest := strings.TrimPrefix(name, "room_")
		parts := strings.SplitN(rest, "_", 2)
		if len(parts) != 2 {
			return "", "", ""
		}
		roomID := sanitizeCustomMediaRoomID(parts[0])
		switch {
		case strings.HasPrefix(parts[1], "emoji_"):
			return roomID, "emoji", parseCustomMediaStem(strings.TrimPrefix(parts[1], "emoji_"))
		case strings.HasPrefix(parts[1], "sticker_"):
			return roomID, "sticker", parseCustomMediaStem(strings.TrimPrefix(parts[1], "sticker_"))
		}
	}
	return "", "", ""
}

func parseCustomMediaStem(input string) string {
	core := strings.TrimSpace(input)
	if dot := strings.LastIndex(core, "."); dot > 0 {
		core = core[:dot]
	}
	if under := strings.LastIndex(core, "_"); under > 0 {
		core = core[:under]
	}
	core = strings.ToLower(core)
	if !customMediaNamePattern.MatchString(core) {
		return ""
	}
	return core
}

func sanitizeCustomMediaRoomID(roomID string) string {
	v := strings.TrimSpace(strings.ToLower(roomID))
	if v == "" {
		return "main"
	}
	out := make([]rune, 0, len(v))
	for _, r := range v {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			out = append(out, r)
		}
	}
	if len(out) == 0 {
		return "main"
	}
	return string(out)
}

func customMediaPrefix(roomID, kind, name string) string {
	return fmt.Sprintf("room_%s_%s_%s_", roomID, kind, name)
}

func customMediaRoomPrefix(roomID string) string {
	return fmt.Sprintf("room_%s_", roomID)
}
