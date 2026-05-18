package web

import (
	"os"
	"path/filepath"
	"strings"
)

func avatarFileNameFromURL(avatarURL string) string {
	raw := strings.TrimSpace(avatarURL)
	if !strings.HasPrefix(raw, "/static/avatars/") && !strings.HasPrefix(raw, "/avatars/") {
		return ""
	}
	name := strings.TrimPrefix(raw, "/static/avatars/")
	name = strings.TrimPrefix(name, "/avatars/")
	if idx := strings.IndexByte(name, '?'); idx >= 0 {
		name = name[:idx]
	}
	name = filepath.Base(name)
	if name == "." || name == "" {
		return ""
	}
	return name
}

func removeAvatarFileIfLocal(avatarDir, avatarURL string) {
	name := avatarFileNameFromURL(avatarURL)
	if name == "" {
		return
	}
	_ = os.Remove(filepath.Join(avatarDir, name))
}

func (s *Server) pruneUnusedAvatarFiles() {
	refs, err := s.Store.ListActiveAvatarURLs()
	if err != nil {
		return
	}
	keep := map[string]struct{}{}
	for _, ref := range refs {
		name := avatarFileNameFromURL(ref)
		if name != "" {
			keep[name] = struct{}{}
		}
	}
	entries, err := os.ReadDir(s.AvatarDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if _, ok := keep[name]; ok {
			continue
		}
		_ = os.Remove(filepath.Join(s.AvatarDir, name))
	}
}
