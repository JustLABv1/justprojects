package github

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	apiVersion = "2022-11-28"
	userAgent  = "JustProjects"
)

// APIError preserves the provider response metadata needed to distinguish a
// rate limit from an invalid token or an unavailable provider.
type APIError struct {
	Method             string
	Path               string
	StatusCode         int
	Message            string
	RateLimitRemaining string
	RateLimitReset     *time.Time
}

func (e *APIError) Error() string {
	return fmt.Sprintf("github api %s %s: %s", e.Method, e.Path, e.Message)
}

func (e *APIError) IsRateLimited() bool {
	if e == nil {
		return false
	}
	message := strings.ToLower(e.Message)
	return e.StatusCode == http.StatusTooManyRequests ||
		(e.StatusCode == http.StatusForbidden &&
			(e.RateLimitRemaining == "0" || strings.Contains(message, "rate limit")))
}

// RetryAt exposes a provider-aware retry time to the outbox worker without
// coupling the queue package to GitHub-specific error types.
func (e *APIError) RetryAt() (time.Time, bool) {
	if e == nil || !e.IsRateLimited() {
		return time.Time{}, false
	}
	if e.RateLimitReset != nil {
		reset := e.RateLimitReset.UTC()
		if reset.After(time.Now().UTC()) {
			return reset, true
		}
	}
	// GitHub recommends waiting at least one minute when a rate-limit response
	// does not provide a usable reset or retry-after value.
	return time.Now().UTC().Add(time.Minute), true
}

func (e *APIError) IsInvalidCredentials() bool {
	return e != nil && e.StatusCode == http.StatusUnauthorized
}

func IsRateLimited(err error) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.IsRateLimited()
}

func IsInvalidCredentials(err error) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.IsInvalidCredentials()
}

func RateLimitReset(err error) (time.Time, bool) {
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.RateLimitReset == nil {
		return time.Time{}, false
	}
	return apiErr.RateLimitReset.UTC(), true
}

type Client struct {
	HTTPClient   *http.Client
	BaseURL      string
	Token        string
	Installation bool
}

func NewClient(token string) *Client {
	return &Client{HTTPClient: http.DefaultClient, BaseURL: "https://api.github.com", Token: token}
}

// NewInstallationClient exchanges a GitHub App JWT for a short-lived
// installation token. The returned client has the same Provider interface as
// an OAuth client, which keeps imports and mutations independent of the auth
// method used by a tenant.
func NewInstallationClient(ctx context.Context, appID, privateKey string, installationID int64) (*Client, error) {
	if strings.TrimSpace(appID) == "" || installationID <= 0 {
		return nil, fmt.Errorf("github app id and installation id are required")
	}
	key, err := parsePrivateKey(privateKey)
	if err != nil {
		return nil, err
	}
	jwt, err := appJWT(appID, key, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	client := NewClient(jwt)
	var response struct {
		Token     string    `json:"token"`
		ExpiresAt time.Time `json:"expires_at"`
	}
	path := "/app/installations/" + strconv.FormatInt(installationID, 10) + "/access_tokens"
	if err = client.do(ctx, http.MethodPost, path, nil, &response); err != nil {
		return nil, fmt.Errorf("create github installation token: %w", err)
	}
	if response.Token == "" {
		return nil, fmt.Errorf("github installation token response was empty")
	}
	installationClient := NewClient(response.Token)
	installationClient.Installation = true
	return installationClient, nil
}

func parsePrivateKey(value string) (*rsa.PrivateKey, error) {
	value = strings.ReplaceAll(strings.TrimSpace(value), `\n`, "\n")
	block, _ := pem.Decode([]byte(value))
	if block == nil {
		return nil, fmt.Errorf("github app private key is not valid PEM")
	}
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse github app private key: %w", err)
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("github app private key is not RSA")
	}
	return key, nil
}

