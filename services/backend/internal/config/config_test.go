package config

import (
	"testing"
	"time"
)

func TestLoadUsesDiscreteDatabaseSettings(t *testing.T) {
	t.Setenv("DATABASE_SERVER", "db.internal.example")
	t.Setenv("DATABASE_PORT", "6432")
	t.Setenv("DATABASE_NAME", "projects")
	t.Setenv("DATABASE_USER", "projects_app")
	t.Setenv("DATABASE_PASSWORD", "secret")
	t.Setenv("DATABASE_SSLMODE", "require")
	t.Setenv("DATABASE_MAX_OPEN_CONNS", "31")
	t.Setenv("DATABASE_MAX_IDLE_CONNS", "7")
	t.Setenv("DATABASE_CONN_MAX_IDLE", "11m")
	t.Setenv("APP_ENCRYPTION_KEY", "stable-test-key")

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	got := loaded.Database
	if got.Server != "db.internal.example" || got.Port != 6432 || got.Name != "projects" || got.User != "projects_app" || got.Password != "secret" || got.SSLMode != "require" {
		t.Fatalf("unexpected database identity settings: %+v", got)
	}
	if got.MaxOpenConns != 31 || got.MaxIdleConns != 7 || got.ConnMaxIdleFor != 11*time.Minute {
		t.Fatalf("unexpected database pool settings: %+v", got)
	}
}

func TestLoadFallsBackForInvalidDiscreteValues(t *testing.T) {
	t.Setenv("DATABASE_PORT", "not-a-port")
	t.Setenv("DATABASE_MAX_OPEN_CONNS", "0")
	t.Setenv("DATABASE_MAX_IDLE_CONNS", "-1")
	t.Setenv("DATABASE_CONN_MAX_IDLE", "not-a-duration")
	t.Setenv("APP_ENCRYPTION_KEY", "stable-test-key")

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if loaded.Database.Port != 5432 || loaded.Database.MaxOpenConns != 20 || loaded.Database.MaxIdleConns != 5 || loaded.Database.ConnMaxIdleFor != 5*time.Minute {
		t.Fatalf("invalid discrete values were not replaced with defaults: %+v", loaded.Database)
	}
}

func TestLoadUsesScheduledSyncInterval(t *testing.T) {
	t.Setenv("GIT_SYNC_INTERVAL", "17m")
	t.Setenv("APP_ENCRYPTION_KEY", "stable-test-key")

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if loaded.SyncPollInterval != 17*time.Minute {
		t.Fatalf("SyncPollInterval = %s, want 17m", loaded.SyncPollInterval)
	}
}

func TestLoadFallsBackForNonPositiveScheduledSyncInterval(t *testing.T) {
	t.Setenv("GIT_SYNC_INTERVAL", "0s")
	t.Setenv("APP_ENCRYPTION_KEY", "stable-test-key")

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if loaded.SyncPollInterval != 5*time.Minute {
		t.Fatalf("SyncPollInterval = %s, want default 5m", loaded.SyncPollInterval)
	}
}
