package web

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const maxJSONPayloadBytes = 8 * 1024 * 1024
const contentSecurityPolicy = "default-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; base-uri 'self'; frame-ancestors 'none'"

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) error {
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0]))
	if contentType != "application/json" {
		return errors.New("content-type must be application/json")
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONPayloadBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return err
	}
	// Reject payloads with trailing bytes or multiple JSON values.
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("invalid trailing JSON")
	}
	return nil
}

func cleanInput(value string, maxLen int) string {
	value = strings.TrimSpace(value)
	if len(value) > maxLen {
		value = value[:maxLen]
	}
	return value
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Content-Security-Policy", contentSecurityPolicy)
		next.ServeHTTP(w, r)
	})
}

func allowedOriginsFromEnv() map[string]struct{} {
	out := map[string]struct{}{}
	for _, raw := range strings.Split(os.Getenv("PUBLIC_ORIGIN"), ",") {
		origin := strings.TrimSpace(raw)
		if origin != "" {
			out[origin] = struct{}{}
		}
	}
	return out
}

func sessionMaxAgeFromEnv() time.Duration {
	raw := strings.TrimSpace(os.Getenv("SESSION_MAX_AGE_HOURS"))
	if raw == "" {
		return 30 * 24 * time.Hour
	}
	hours, err := time.ParseDuration(raw + "h")
	if err != nil || hours <= 0 {
		return 30 * 24 * time.Hour
	}
	return hours
}

func positiveIntFromEnv(key string) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return 0
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		return 0
	}
	return v
}
