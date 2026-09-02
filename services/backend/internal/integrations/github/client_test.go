package github

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestAppJWTIsSignedForTheConfiguredApp(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	token, err := appJWT("12345", key, now)
	if err != nil {
		t.Fatalf("appJWT() error = %v", err)
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("JWT has %d parts, want 3", len(parts))
	}
	message := parts[0] + "." + parts[1]
	digest := sha256.Sum256([]byte(message))
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		t.Fatalf("decode signature: %v", err)
	}
	if err := rsa.VerifyPKCS1v15(&key.PublicKey, crypto.SHA256, digest[:], signature); err != nil {
		t.Fatalf("JWT signature verification failed: %v", err)
	}
	var claims struct {
		IssuedAt int64  `json:"iat"`
		Expires  int64  `json:"exp"`
		Issuer   string `json:"iss"`
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("decode claims: %v", err)
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		t.Fatalf("decode claims JSON: %v", err)
	}
	if claims.Issuer != "12345" || claims.IssuedAt != now.Add(-time.Minute).Unix() || claims.Expires != now.Add(9*time.Minute).Unix() {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

func TestParsePrivateKeyAcceptsPKCS1PKCS8AndEscapedNewlines(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	tests := []struct {
		name string
		data []byte
	}{
		{name: "pkcs1", data: x509.MarshalPKCS1PrivateKey(key)},
		{name: "pkcs8", data: func() []byte {
			encoded, encodeErr := x509.MarshalPKCS8PrivateKey(key)
			if encodeErr != nil {
				t.Fatalf("MarshalPKCS8PrivateKey() error = %v", encodeErr)
			}
			return encoded
		}()},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			value := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: test.data}))
			value = strings.ReplaceAll(value, "\n", `\n`)
			parsed, parseErr := parsePrivateKey(value)
			if parseErr != nil {
				t.Fatalf("parsePrivateKey() error = %v", parseErr)
			}
			if parsed.PublicKey.N.Cmp(key.PublicKey.N) != 0 {
				t.Fatal("parsed key does not match the generated key")
			}
		})
	}
}

func TestIssueAndMilestonePatchesPreserveClearOperations(t *testing.T) {
	issueJSON, err := json.Marshal(IssuePatch{Title: "Updated", Labels: nil, Assignees: nil, Milestone: nil})
	if err != nil {
		t.Fatalf("marshal issue patch: %v", err)
	}
	issuePayload := string(issueJSON)
	for _, field := range []string{`"labels":null`, `"assignees":null`, `"milestone":null`} {
		if !strings.Contains(issuePayload, field) {
			t.Fatalf("issue patch %s omitted clear field: %s", field, issuePayload)
		}
	}
	milestoneJSON, err := json.Marshal(MilestonePatch{Title: "Updated", DueOn: nil})
	if err != nil {
		t.Fatalf("marshal milestone patch: %v", err)
	}
	if !strings.Contains(string(milestoneJSON), `"due_on":null`) {
		t.Fatalf("milestone patch omitted due date clear: %s", milestoneJSON)
	}
}

