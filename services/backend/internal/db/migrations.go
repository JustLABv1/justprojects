package db

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/uptrace/bun"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

func runMigrations(ctx context.Context, database *bun.DB) error {
	if _, err := database.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return fmt.Errorf("create migration table: %w", err)
	}

	entries, err := fs.Glob(migrationFiles, "migrations/*.sql")
	if err != nil {
		return fmt.Errorf("list migrations: %w", err)
	}
	sort.Strings(entries)
	for _, entry := range entries {
		version := strings.TrimSuffix(strings.TrimPrefix(entry, "migrations/"), ".sql")
		contents, err := migrationFiles.ReadFile(entry)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", version, err)
		}
		tx, err := database.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", version, err)
		}
		// API and worker processes can start together. Keep the check, DDL, and
		// migration record in one transaction guarded by a PostgreSQL advisory
		// lock so only one process applies a version.
		if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('justprojects:migrations'))`); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("lock migration %s: %w", version, err)
		}
		applied, checkErr := tx.NewSelect().Table("schema_migrations").Where("version = ?", version).Count(ctx)
		if checkErr != nil {
			_ = tx.Rollback()
			return fmt.Errorf("check migration %s: %w", version, checkErr)
		}
		if applied > 0 {
			_ = tx.Rollback()
			continue
		}
		if _, err = tx.ExecContext(ctx, string(contents)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", version, err)
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO schema_migrations (version) VALUES (?)`, version); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record migration %s: %w", version, err)
		}
		if err = tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", version, err)
		}
	}
	return nil
}
