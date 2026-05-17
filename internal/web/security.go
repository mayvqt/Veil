package web

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"
)

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
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
		w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'self'; frame-ancestors 'none'")
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
