package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr            string
	WorkerPollInterval  time.Duration
	DatabaseURL         string
	FrontendURL         string
	APIURL              string
	SessionCookieName   string
	SessionTTL          time.Duration
	SecureCookies       bool
	AllowedOrigins      []string
	AppEncryptionKey    string
	GitHubAppID         string
	GitHubAppSlug       string
	GitHubAppPrivateKey string
	GitHubOAuthClientID string
	GitHubOAuthSecret   string
	GitHubWebhookSecret string
	OIDCIssuerURL       string
	OIDCClientID        string
	OIDCClientSecret    string
	OIDCRedirectURL     string
}

func Load() (Config, error) {
	c := Config{
		HTTPAddr:            getenv("HTTP_ADDR", ":8080"),
		WorkerPollInterval:  getenvDuration("WORKER_POLL_INTERVAL", 5*time.Second),
		DatabaseURL:         getenv("DATABASE_URL", "postgres://justprojects:justprojects@localhost:5432/justprojects?sslmode=disable"),
		FrontendURL:         strings.TrimRight(getenv("FRONTEND_URL", "http://localhost:3000"), "/"),
		APIURL:              strings.TrimRight(getenv("API_URL", "http://localhost:8080"), "/"),
		SessionCookieName:   getenv("SESSION_COOKIE_NAME", "justprojects_session"),
		SessionTTL:          getenvDuration("SESSION_TTL", 30*24*time.Hour),
		SecureCookies:       getenvBool("SECURE_COOKIES", false),
		AllowedOrigins:      splitList(getenv("ALLOWED_ORIGINS", "http://localhost:3000")),
		AppEncryptionKey:    os.Getenv("APP_ENCRYPTION_KEY"),
		GitHubAppID:         os.Getenv("GITHUB_APP_ID"),
		GitHubAppSlug:       os.Getenv("GITHUB_APP_SLUG"),
		GitHubAppPrivateKey: os.Getenv("GITHUB_APP_PRIVATE_KEY"),
		GitHubOAuthClientID: os.Getenv("GITHUB_OAUTH_CLIENT_ID"),
		GitHubOAuthSecret:   os.Getenv("GITHUB_OAUTH_CLIENT_SECRET"),
		GitHubWebhookSecret: os.Getenv("GITHUB_WEBHOOK_SECRET"),
		OIDCIssuerURL:       os.Getenv("OIDC_ISSUER_URL"),
		OIDCClientID:        os.Getenv("OIDC_CLIENT_ID"),
		OIDCClientSecret:    os.Getenv("OIDC_CLIENT_SECRET"),
		OIDCRedirectURL:     os.Getenv("OIDC_REDIRECT_URL"),
	}

	if c.AppEncryptionKey == "" {
		// Development remains convenient while production can require an explicit key.
		key := make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			return Config{}, fmt.Errorf("generate development encryption key: %w", err)
		}
		c.AppEncryptionKey = hex.EncodeToString(key)
	}
	return c, nil
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getenvDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getenvBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func splitList(value string) []string {
	items := strings.Split(value, ",")
	result := make([]string, 0, len(items))
	for _, item := range items {
		if item = strings.TrimSpace(item); item != "" {
			result = append(result, item)
		}
	}
	return result
}
