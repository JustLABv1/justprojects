package integrations

import (
	"context"
	"time"
)

// Provider is the small common surface used by the sync worker. Provider
// credentials, API URL, and webhook verification remain connection-specific;
// the worker only deals with normalized repositories, issues, and milestones.
type Provider interface {
	ListRepositories(context.Context) ([]Repository, error)
	ListIssues(context.Context, string, string) ([]Issue, error)
	CreateIssue(context.Context, string, string, IssuePatch) (Issue, error)
	UpdateIssue(context.Context, string, string, int, IssuePatch) (Issue, error)
	ListMilestones(context.Context, string, string) ([]Milestone, error)
	CreateMilestone(context.Context, string, string, MilestonePatch) (Milestone, error)
	UpdateMilestone(context.Context, string, string, int, MilestonePatch) (Milestone, error)
}

// IncrementalProvider is implemented by providers that can narrow issue
// polling to records changed after a cursor. Milestones are included in the
// optional surface because providers differ in whether their milestone API
// supports a server-side updated-after filter. The worker can fall back to a
// full milestone listing when it does not.
type IncrementalProvider interface {
	Provider
	ListIssuesSince(context.Context, string, string, time.Time) ([]Issue, error)
	ListMilestonesSince(context.Context, string, string, time.Time) ([]Milestone, error)
}

type Repository struct {
	ID       int64  `json:"id"`
	Owner    string `json:"owner"`
	Name     string `json:"name"`
	FullName string `json:"fullName"`
	Private  bool   `json:"private"`
}

type User struct {
	ID    int64  `json:"id"`
	Login string `json:"login"`
	Email string `json:"email"`
}

type Issue struct {
	ID        int64      `json:"id"`
	Number    int        `json:"number"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	State     string     `json:"state"`
	HTMLURL   string     `json:"htmlUrl"`
	UpdatedAt time.Time  `json:"updatedAt"`
	Labels    []string   `json:"labels"`
	Assignees []string   `json:"assignees"`
	Milestone *Milestone `json:"milestone,omitempty"`
}

type Milestone struct {
	ID          int64      `json:"id"`
	Number      int        `json:"number"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	State       string     `json:"state"`
	DueOn       *time.Time `json:"dueOn,omitempty"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type IssuePatch struct {
	Title  string   `json:"title,omitempty"`
	Body   string   `json:"body,omitempty"`
	State  string   `json:"state,omitempty"`
	Labels []string `json:"labels"`
	// Assignees is optional so an issue update that does not intentionally
	// change assignees cannot clear remote assignments when a provider login
	// has not been mapped to a local user yet. An explicit empty slice still
	// clears all remote assignees.
	Assignees *[]string `json:"assignees,omitempty"`
	Milestone *int      `json:"milestone"`
}

type MilestonePatch struct {
	Title       string     `json:"title,omitempty"`
	Description string     `json:"description,omitempty"`
	State       string     `json:"state,omitempty"`
	DueOn       *time.Time `json:"due_on"`
}
