package sync

import (
	"testing"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/google/uuid"
)

func TestStatusForRemoteState(t *testing.T) {
	doneID := uuid.New()
	todoID := uuid.New()
	progressID := uuid.New()
	statuses := []db.ProjectStatus{
		{Name: "Ready", Category: "todo", RecordFields: db.RecordFields{ID: todoID}},
		{Name: "Building", Category: "in_progress", RecordFields: db.RecordFields{ID: progressID}},
		{Name: "Shipped", Category: "done", RecordFields: db.RecordFields{ID: doneID}},
	}
	if got, ok := StatusForRemoteState(statuses, true); !ok || got != doneID {
		t.Fatalf("closed state = (%v, %v), want (%v, true)", got, ok, doneID)
	}
	if got, ok := StatusForRemoteState(statuses, false); !ok || got != todoID {
		t.Fatalf("open state = (%v, %v), want (%v, true)", got, ok, todoID)
	}
}

func TestStatusForRemoteIssueUsesManagedWorkflowLabels(t *testing.T) {
	projectKey := "JP"
	todoID := uuid.New()
	qaID := uuid.New()
	doneID := uuid.New()
	statuses := []db.ProjectStatus{
		{Name: "Todo", Category: "todo", RecordFields: db.RecordFields{ID: todoID}},
		{Name: "Ready for QA", Category: "in_progress", RecordFields: db.RecordFields{ID: qaID}},
		{Name: "Released", Category: "done", RecordFields: db.RecordFields{ID: doneID}},
	}
	qaLabel, _ := ProviderStatusLabelForStatus(projectKey, statuses, qaID)
	doneLabel, _ := ProviderStatusLabelForStatus(projectKey, statuses, doneID)

	if got, ok, fromLabel, err := StatusForRemoteIssue(projectKey, statuses, "open", []string{qaLabel}); err != nil || !ok || !fromLabel || got != qaID {
		t.Fatalf("custom open status = (%v, %v, %v, %v), want QA status from label", got, ok, fromLabel, err)
	}
	if got, ok, fromLabel, err := StatusForRemoteIssue(projectKey, statuses, "closed", []string{doneLabel}); err != nil || !ok || !fromLabel || got != doneID {
		t.Fatalf("custom done status = (%v, %v, %v, %v), want done status from label", got, ok, fromLabel, err)
	}
	if got, ok, fromLabel, err := StatusForRemoteIssue(projectKey, statuses, "open", nil); err != nil || !ok || fromLabel || got != todoID {
		t.Fatalf("unlabelled open status = (%v, %v, %v, %v), want Todo fallback", got, ok, fromLabel, err)
	}
	if got, ok, fromLabel, err := StatusForRemoteIssue(projectKey, statuses, "closed", []string{qaLabel}); err != nil || !ok || fromLabel || got != doneID {
		t.Fatalf("inconsistent closed status = (%v, %v, %v, %v), want Done fallback", got, ok, fromLabel, err)
	}
	if _, _, _, err := StatusForRemoteIssue(projectKey, statuses, "open", []string{qaLabel, doneLabel}); err == nil {
		t.Fatal("expected multiple managed workflow labels to be rejected")
	}
}

func TestWithProviderStatusLabelPreservesOrdinaryLabels(t *testing.T) {
	currentID := uuid.New()
	desiredID := uuid.New()
	otherID := uuid.New()
	statuses := []db.ProjectStatus{
		{Name: "Ready", Category: "todo", RecordFields: db.RecordFields{ID: currentID}},
		{Name: "Review", Category: "in_progress", RecordFields: db.RecordFields{ID: desiredID}},
	}
	currentLabel := ProviderStatusLabel("JP", currentID, "Ready")
	otherLabel := ProviderStatusLabel("OTHER", otherID, "In progress")
	desiredLabel := ProviderStatusLabel("JP", desiredID, "Review")
	labels := WithProviderStatusLabel("JP", statuses, []string{"bug", currentLabel, otherLabel, "Bug"}, desiredLabel)
	if len(labels) != 3 || labels[0] != "bug" || labels[1] != otherLabel || labels[2] != desiredLabel {
		t.Fatalf("labels = %#v, want ordinary label, other-project label, and replacement workflow label", labels)
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