func appJWT(appID string, key *rsa.PrivateKey, now time.Time) (string, error) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payload, err := json.Marshal(map[string]any{
		"iat": now.Add(-60 * time.Second).Unix(),
		"exp": now.Add(9 * time.Minute).Unix(),
		"iss": appID,
	})
	if err != nil {
		return "", err
	}
	encodedPayload := base64.RawURLEncoding.EncodeToString(payload)
	message := header + "." + encodedPayload
	digest := sha256.Sum256([]byte(message))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		return "", fmt.Errorf("sign github app jwt: %w", err)
	}
	return message + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func (c *Client) do(ctx context.Context, method, path string, input any, output any) error {
	var body io.Reader
	if input != nil {
		encoded, err := json.Marshal(input)
		if err != nil {
			return err
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", apiVersion)
	req.Header.Set("User-Agent", userAgent)
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	client := c.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		message, _ := io.ReadAll(io.LimitReader(res.Body, 4<<10))
		return &APIError{
			Method:             method,
			Path:               path,
			StatusCode:         res.StatusCode,
			Message:            strings.TrimSpace(string(message)),
			RateLimitRemaining: res.Header.Get("X-RateLimit-Remaining"),
			RateLimitReset:     parseRateLimitReset(res.Header.Get("X-RateLimit-Reset")),
		}
	}
	if output == nil || res.StatusCode == http.StatusNoContent {
		return nil
	}
	return json.NewDecoder(res.Body).Decode(output)
}

func parseRateLimitReset(value string) *time.Time {
	seconds, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil || seconds <= 0 {
		return nil
	}
	reset := time.Unix(seconds, 0).UTC()
	return &reset
}

func (c *Client) ListRepositories(ctx context.Context) ([]Repository, error) {
	if c.Installation {
		return c.ListInstallationRepositories(ctx)
	}
	var response []struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		FullName string `json:"full_name"`
		Private  bool   `json:"private"`
		Owner    struct {
			Login string `json:"login"`
		} `json:"owner"`
	}
	err := c.do(ctx, http.MethodGet, "/user/repos?per_page=100&sort=updated", nil, &response)
	if err != nil {
		return nil, err
	}
	items := make([]Repository, 0, len(response))
	for _, repo := range response {
		items = append(items, Repository{ID: repo.ID, Owner: repo.Owner.Login, Name: repo.Name, FullName: repo.FullName, Private: repo.Private})
	}
	return items, nil
}

// ListInstallationRepositories lists repositories visible to a GitHub App
// installation. Installation access tokens cannot use /user/repos, so this is
// intentionally separate from the OAuth account listing above.
func (c *Client) ListInstallationRepositories(ctx context.Context) ([]Repository, error) {
	var response struct {
		Repositories []struct {
			ID       int64  `json:"id"`
			Name     string `json:"name"`
			FullName string `json:"full_name"`
			Private  bool   `json:"private"`
			Owner    struct {
				Login string `json:"login"`
			} `json:"owner"`
		} `json:"repositories"`
	}
	if err := c.do(ctx, http.MethodGet, "/installation/repositories?per_page=100", nil, &response); err != nil {
		return nil, err
	}
	items := make([]Repository, 0, len(response.Repositories))
	for _, repo := range response.Repositories {
		items = append(items, Repository{ID: repo.ID, Owner: repo.Owner.Login, Name: repo.Name, FullName: repo.FullName, Private: repo.Private})
	}
	return items, nil
}

func (c *Client) ListIssues(ctx context.Context, owner, repo string) ([]Issue, error) {
	var response []struct {
		ID          int64          `json:"id"`
		Number      int            `json:"number"`
		Title       string         `json:"title"`
		Body        string         `json:"body"`
		State       string         `json:"state"`
		HTMLURL     string         `json:"html_url"`
		UpdatedAt   time.Time      `json:"updated_at"`
		PullRequest map[string]any `json:"pull_request"`
		Labels      []struct {
			Name string `json:"name"`
		} `json:"labels"`
		Assignees []struct {
			Login string `json:"login"`
		} `json:"assignees"`
		Milestone *struct {
			ID        int64      `json:"id"`
			Number    int        `json:"number"`
			Title     string     `json:"title"`
			State     string     `json:"state"`
			DueOn     *time.Time `json:"due_on"`
			UpdatedAt time.Time  `json:"updated_at"`
		} `json:"milestone"`
	}
	const pageSize = 100
	items := make([]Issue, 0, pageSize)
	for page := 1; ; page++ {
		response = nil
		path := "/repos/" + url.PathEscape(owner) + "/" + url.PathEscape(repo) + "/issues?state=all&per_page=" + strconv.Itoa(pageSize) + "&page=" + strconv.Itoa(page)
		if err := c.do(ctx, http.MethodGet, path, nil, &response); err != nil {
			return nil, err
		}
		for _, remote := range response {
			if remote.PullRequest != nil {
				continue
			}
			item := Issue{ID: remote.ID, Number: remote.Number, Title: remote.Title, Body: remote.Body, State: remote.State, HTMLURL: remote.HTMLURL, UpdatedAt: remote.UpdatedAt}
			for _, label := range remote.Labels {
				item.Labels = append(item.Labels, label.Name)
			}
			for _, assignee := range remote.Assignees {
				item.Assignees = append(item.Assignees, assignee.Login)
			}
			if remote.Milestone != nil {
				item.Milestone = &Milestone{ID: remote.Milestone.ID, Number: remote.Milestone.Number, Title: remote.Milestone.Title, State: remote.Milestone.State, DueOn: remote.Milestone.DueOn, UpdatedAt: remote.Milestone.UpdatedAt}
			}
			items = append(items, item)
		}
		if len(response) < pageSize {
			break
		}
	}
	return items, nil
}

func (c *Client) CreateIssue(ctx context.Context, owner, repo string, patch IssuePatch) (Issue, error) {
	return c.issueMutation(ctx, http.MethodPost, owner, repo, 0, patch)
}

func (c *Client) UpdateIssue(ctx context.Context, owner, repo string, number int, patch IssuePatch) (Issue, error) {
	return c.issueMutation(ctx, http.MethodPatch, owner, repo, number, patch)
}

