package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/config"
	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/JustLABv1/justprojects/services/backend/internal/queue"
	projectsync "github.com/JustLABv1/justprojects/services/backend/internal/sync"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)
	cfg, err := config.Load()
	if err != nil {
		logger.Error("load config", "error", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	store, err := db.Open(ctx, cfg.Database)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}
	defer store.Close()
	if err = store.Migrate(ctx); err != nil {
		logger.Error("run migrations", "error", err)
		os.Exit(1)
	}
	logger.Info("sync worker started", "poll_interval", cfg.WorkerPollInterval.String())
	jobs := queue.Queue{Store: store}
	processor, err := projectsync.NewProcessor(store, cfg)
	if err != nil {
		logger.Error("initialize sync processor", "error", err)
		os.Exit(1)
	}
	ticker := time.NewTicker(cfg.WorkerPollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			logger.Info("sync worker stopped")
			return
		case <-ticker.C:
			for {
				processed, processErr := jobs.RunOnce(ctx, func(jobCtx context.Context, job *db.OutboxJob) error {
					return processor.ProcessJob(jobCtx, job)
				})
				if processErr != nil {
					if errors.Is(processErr, queue.ErrDeferred) {
						logger.Info("defer outbox processing", "reason", processErr)
					} else {
						logger.Error("process outbox", "error", processErr)
					}
					break
				}
				if !processed {
					break
				}
			}
		}
	}
}
