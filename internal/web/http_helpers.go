package web

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func randomToken() (string, error) {
	b := make([]byte, 18)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate random token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func setSessionCookie(w http.ResponseWriter, session string, secure bool, maxAge time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     "veil_session",
		Value:    session,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		Path:     "/",
		MaxAge:   int(maxAge.Seconds()),
		Expires:  time.Now().Add(maxAge),
	})
}
