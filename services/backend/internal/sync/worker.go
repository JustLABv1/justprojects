package sync

import (
	"context"
	"fmt"

	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/google/uuid"
)

func ProcessJob(ctx context.Context, store *db.Store, job *db.OutboxJob) error {
	return (Processor{Store: store}).ProcessJob(ctx, job)
}

func ParseUUID(payload map[string]any, key string) (uuid.UUID, error) {
	value, ok := payload[key].(string)
	if !ok {
		return uuid.Nil, fmt.Errorf("payload key %s is not a string", key)
	}
	return uuid.Parse(value)
}
