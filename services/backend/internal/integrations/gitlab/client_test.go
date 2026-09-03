package gitlab

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/integrations"
)

func TestNewClientNormalizesGitLabComAndSelfHostedURLs(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "gitlab.com", input: "https://gitlab.com", want: "https://gitlab.com/api/v4"},
		{name: "self hosted path", input: "https://code.example.com/gitlab/", want: "https://code.example.com/gitlab/api/v4"},
		{name: "already api", input: "https://code.example.com/api/v4/", want: "https://code.example.com/api/v4"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			client, err := NewClient(test.input, "token")
			if err != nil {
				t.Fatalf("NewClient() error = %v", err)
			}
			if client.BaseURL != test.want {
				t.Fatalf("BaseURL = %q, want %q", client.BaseURL, test.want)
			}
		})
	}
}

func TestNewClientRejectsURLsWithQueryOrFragment(t *testing.T) {
	for _, input := range []string{"https://gitlab.example.com?token=leak", "https://gitlab.example.com#fragment", "://invalid"} {
		if _, err := NewClient(input, "token"); err == nil {
			t.Fatalf("NewClient(%q) accepted an unsafe/invalid URL", input)
		}
	}
}

func TestIssueValuesOnlySendsAssigneeWhenRequested(t *testing.T) {
	client, err := NewClient("https://gitlab.com", "token")
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	unchanged, err := client.issueValues(context.Background(), integrations.IssuePatch{Labels: []string{}})
	if err != nil {
		t.Fatalf("issueValues() unchanged error = %v", err)
	}
	if _, ok := unchanged["assignee_ids[]"]; ok {
		t.Fatalf("unchanged assignees should not be sent: %v", unchanged)
	}
	empty := []string{}
	cleared, err := client.issueValues(context.Background(), integrations.IssuePatch{Labels: []string{}, Assignees: &empty})
	if err != nil {
		t.Fatalf("issueValues() clear error = %v", err)
	}
	if cleared.Get("assignee_ids[]") != "" {
		t.Fatalf("explicit assignee clear should be sent: %v", cleared)
	}
}

func TestClientUsesSelfHostedAPIAndMapsIssues(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("PRIVATE-TOKEN") != "glpat-test" {
			response.WriteHeader(http.StatusUnauthorized)
			return
		}
		if request.URL.Path != "/gitlab/api/v4/projects/group/subgroup/app/issues" {
			response.WriteHeader(http.StatusNotFound)
			return
		}
		if request.URL.Query().Get("state") != "all" {
			response.WriteHeader(http.StatusBadRequest)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(response, `[{"id":7,"iid":3,"title":"Ship","description":"Ready","state":"opened","web_url":"https://code.example.com/group/subgroup/app/-/issues/3","updated_at":"2026-09-01T12:00:00Z","labels":["customer"],"assignees":[{"username":"ava"}],"milestone":{"id":9,"iid":2,"title":"Beta","state":"active","due_date":"2026-09-20","updated_at":"2026-09-01T11:00:00Z"}}]`)
	}))
	defer server.Close()

	client, err := NewClient(server.URL+"/gitlab", "glpat-test")
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	issues, err := client.ListIssues(context.Background(), "group/subgroup", "app")
	if err != nil {
		t.Fatalf("ListIssues() error = %v", err)
	}
	if len(issues) != 1 || issues[0].State != "opened" || issues[0].Milestone == nil || issues[0].Milestone.DueOn == nil {
		t.Fatalf("unexpected normalized issue: %+v", issues)
	}
	if issues[0].Milestone.Title != "Beta" || issues[0].Assignees[0] != "ava" {
		t.Fatalf("unexpected issue metadata: %+v", issues[0])
	}
}

