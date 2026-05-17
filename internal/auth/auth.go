package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"time"
)

func Sign(value, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(value))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return value + "." + sig
}

func Verify(signed, secret string) (string, bool) {
	parts := strings.Split(signed, ".")
	if len(parts) != 2 {
		return "", false
	}
	expected := Sign(parts[0], secret)
	if !hmac.Equal([]byte(expected), []byte(signed)) {
		return "", false
	}
	return parts[0], true
}

func NewSession(userID string) string {
	return userID + "|" + time.Now().UTC().Format(time.RFC3339)
}
