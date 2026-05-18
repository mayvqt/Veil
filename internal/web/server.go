package web

import (
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"veil/internal/chat"
	"veil/internal/db"
)

type Server struct {
	Store          *db.Store
	Hub            *chat.Hub
	Secret         string
	CookieSecure   bool
	SessionMaxAge  time.Duration
	AllowedOrigins map[string]struct{}
	RetainDays     int
	RetainCount    int
	presenceMu     sync.Mutex
	presenceCounts map[string]int
}

func New(store *db.Store) *Server {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		secret = "dev-secret-change-me"
	}
	cookieSecure := strings.EqualFold(os.Getenv("COOKIE_SECURE"), "true")
	if cookieSecure && secret == "dev-secret-change-me" {
		log.Println("warning: COOKIE_SECURE=true with default SESSION_SECRET; set a strong SESSION_SECRET before exposing Veil")
	}
	return &Server{
		Store:          store,
		Hub:            chat.NewHub(),
		Secret:         secret,
		CookieSecure:   cookieSecure,
		SessionMaxAge:  sessionMaxAgeFromEnv(),
		AllowedOrigins: allowedOriginsFromEnv(),
		RetainDays:     positiveIntFromEnv("MESSAGE_RETENTION_DAYS"),
		RetainCount:    positiveIntFromEnv("MESSAGE_RETENTION_COUNT"),
		presenceCounts: map[string]int{},
	}
}

func isAdminRole(role string) bool {
	return role == "root_admin" || role == "admin"
}
