package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"stockroom/backend/internal/config"
	"stockroom/backend/internal/database"
	"stockroom/backend/internal/httpapi"
	"stockroom/backend/internal/repository"
)

func main() {
	cfg := config.FromEnv()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database startup failed: %v", err)
	}
	defer pool.Close()

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           httpapi.NewServer(repository.NewStore(pool)).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("stockroom backend listening on %s", cfg.HTTPAddr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server failed: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownContext); err != nil {
		log.Printf("http shutdown failed: %v", err)
	}
}
