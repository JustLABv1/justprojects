package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"github.com/uptrace/bun/driver/pgdriver"
)

type Store struct {
	DB *bun.DB
}

func Open(ctx context.Context, dsn string) (*Store, error) {
	sqldb := sql.OpenDB(pgdriver.NewConnector(pgdriver.WithDSN(dsn)))
	sqldb.SetMaxOpenConns(20)
	sqldb.SetMaxIdleConns(5)
	sqldb.SetConnMaxIdleTime(5 * time.Minute)

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