func TestListIssuesPaginates(t *testing.T) {
	pages := make([]int, 0, 2)
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/api/v4/projects/group/app/issues" {
			response.WriteHeader(http.StatusNotFound)
			return
		}
		if request.URL.Query().Get("state") != "all" || request.URL.Query().Get("per_page") != "100" {
			response.WriteHeader(http.StatusBadRequest)
			return
		}
		page, err := strconv.Atoi(request.URL.Query().Get("page"))
		if err != nil {
			response.WriteHeader(http.StatusBadRequest)
			return
		}
		pages = append(pages, page)
		response.Header().Set("Content-Type", "application/json")

		items := make([]rawIssue, 0, 100)
		switch page {
		case 1:
			for number := 1; number <= 100; number++ {
				items = append(items, rawIssue{ID: int64(number), IID: number, Title: "Issue " + strconv.Itoa(number), State: "opened"})
			}
		case 2:
			items = append(items, rawIssue{ID: 101, IID: 101, Title: "Issue 101", State: "closed"})
		default:
			response.WriteHeader(http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(response).Encode(items)
	}))
	defer server.Close()

	client, err := NewClient(server.URL, "token")
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	issues, err := client.ListIssues(context.Background(), "group", "app")
	if err != nil {
		t.Fatalf("ListIssues() error = %v", err)
	}
	if len(pages) != 2 || pages[0] != 1 || pages[1] != 2 {
		t.Fatalf("requested pages = %v, want [1 2]", pages)
	}
	if len(issues) != 101 || issues[len(issues)-1].Number != 101 {
		t.Fatalf("got %d issues, want 101 including the second page", len(issues))
	}
}

func TestListIssuesSinceSendsGitLabUpdatedAfterCursor(t *testing.T) {
	wantSince := "2026-09-03T10:00:00Z"
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Query().Get("updated_after") != wantSince {
			response.WriteHeader(http.StatusBadRequest)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(response, `[{"id":42,"iid":7,"title":"Changed","state":"opened","updated_at":"2026-09-03T10:01:00Z"}]`)
	}))
	defer server.Close()

	client, err := NewClient(server.URL, "token")
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	since, _ := time.Parse(time.RFC3339, wantSince)
	issues, err := client.ListIssuesSince(context.Background(), "group", "app", since)
	if err != nil {
		t.Fatalf("ListIssuesSince() error = %v", err)
	}
	if len(issues) != 1 || issues[0].Number != 7 {
		t.Fatalf("unexpected issues: %+v", issues)
	}
}

func TestClientSendsGitLabIssueMutationAsForm(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPut || request.Header.Get("Content-Type") != "application/x-www-form-urlencoded" {
			response.WriteHeader(http.StatusBadRequest)
			return
		}
		body, _ := io.ReadAll(request.Body)
		values, err := url.ParseQuery(string(body))
		if err != nil || values.Get("title") != "Updated" || values.Get("state_event") != "close" || values.Get("milestone_id") != "0" {
			response.WriteHeader(http.StatusBadRequest)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(response, `{"id":7,"iid":3,"title":"Updated","description":"Body","state":"closed","updated_at":"2026-09-01T12:00:00Z"}`)
	}))
	defer server.Close()

	client, err := NewClient(server.URL, "glpat-test")
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	issue, err := client.UpdateIssue(context.Background(), "group", "app", 3, integrations.IssuePatch{Title: "Updated", Body: "Body", State: "closed", Milestone: nil})
	if err != nil {
		t.Fatalf("UpdateIssue() error = %v", err)
	}
	if issue.Title != "Updated" || issue.State != "closed" {
		t.Fatalf("unexpected updated issue: %+v", issue)
	}
}

func TestMilestoneJSONShapeIsAccepted(t *testing.T) {
	var raw rawMilestone
	if err := json.NewDecoder(strings.NewReader(`{"id":1,"iid":2,"title":"Launch","state":"active","due_date":"2026-09-20","updated_at":"2026-09-01T12:00:00Z"}`)).Decode(&raw); err != nil {
		t.Fatalf("decode milestone: %v", err)
	}
	got := milestoneFromRaw(raw)
	if got.Number != 2 || got.Title != "Launch" || got.DueOn == nil {
		t.Fatalf("unexpected milestone: %+v", got)
	}
}
