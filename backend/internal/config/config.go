package config

import "os"

type Config struct {
	HTTPAddr    string
	DatabaseURL string
}

func FromEnv() Config {
	return Config{
		HTTPAddr:    envOrDefault("HTTP_ADDR", ":8080"),
		DatabaseURL: envOrDefault("DATABASE_URL", "postgres://stockroom:stockroom@localhost:5432/stockroom?sslmode=disable"),
	}
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
