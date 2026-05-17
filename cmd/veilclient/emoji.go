package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const terminalImageMaxBytes = 1024 * 1024

var (
	terminalImageCache = map[string]string{}
	terminalImageDir   string
)

var emoticonMap = map[string]string{
	":)":         "😊",
	":-)":        "😊",
	":D":         "😄",
	":-D":        "😄",
	":(":         "🙁",
	":-(":        "🙁",
	";)":         "😉",
	";-)":        "😉",
	":P":         "😛",
	":-P":        "😛",
	":p":         "😛",
	":-p":        "😛",
	":O":         "😮",
	":-O":        "😮",
	":o":         "😮",
	":-o":        "😮",
	":|":         "😐",
	":-|":        "😐",
	"<3":         "❤",
	":fire:":     "🔥",
	":lock:":     "🔒",
	":thumbsup:": "👍",
	":100:":      "💯",
}

func convertEmoticons(text string) string {
	out := text
	for code, emoji := range emoticonMap {
		pattern := regexp.MustCompile(`(^|\s)` + regexp.QuoteMeta(code) + `($|\s)`)
		out = pattern.ReplaceAllStringFunc(out, func(match string) string {
			prefix := ""
			suffix := ""
			if strings.HasPrefix(match, " ") || strings.HasPrefix(match, "\t") || strings.HasPrefix(match, "\n") {
				prefix = match[:1]
			}
			if strings.HasSuffix(match, " ") || strings.HasSuffix(match, "\t") || strings.HasSuffix(match, "\n") {
				suffix = match[len(match)-1:]
			}
			return prefix + emoji + suffix
		})
	}
	return out
}

func terminalSafeText(text string) string {
	text = strings.ReplaceAll(text, "❤️", "❤")
	text = strings.ReplaceAll(text, "♥️", "♥")
	return text
}

func displayMessageText(text string) string {
	payload, ok := parseTerminalImagePayload(text)
	if ok {
		label := imageLabel(payload)
		if path, data, err := cachedTerminalImage(payload); err == nil {
			label = osc8FileLink(label, path)
			if preview := terminalImagePreview(path, data, payload); preview != "" {
				label = preview + label
			}
		}
		if strings.TrimSpace(payload.Caption) != "" {
			return label + " " + terminalSafeText(payload.Caption)
		}
		return label
	}
	return terminalSafeText(text)
}

type terminalImagePayload struct {
	V       int    `json:"v"`
	Type    string `json:"type"`
	Mime    string `json:"mime"`
	Name    string `json:"name"`
	Size    int    `json:"size"`
	Data    string `json:"data"`
	Caption string `json:"caption"`
}

func parseTerminalImagePayload(text string) (terminalImagePayload, bool) {
	var payload terminalImagePayload
	if err := json.Unmarshal([]byte(text), &payload); err != nil {
		return terminalImagePayload{}, false
	}
	if payload.V != 1 || payload.Type != "image" || strings.TrimSpace(payload.Data) == "" {
		return terminalImagePayload{}, false
	}
	if imageExt(payload.Mime) == "" {
		return terminalImagePayload{}, false
	}
	return payload, true
}

func imageLabel(payload terminalImagePayload) string {
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		name = "image"
	}
	name = strings.ReplaceAll(name, "\n", " ")
	name = strings.ReplaceAll(name, "\r", " ")
	if len(name) > 80 {
		name = name[:80]
	}
	return "[image: " + name + "]"
}

func imageExt(mime string) string {
	switch strings.ToLower(strings.TrimSpace(mime)) {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ""
	}
}

func cachedTerminalImage(payload terminalImagePayload) (string, []byte, error) {
	sum := sha256.Sum256([]byte(payload.Mime + "\x00" + payload.Data))
	key := hex.EncodeToString(sum[:])
	decoded, err := base64.StdEncoding.DecodeString(payload.Data)
	if err != nil {
		return "", nil, err
	}
	if len(decoded) > terminalImageMaxBytes {
		return "", nil, os.ErrInvalid
	}
	if path := terminalImageCache[key]; path != "" {
		return path, decoded, nil
	}
	dir, err := terminalImageCacheDir()
	if err != nil {
		return "", nil, err
	}
	path := filepath.Join(dir, key+imageExt(payload.Mime))
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := os.WriteFile(path, decoded, 0600); err != nil {
			return "", nil, err
		}
	}
	terminalImageCache[key] = path
	return path, decoded, nil
}

func terminalImageCacheDir() (string, error) {
	if terminalImageDir != "" {
		return terminalImageDir, nil
	}
	dir, err := os.MkdirTemp("", "veil-images-*")
	if err != nil {
		return "", err
	}
	if err := os.Chmod(dir, 0700); err != nil {
		_ = os.RemoveAll(dir)
		return "", err
	}
	terminalImageDir = dir
	return terminalImageDir, nil
}

func cleanupTerminalImageCache() {
	if terminalImageDir != "" {
		_ = os.RemoveAll(terminalImageDir)
	}
	terminalImageDir = ""
	terminalImageCache = map[string]string{}
}

func osc8FileLink(label, path string) string {
	u := url.URL{Scheme: "file", Path: path}
	return "\x1b]8;;" + u.String() + "\x1b\\" + label + "\x1b]8;;\x1b\\"
}

func terminalImagePreview(path string, data []byte, payload terminalImagePayload) string {
	switch terminalImageProtocol() {
	case "kitty":
		return kittyImage(path)
	case "iterm":
		return itermImage(data, payload)
	default:
		return ""
	}
}

func terminalImageProtocol() string {
	override := strings.ToLower(strings.TrimSpace(os.Getenv("VEIL_TUI_IMAGE_PROTOCOL")))
	switch override {
	case "off", "none", "link":
		return ""
	case "kitty", "iterm":
		return override
	}
	return ""
}

func kittyImage(path string) string {
	encodedPath := base64.StdEncoding.EncodeToString([]byte(path))
	return "\x1b_Ga=T,t=f,f=100,q=2,c=24,r=8;" + encodedPath + "\x1b\\"
}

func itermImage(data []byte, payload terminalImagePayload) string {
	name := base64.StdEncoding.EncodeToString([]byte(imageLabel(payload)))
	body := base64.StdEncoding.EncodeToString(data)
	return "\x1b]1337;File=inline=1;width=24;height=8;preserveAspectRatio=1;name=" + name + ":" + body + "\a"
}
