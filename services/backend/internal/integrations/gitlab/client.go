package gitlab

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/integrations"
)

// Client speaks GitLab's v4 REST API. BaseURL is stored per connection so a
// tenant can use gitlab.com and one or more self-hosted GitLab instances at
// the same time.
type Client struct {
	HTTPClient *http.Client
	BaseURL    string
	Token      string
}

func NewClient(baseURL, token string) (*Client, error) {
	apiURL, err := normalizeAPIBaseURL(baseURL)
	if err != nil {
		return nil, err
	}
	return &Client{HTTPClient: http.DefaultClient, BaseURL: apiURL, Token: token}, nil
}

func normalizeAPIBaseURL(raw string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		raw = "https://gitlab.com"
	}
	parsed, err := url.Parse(strings.TrimRight(strings.TrimSpace(raw), "/"))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return "", fmt.Errorf("gitlab base URL must be an absolute http(s) URL")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", fmt.Errorf("gitlab base URL must not include a query or fragment")
	}
	if !strings.HasSuffix(parsed.Path, "/api/v4") {
		parsed.Path = strings.TrimRight(parsed.Path, "/") + "/api/v4"
	}
	return strings.TrimRight(parsed.String(), "/"), nil
}

func (c *Client) do(ctx context.Context, method, path string, body io.Reader, contentType string, output any) error {
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if c.Token != "" {
		req.Header.Set("PRIVATE-TOKEN", c.Token)
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	client := c.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 4<<10))
		return fmt.Errorf("gitlab api %s %s: %s", method, path, strings.TrimSpace(string(message)))
	}
	if output == nil || response.StatusCode == http.StatusNoContent {
		return nil
	}
	return json.NewDecoder(response.Body).Decode(output)
}

func (c *Client) doJSON(ctx context.Context, method, path string, input, output any) error {
	encoded, err := json.Marshal(input)
	if err != nil {
		return err
	}
	return c.do(ctx, method, path, bytes.NewReader(encoded), "application/json", output)
}

func (c *Client) doForm(ctx context.Context, method, path string, values url.Values, output any) error {
	return c.do(ctx, method, path, strings.NewReader(values.Encode()), "application/x-www-form-urlencoded", output)
}

type rawProject struct {
	ID                int64  `json:"id"`
	Name              string `json:"name"`
	PathWithNamespace string `json:"path_with_namespace"`
	WebURL            string `json:"web_url"`
	Visibility        string `json:"visibility"`
	Namespace         struct {
		FullPath string `json:"full_path"`
		Name     string `json:"name"`
	} `json:"namespace"`
}

func repositoryFromProject(project rawProject) integrations.Repository {
	fullName := project.PathWithNamespace
	owner, name := splitProjectPath(fullName, project.Namespace.FullPath, project.Name)
	return integrations.Repository{ID: project.ID, Owner: owner, Name: name, FullName: fullName, Private: project.Visibility == "private"}
}

func splitProjectPath(fullName, namespace, name string) (string, string) {
	if fullName == "" {
		return namespace, name
	}
	if index := strings.LastIndex(fullName, "/"); index > 0 {
		return fullName[:index], fullName[index+1:]
	}
	return namespace, name
}

func (c *Client) ListRepositories(ctx context.Context) ([]integrations.Repository, error) {
	var response []rawProject
	if err := c.do(ctx, http.MethodGet, "/projects?membership=true&simple=true&per_page=100&order_by=last_activity_at", nil, "", &response); err != nil {
		return nil, err
	}
	items := make([]integrations.Repository, 0, len(response))
	for _, project := range response {
		items = append(items, repositoryFromProject(project))
	}
	return items, nil
}

func projectPath(owner, repo string) string {
	return url.PathEscape(strings.Trim(owner+"/"+repo, "/"))
}

