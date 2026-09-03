package sync

import (
	"testing"
	"time"
)

func TestPollingSinceOverlapsCursor(t *testing.T) {
	cursor := time.Date(2026, 9, 3, 10, 0, 0, 500_000_000, time.UTC)
	got := pollingSince(&cursor)
	if got == nil || !got.Equal(cursor.Add(-time.Second)) {
		t.Fatalf("pollingSince() = %v, want %v", got, cursor.Add(-time.Second))
	}
}

func TestPollingModeUsesBaselineUntilBothCursorsExist(t *testing.T) {
	if got := pollingMode(nil, true); got != "baseline" {
		t.Fatalf("pollingMode(nil, true) = %q, want baseline", got)
	}
	cursor := time.Now().UTC()
	if got := pollingMode(&cursor, true); got != "incremental" {
		t.Fatalf("pollingMode(cursor, true) = %q, want incremental", got)
	}
	if got := pollingMode(&cursor, false); got != "full compatibility scan" {
		t.Fatalf("pollingMode(cursor, false) = %q, want full compatibility scan", got)
	}
}

func TestIssuePollingWindowBackfillsBeforeIncrementalPolling(t *testing.T) {
	cursor := time.Date(2026, 9, 3, 10, 0, 0, 0, time.UTC)
	if since, mode := issuePollingWindow(&cursor, nil, true); since != nil || mode != "workflow label backfill" {
		t.Fatalf("issuePollingWindow() = (%v, %q), want (nil, workflow label backfill)", since, mode)
	}

	backfilledAt := cursor.Add(time.Minute)
	since, mode := issuePollingWindow(&cursor, &backfilledAt, true)
	if since == nil || !since.Equal(cursor.Add(-time.Second)) || mode != "incremental" {
		t.Fatalf("issuePollingWindow() after backfill = (%v, %q), want overlapping incremental window", since, mode)
	}
}
