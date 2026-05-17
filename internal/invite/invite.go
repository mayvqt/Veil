package invite

import (
	"crypto/sha256"
	"encoding/base64"
)

func HashToken(token string) string {
	s := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(s[:])
}