type rawMilestone struct {
	ID          int64   `json:"id"`
	IID         int     `json:"iid"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	State       string  `json:"state"`
	DueDate     *string `json:"due_date"`
	UpdatedAt   string  `json:"updated_at"`
}

func milestoneFromRaw(remote rawMilestone) integrations.Milestone {
	var dueOn *time.Time
	if remote.DueDate != nil && *remote.DueDate != "" {
		if parsed, err := time.Parse("2006-01-02", *remote.DueDate); err == nil {
			dueOn = &parsed
		}
	}
	updatedAt, _ := time.Parse(time.RFC3339, remote.UpdatedAt)
	return integrations.Milestone{ID: remote.ID, Number: remote.IID, Title: remote.Title, Description: remote.Description, State: remote.State, DueOn: dueOn, UpdatedAt: updatedAt}
}

func (c *Client) ListMilestones(ctx context.Context, owner, repo string) ([]integrations.Milestone, error) {
	var response []rawMilestone
	path := "/projects/" + projectPath(owner, repo) + "/milestones?state=all&per_page=100"
	if err := c.do(ctx, http.MethodGet, path, nil, "", &response); err != nil {
		return nil, err
	}
	items := make([]integrations.Milestone, 0, len(response))
	for _, remote := range response {
		items = append(items, milestoneFromRaw(remote))
	}
	return items, nil
}

type rawIssue struct {
	ID          int64    `json:"id"`
	IID         int      `json:"iid"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	State       string   `json:"state"`
	WebURL      string   `json:"web_url"`
	UpdatedAt   string   `json:"updated_at"`
	Labels      []string `json:"labels"`
	Assignees   []struct {
		ID       int64  `json:"id"`
		Username string `json:"username"`
		Name     string `json:"name"`
	} `json:"assignees"`
	Milestone *rawMilestone `json:"milestone"`
}

func issueFromRaw(remote rawIssue) integrations.Issue {
	updatedAt, _ := time.Parse(time.RFC3339, remote.UpdatedAt)
	issue := integrations.Issue{ID: remote.ID, Number: remote.IID, Title: remote.Title, Body: remote.Description, State: remote.State, HTMLURL: remote.WebURL, UpdatedAt: updatedAt, Labels: append([]string(nil), remote.Labels...)}
	for _, assignee := range remote.Assignees {
		if assignee.Username != "" {
			issue.Assignees = append(issue.Assignees, assignee.Username)
		} else if assignee.Name != "" {
			issue.Assignees = append(issue.Assignees, assignee.Name)
		}
	}
	if remote.Milestone != nil {
		milestone := milestoneFromRaw(*remote.Milestone)
		issue.Milestone = &milestone
	}
	return issue
}

func (c *Client) ListIssues(ctx context.Context, owner, repo string) ([]integrations.Issue, error) {
	var response []rawIssue
	path := "/projects/" + projectPath(owner, repo) + "/issues?scope=all&state=all&per_page=100&order_by=updated_at"
	if err := c.do(ctx, http.MethodGet, path, nil, "", &response); err != nil {
		return nil, err
	}
	items := make([]integrations.Issue, 0, len(response))
	for _, remote := range response {
		items = append(items, issueFromRaw(remote))
	}
	return items, nil
}

func (c *Client) resolveAssigneeIDs(ctx context.Context, logins []string) ([]int64, error) {
	ids := make([]int64, 0, len(logins))
	for _, login := range logins {
		var users []struct {
			ID       int64  `json:"id"`
			Username string `json:"username"`
		}
		path := "/users?username=" + url.QueryEscape(login)
		if err := c.do(ctx, http.MethodGet, path, nil, "", &users); err != nil {
			return nil, err
		}
		if len(users) > 0 && users[0].ID > 0 {
			ids = append(ids, users[0].ID)
		}
	}
	return ids, nil
}