func (c *Client) issueMutation(ctx context.Context, method, owner, repo string, number int, patch IssuePatch) (Issue, error) {
	path := "/repos/" + url.PathEscape(owner) + "/" + url.PathEscape(repo) + "/issues"
	if number > 0 {
		path += "/" + strconv.Itoa(number)
	}
	var remote struct {
		ID        int64     `json:"id"`
		Number    int       `json:"number"`
		Title     string    `json:"title"`
		Body      string    `json:"body"`
		State     string    `json:"state"`
		HTMLURL   string    `json:"html_url"`
		UpdatedAt time.Time `json:"updated_at"`
		Labels    []struct {
			Name string `json:"name"`
		} `json:"labels"`
		Assignees []struct {
			Login string `json:"login"`
		} `json:"assignees"`
		Milestone *struct {
			ID          int64      `json:"id"`
			Number      int        `json:"number"`
			Title       string     `json:"title"`
			Description string     `json:"description"`
			State       string     `json:"state"`
			DueOn       *time.Time `json:"due_on"`
			UpdatedAt   time.Time  `json:"updated_at"`
		} `json:"milestone"`
	}
	if err := c.do(ctx, method, path, patch, &remote); err != nil {
		return Issue{}, err
	}
	issue := Issue{ID: remote.ID, Number: remote.Number, Title: remote.Title, Body: remote.Body, State: remote.State, HTMLURL: remote.HTMLURL, UpdatedAt: remote.UpdatedAt}
	for _, label := range remote.Labels {
		issue.Labels = append(issue.Labels, label.Name)
	}
	for _, assignee := range remote.Assignees {
		issue.Assignees = append(issue.Assignees, assignee.Login)
	}
	if remote.Milestone != nil {
		issue.Milestone = &Milestone{ID: remote.Milestone.ID, Number: remote.Milestone.Number, Title: remote.Milestone.Title, Description: remote.Milestone.Description, State: remote.Milestone.State, DueOn: remote.Milestone.DueOn, UpdatedAt: remote.Milestone.UpdatedAt}
	}
	return issue, nil
}

func (c *Client) ListMilestones(ctx context.Context, owner, repo string) ([]Milestone, error) {
	var response []struct {
		ID          int64      `json:"id"`
		Number      int        `json:"number"`
		Title       string     `json:"title"`
		Description string     `json:"description"`
		State       string     `json:"state"`
		DueOn       *time.Time `json:"due_on"`
		UpdatedAt   time.Time  `json:"updated_at"`
	}
	const pageSize = 100
	items := make([]Milestone, 0, pageSize)
	for page := 1; ; page++ {
		response = nil
		path := "/repos/" + url.PathEscape(owner) + "/" + url.PathEscape(repo) + "/milestones?state=all&per_page=" + strconv.Itoa(pageSize) + "&page=" + strconv.Itoa(page)
		if err := c.do(ctx, http.MethodGet, path, nil, &response); err != nil {
			return nil, err
		}
		for _, remote := range response {
			items = append(items, Milestone{ID: remote.ID, Number: remote.Number, Title: remote.Title, Description: remote.Description, State: remote.State, DueOn: remote.DueOn, UpdatedAt: remote.UpdatedAt})
		}
		if len(response) < pageSize {
			break
		}
	}
	return items, nil
}

func (c *Client) CreateMilestone(ctx context.Context, owner, repo string, patch MilestonePatch) (Milestone, error) {
	return c.milestoneMutation(ctx, http.MethodPost, owner, repo, 0, patch)
}

func (c *Client) UpdateMilestone(ctx context.Context, owner, repo string, number int, patch MilestonePatch) (Milestone, error) {
	return c.milestoneMutation(ctx, http.MethodPatch, owner, repo, number, patch)
}

func (c *Client) milestoneMutation(ctx context.Context, method, owner, repo string, number int, patch MilestonePatch) (Milestone, error) {
	path := "/repos/" + url.PathEscape(owner) + "/" + url.PathEscape(repo) + "/milestones"
	if number > 0 {
		path += "/" + strconv.Itoa(number)
	}
	var remote struct {
		ID          int64      `json:"id"`
		Number      int        `json:"number"`
		Title       string     `json:"title"`
		Description string     `json:"description"`
		State       string     `json:"state"`
		DueOn       *time.Time `json:"due_on"`
		UpdatedAt   time.Time  `json:"updated_at"`
	}
	if err := c.do(ctx, method, path, patch, &remote); err != nil {
		return Milestone{}, err
	}
	return Milestone{ID: remote.ID, Number: remote.Number, Title: remote.Title, Description: remote.Description, State: remote.State, DueOn: remote.DueOn, UpdatedAt: remote.UpdatedAt}, nil
}

func (c *Client) User(ctx context.Context) (User, error) {
	var user User
	if err := c.do(ctx, http.MethodGet, "/user", nil, &user); err != nil {
		return User{}, err
	}
	return user, nil
}

var _ Provider = (*Client)(nil)
