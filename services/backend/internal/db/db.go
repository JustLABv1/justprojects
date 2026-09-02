package db

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/config"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"github.com/uptrace/bun/driver/pgdriver"
)

type Store struct {
	DB *bun.DB
}

func Open(ctx context.Context, cfg config.DatabaseConfig) (*Store, error) {
	connector := pgdriver.NewConnector(
		pgdriver.WithAddr(net.JoinHostPort(cfg.Server, fmt.Sprintf("%d", cfg.Port))),
		pgdriver.WithDatabase(cfg.Name),
		pgdriver.WithUser(cfg.User),
		pgdriver.WithPassword(cfg.Password),
		pgdriver.WithInsecure(cfg.SSLMode == "disable"),
	)
	sqldb := sql.OpenDB(connector)
	maxOpen := cfg.MaxOpenConns
	if maxOpen <= 0 {
		maxOpen = 20
	}
	maxIdle := cfg.MaxIdleConns
	if maxIdle <= 0 {
		maxIdle = 5
	}
	idleFor := cfg.ConnMaxIdleFor
	if idleFor <= 0 {
		idleFor = 5 * time.Minute
	}
	sqldb.SetMaxOpenConns(maxOpen)
	sqldb.SetMaxIdleConns(maxIdle)
	sqldb.SetConnMaxIdleTime(idleFor)

	db := bun.NewDB(sqldb, pgdialect.New())
	if err := db.PingContext(ctx); err != nil {
		_ = sqldb.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return &Store{DB: db}, nil
}

func (s *Store) Close() error {
	return s.DB.Close()
}

func (s *Store) Migrate(ctx context.Context) error {
	return runMigrations(ctx, s.DB)
}
