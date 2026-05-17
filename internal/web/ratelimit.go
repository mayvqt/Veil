package web

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rateBucket
}

type rateBucket struct {
	count   int
	expires time.Time
}

var globalRateLimiter = &rateLimiter{buckets: map[string]*rateBucket{}}

func (l *rateLimiter) allow(key string, limit int, window time.Duration) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()

	b := l.buckets[key]
	if b == nil || now.After(b.expires) {
		l.buckets[key] = &rateBucket{count: 1, expires: now.Add(window)}
		return true
	}
	if b.count >= limit {
		return false
	}
	b.count++
	return true
}

func checkRateLimit(w http.ResponseWriter, r *http.Request, scope string, limit int, window time.Duration) bool {
	key := scope + "|" + clientIP(r)
	if globalRateLimiter.allow(key, limit, window) {
		return true
	}
	writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many requests"})
	return false
}

func clientIP(r *http.Request) string {
	xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

