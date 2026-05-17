package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"veil/internal/db"
	"veil/internal/web"
)

func main() {
	secret := os.Getenv("SESSION_SECRET")
	addr := os.Getenv("APP_BIND_ADDR")
	if addr == "" {
		addr = ":3847"
	}
	if strings.TrimSpace(secret) == "" {
		secret = "dev-secret-change-me"
	}
	if secret == "dev-secret-change-me" && !allowInsecureDevSecret() {
		log.Fatal("refusing to start with default SESSION_SECRET outside local dev; set SESSION_SECRET or ALLOW_INSECURE_DEFAULT_SECRET=true")
	}

	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "./veil.db"
	}
	store, err := db.Open(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	srv := web.New(store)
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           srv.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("Veil listening on %s", addr)
	log.Fatal(httpServer.ListenAndServe())
}

func allowInsecureDevSecret() bool {
	if strings.EqualFold(os.Getenv("ALLOW_INSECURE_DEFAULT_SECRET"), "true") {
		return true
	}
	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	return appEnv == "" || appEnv == "dev" || appEnv == "development" || appEnv == "local"
}