func (c *Client) issueValues(ctx context.Context, patch integrations.IssuePatch) (url.Values, error) {
	values := url.Values{}
	values.Set("title", patch.Title)
	values.Set("description", patch.Body)
	values.Set("state_event", mapGitLabStateEvent(patch.State))
	values.Set("labels", strings.Join(patch.Labels, ","))
	assigneeIDs, err := c.resolveAssigneeIDs(ctx, patch.Assignees)
	if err != nil {
		return nil, err
	}
	for _, id := range assigneeIDs {
		values.Add("assignee_ids[]", strconv.FormatInt(id, 10))
	}
	if len(assigneeIDs) == 0 {
		values.Add("assignee_ids[]", "")
	}
	if patch.Milestone == nil {
		values.Set("milestone_id", "0")
	} else {
		values.Set("milestone_id", strconv.Itoa(*patch.Milestone))
	}
	return values, nil
}

func mapGitLabStateEvent(state string) string {
	if strings.EqualFold(state, "closed") || strings.EqualFold(state, "close") {
		return "close"
	}
	return "reopen"
}

func (c *Client) CreateIssue(ctx context.Context, owner, repo string, patch integrations.IssuePatch) (integrations.Issue, error) {
	values, err := c.issueValues(ctx, patch)
	if err != nil {
		return integrations.Issue{}, err
	}
	var response rawIssue
	if err = c.doForm(ctx, http.MethodPost, "/projects/"+projectPath(owner, repo)+"/issues", values, &response); err != nil {
		return integrations.Issue{}, err
	}
	return issueFromRaw(response), nil
}

func (c *Client) UpdateIssue(ctx context.Context, owner, repo string, number int, patch integrations.IssuePatch) (integrations.Issue, error) {
	values, err := c.issueValues(ctx, patch)
	if err != nil {
		return integrations.Issue{}, err
	}
	var response rawIssue
	path := "/projects/" + projectPath(owner, repo) + "/issues/" + strconv.Itoa(number)
	if err = c.doForm(ctx, http.MethodPut, path, values, &response); err != nil {
		return integrations.Issue{}, err
	}
	return issueFromRaw(response), nil
}

func milestoneValues(patch integrations.MilestonePatch) url.Values {
	values := url.Values{}
	values.Set("title", patch.Title)
	values.Set("description", patch.Description)
	values.Set("state_event", mapGitLabStateEvent(patch.State))
	if patch.DueOn != nil {
		values.Set("due_date", patch.DueOn.Format("2006-01-02"))
	} else {
		values.Set("due_date", "")
	}
	return values
}

func (c *Client) CreateMilestone(ctx context.Context, owner, repo string, patch integrations.MilestonePatch) (integrations.Milestone, error) {
	var response rawMilestone
	if err := c.doForm(ctx, http.MethodPost, "/projects/"+projectPath(owner, repo)+"/milestones", milestoneValues(patch), &response); err != nil {
		return integrations.Milestone{}, err
	}
	return milestoneFromRaw(response), nil
}

func (c *Client) UpdateMilestone(ctx context.Context, owner, repo string, number int, patch integrations.MilestonePatch) (integrations.Milestone, error) {
	var response rawMilestone
	path := "/projects/" + projectPath(owner, repo) + "/milestones/" + strconv.Itoa(number)
	if err := c.doForm(ctx, http.MethodPut, path, milestoneValues(patch), &response); err != nil {
		return integrations.Milestone{}, err
	}
	return milestoneFromRaw(response), nil
}

func (c *Client) User(ctx context.Context) (integrations.User, error) {
	var response struct {
		ID       int64  `json:"id"`
		Username string `json:"username"`
		Name     string `json:"name"`
		Email    string `json:"email"`
	}
	if err := c.do(ctx, http.MethodGet, "/user", nil, "", &response); err != nil {
		return integrations.User{}, err
	}
	login := response.Username
	if login == "" {
		login = response.Name
	}
	return integrations.User{ID: response.ID, Login: login, Email: response.Email}, nil
}

var _ integrations.Provider = (*Client)(nil)
