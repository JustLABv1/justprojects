package github

import (
	"context"
	"time"
)

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
	Title     string   `json:"title,omitempty"`
	Body      string   `json:"body,omitempty"`
	State     string   `json:"state,omitempty"`
	Labels    []string `json:"labels"`
	Assignees []string `json:"assignees"`
	Milestone *int     `json:"milestone"`
}

type MilestonePatch struct {
	Title       string     `json:"title,omitempty"`
	Description string     `json:"description,omitempty"`
	State       string     `json:"state,omitempty"`
	DueOn       *time.Time `json:"due_on"`
}

type Provider interface {
	ListRepositories(context.Context) ([]Repository, error)
	ListIssues(context.Context, string, string) ([]Issue, error)
	CreateIssue(context.Context, string, string, IssuePatch) (Issue, error)
	UpdateIssue(context.Context, string, string, int, IssuePatch) (Issue, error)
	ListMilestones(context.Context, string, string) ([]Milestone, error)
	CreateMilestone(context.Context, string, string, MilestonePatch) (Milestone, error)
	UpdateMilestone(context.Context, string, string, int, MilestonePatch) (Milestone, error)
}
