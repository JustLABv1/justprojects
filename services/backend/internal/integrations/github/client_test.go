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

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}
