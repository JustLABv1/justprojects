package sync

import (
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/google/uuid"
)

var SynchronizedFields = []string{"title", "body", "state", "labels", "assignees", "milestone"}

type FieldChange struct {
	Value     any
	ChangedAt time.Time
	Source    string
}

func IsConflict(local, remote FieldChange) bool {
	if local.Source == "" || remote.Source == "" || local.Source == remote.Source {
		return false
	}
	return !local.ChangedAt.IsZero() && !remote.ChangedAt.IsZero()
}

func StatusForRemoteState(statuses []db.ProjectStatus, closed bool) (uuid.UUID, bool) {
	wanted := "in_progress"
	if closed {
		wanted = "done"
	}
	for _, status := range statuses {
		if status.Category == wanted {
			return status.ID, true
		}
	}
	for _, status := range statuses {
		if closed && status.Category == "done" {
			return status.ID, true
		}
		if !closed && status.Category != "done" {
			return status.ID, true
		}
	}
	return uuid.Nil, false
}
