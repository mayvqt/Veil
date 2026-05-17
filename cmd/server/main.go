package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"veil/internal/db"
	"veil/internal/web"
)

func main() {
	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "./veil.db"
	}
	store, err := db.Open(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	srv := web.New(store)
	addr := os.Getenv("APP_BIND_ADDR")
	if addr == "" {
		addr = ":3847"
	}
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