func TestListInstallationRepositoriesUsesInstallationEndpoint(t *testing.T) {
	client := NewClient("installation-token")
	client.BaseURL = "https://api.github.test"
	client.HTTPClient = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/installation/repositories" {
			return nil, fmt.Errorf("path = %s, want /installation/repositories", request.URL.Path)
		}
		if request.URL.Query().Get("per_page") != "100" {
			return nil, fmt.Errorf("per_page = %s, want 100", request.URL.Query().Get("per_page"))
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"repositories":[{"id":42,"name":"app","full_name":"acme/app","private":true,"owner":{"login":"acme"}}]}`)),
			Request:    request,
		}, nil
	})}
	repositories, err := client.ListInstallationRepositories(t.Context())
	if err != nil {
		t.Fatalf("ListInstallationRepositories() error = %v", err)
	}
	if len(repositories) != 1 || repositories[0].FullName != "acme/app" || !repositories[0].Private {
		t.Fatalf("unexpected repositories: %+v", repositories)
	}
}

func TestListIssuesPaginatesAndSkipsPullRequests(t *testing.T) {
	pages := make([]int, 0, 2)
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/repos/acme/app/issues" {
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

		items := make([]map[string]any, 0, 100)
		switch page {
		case 1:
			for number := 1; number <= 99; number++ {
				items = append(items, map[string]any{
					"id":     number,
					"number": number,
					"title":  fmt.Sprintf("Issue %d", number),
					"state":  "open",
				})
			}
			items = append(items, map[string]any{
				"id":           100,
				"number":       100,
				"title":        "Pull request",
				"state":        "open",
				"pull_request": map[string]any{"url": "https://github.com/acme/app/pull/100"},
			})
		case 2:
			items = append(items, map[string]any{
				"id":     101,
				"number": 101,
				"title":  "Issue 101",
				"state":  "closed",
			})
		default:
			response.WriteHeader(http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(response).Encode(items)
	}))
	defer server.Close()

	client := NewClient("token")
	client.BaseURL = server.URL
	issues, err := client.ListIssues(t.Context(), "acme", "app")
	if err != nil {
		t.Fatalf("ListIssues() error = %v", err)
	}
	if len(pages) != 2 || pages[0] != 1 || pages[1] != 2 {
		t.Fatalf("requested pages = %v, want [1 2]", pages)
	}
	if len(issues) != 100 {
		t.Fatalf("got %d issues, want 100 non-pull-request issues", len(issues))
	}
	if issues[0].Number != 1 || issues[len(issues)-1].Number != 101 {
		t.Fatalf("unexpected issue boundaries: first=%+v last=%+v", issues[0], issues[len(issues)-1])
	}
}

func TestUserIncludesRequiredGitHubHeaders(t *testing.T) {
	client := NewClient("test-token")
	client.BaseURL = "https://api.github.test"
	client.HTTPClient = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/user" {
			return nil, fmt.Errorf("path = %s, want /user", request.URL.Path)
		}
		if request.Header.Get("Authorization") != "Bearer test-token" {
			return nil, fmt.Errorf("authorization header was not set")
		}
		if request.Header.Get("Accept") != "application/vnd.github+json" {
			return nil, fmt.Errorf("accept header = %q", request.Header.Get("Accept"))
		}
		if request.Header.Get("X-GitHub-Api-Version") != apiVersion {
			return nil, fmt.Errorf("api version header = %q", request.Header.Get("X-GitHub-Api-Version"))
		}
		if request.Header.Get("User-Agent") != userAgent {
			return nil, fmt.Errorf("user agent header = %q", request.Header.Get("User-Agent"))
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"id":42,"login":"acme"}`)),
			Request:    request,
		}, nil
	})}
	user, err := client.User(t.Context())
	if err != nil {
		t.Fatalf("User() error = %v", err)
	}
	if user.ID != 42 || user.Login != "acme" {
		t.Fatalf("unexpected user: %+v", user)
	}
}

func TestAPIErrorDetectsRateLimitAndReset(t *testing.T) {
	reset := time.Now().UTC().Add(time.Hour)
	err := &APIError{
		StatusCode:         http.StatusForbidden,
		Message:            `{"message":"API rate limit exceeded"}`,
		RateLimitRemaining: "0",
		RateLimitReset:     &reset,
	}
	if !IsRateLimited(err) {
		t.Fatal("IsRateLimited() = false, want true")
	}
	got, ok := RateLimitReset(err)
	if !ok || !got.Equal(reset) {
		t.Fatalf("RateLimitReset() = %v, %v; want %v, true", got, ok, reset)
	}
	retryAt, ok := err.RetryAt()
	if !ok || !retryAt.Equal(reset) {
		t.Fatalf("RetryAt() = %v, %v; want %v, true", retryAt, ok, reset)
	}
}

func TestAPIErrorDetectsInvalidCredentials(t *testing.T) {
	err := &APIError{
		StatusCode: http.StatusUnauthorized,
		Message:    `{"message":"Bad credentials"}`,
	}
	if !IsInvalidCredentials(err) {
		t.Fatal("IsInvalidCredentials() = false, want true")
	}
	if IsRateLimited(err) {
		t.Fatal("IsRateLimited() = true, want false")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}
