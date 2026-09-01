package sync

import (
	"testing"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/google/uuid"
)

func TestStatusForRemoteState(t *testing.T) {
	doneID := uuid.New()
	progressID := uuid.New()
	statuses := []db.ProjectStatus{
		{Name: "Ready", Category: "todo", RecordFields: db.RecordFields{ID: uuid.New()}},
		{Name: "Building", Category: "in_progress", RecordFields: db.RecordFields{ID: progressID}},
		{Name: "Shipped", Category: "done", RecordFields: db.RecordFields{ID: doneID}},
	}
	if got, ok := StatusForRemoteState(statuses, true); !ok || got != doneID {
		t.Fatalf("closed state = (%v, %v), want (%v, true)", got, ok, doneID)
	}
	if got, ok := StatusForRemoteState(statuses, false); !ok || got != progressID {
		t.Fatalf("open state = (%v, %v), want (%v, true)", got, ok, progressID)
	}
}

func TestIsConflictOnlyWhenBothSourcesChanged(t *testing.T) {
	now := time.Now()
	if !IsConflict(FieldChange{Source: "local", ChangedAt: now}, FieldChange{Source: "github", ChangedAt: now}) {
		t.Fatal("expected a local/remote simultaneous change to conflict")
	}
	if IsConflict(FieldChange{Source: "local", ChangedAt: now}, FieldChange{Source: "local", ChangedAt: now}) {
		t.Fatal("same-source changes should not conflict")
	}
}
