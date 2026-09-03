package sync

import (
	"fmt"
	"strings"

	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/google/uuid"
)

// ProviderStatusLabelPrefix is reserved for the workflow labels managed by
// JustProjects. Provider users can keep using every other label normally.
const ProviderStatusLabelPrefix = "jp-status:"

const providerStatusSlugLimit = 20

func providerStatusProjectKey(projectKey string) string {
	key := slugPart(projectKey, 12)
	if key == "" {
		return "project"
	}
	return key
}

// ProviderStatusLabel returns the stable provider label for a project status.
// The status id suffix keeps labels unique even when a workflow contains
// statuses with similar names. The label is persisted on ProjectStatus so
// renaming a custom status does not strand existing provider issues.
func ProviderStatusLabel(projectKey string, statusID uuid.UUID, name string) string {
	key := providerStatusProjectKey(projectKey)
	slug := slugPart(name, providerStatusSlugLimit)
	if slug == "" {
		slug = "status"
	}
	id := strings.ReplaceAll(statusID.String(), "-", "")
	if len(id) > 6 {
		id = id[:6]
	}
	return fmt.Sprintf("%s%s:%s-%s", ProviderStatusLabelPrefix, key, slug, id)
}

func slugPart(value string, limit int) string {
	var builder strings.Builder
	lastDash := false
	for _, char := range strings.ToLower(strings.TrimSpace(value)) {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') {
			if builder.Len() < limit {
				builder.WriteRune(char)
			}
			lastDash = false
			continue
		}
		if builder.Len() > 0 && !lastDash && builder.Len() < limit {
			builder.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(builder.String(), "-")
}

func statusProviderLabel(projectKey string, status db.ProjectStatus) string {
	if strings.TrimSpace(status.ProviderLabel) != "" {
		return strings.TrimSpace(status.ProviderLabel)
	}
	return ProviderStatusLabel(projectKey, status.ID, status.Name)
}

// ProviderStatusLabelForStatus resolves the label for a local workflow status.
func ProviderStatusLabelForStatus(projectKey string, statuses []db.ProjectStatus, statusID uuid.UUID) (string, bool) {
	for _, status := range statuses {
		if status.ID == statusID {
			return statusProviderLabel(projectKey, status), true
		}
	}
	return "", false
}

func IsProviderStatusLabel(value string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(value)), ProviderStatusLabelPrefix)
}

// SplitProviderStatusLabels separates JustProjects-managed workflow labels
// from ordinary provider labels. Managed labels are never exposed as ordinary
// task labels or replaced by a user's custom label selection.
func SplitProviderStatusLabels(labels []string) (ordinary, managed []string) {
	ordinary = make([]string, 0, len(labels))
	managed = make([]string, 0, 1)
	seenOrdinary := make(map[string]bool, len(labels))
	seenManaged := make(map[string]bool, 1)
	for _, raw := range labels {
		label := strings.TrimSpace(raw)
		if label == "" {
			continue
		}
		key := strings.ToLower(label)
		if IsProviderStatusLabel(label) {
			if !seenManaged[key] {
				managed = append(managed, label)
				seenManaged[key] = true
			}
			continue
		}
		if !seenOrdinary[key] {
			ordinary = append(ordinary, label)
			seenOrdinary[key] = true
		}
	}
	return ordinary, managed
}

// WorkflowStatusLabels returns only the managed labels belonging to the
// current project's persisted workflow statuses. This matters when one
// repository is attached to multiple projects: their managed labels must
// coexist on the provider issue.
func WorkflowStatusLabels(projectKey string, statuses []db.ProjectStatus, labels []string) []string {
	known := make(map[string]bool, len(statuses))
	for _, status := range statuses {
		known[strings.ToLower(statusProviderLabel(projectKey, status))] = true
	}
	_, managed := SplitProviderStatusLabels(labels)
	result := make([]string, 0, len(managed))
	for _, label := range managed {
		if known[strings.ToLower(label)] {
			result = append(result, label)
		}
	}
	return result
}

// WithProviderStatusLabel replaces only the current project's managed
// workflow labels while preserving ordinary labels and managed labels owned by
// other projects sharing the same provider issue.
func WithProviderStatusLabel(projectKey string, statuses []db.ProjectStatus, labels []string, statusLabel string) []string {
	ordinary, managed := SplitProviderStatusLabels(labels)
	current := make(map[string]bool, len(statuses))
	for _, status := range statuses {
		current[strings.ToLower(statusProviderLabel(projectKey, status))] = true
	}
	result := append([]string{}, ordinary...)
	for _, label := range managed {
		if !current[strings.ToLower(label)] {
			result = append(result, label)
		}
	}
	if strings.TrimSpace(statusLabel) == "" {
		return result
	}
	return append(result, strings.TrimSpace(statusLabel))
}

// StatusForRemoteIssue resolves a provider issue to an exact local workflow
// status when it carries one of the managed labels. Native provider state is
// still authoritative for Done/open behavior when the label is absent or
// inconsistent. The bool reports whether the result came from a valid managed
// label; callers use it to avoid changing an existing task on an unlabelled
// legacy issue.
func StatusForRemoteIssue(projectKey string, statuses []db.ProjectStatus, remoteState string, labels []string) (uuid.UUID, bool, bool, error) {
	byLabel := make(map[string]db.ProjectStatus, len(statuses))
	for _, status := range statuses {
		byLabel[strings.ToLower(statusProviderLabel(projectKey, status))] = status
	}
	managedLabels := WorkflowStatusLabels(projectKey, statuses, labels)
	matched := make(map[uuid.UUID]db.ProjectStatus, len(managedLabels))
	for _, label := range managedLabels {
		if status, ok := byLabel[strings.ToLower(label)]; ok {
			matched[status.ID] = status
		}
	}
	if len(matched) > 1 {
		return uuid.Nil, false, false, fmt.Errorf("provider issue has multiple JustProjects workflow status labels")
	}
	for _, status := range matched {
		if strings.EqualFold(remoteState, "closed") {
			if status.Category == "done" {
				return status.ID, true, true, nil
			}
			break
		}
		if status.Category != "done" {
			return status.ID, true, true, nil
		}
		break
	}
	statusID, ok := StatusForRemoteState(statuses, strings.EqualFold(remoteState, "closed"))
	return statusID, ok, false, nil
}
