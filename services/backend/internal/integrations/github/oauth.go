package github

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

func OAuthURL(clientID, redirectURI, state string) string {
	query := url.Values{}
	query.Set("client_id", clientID)
	query.Set("redirect_uri", redirectURI)
	query.Set("state", state)
	query.Set("scope", "read:user user:email repo")
	return "https://github.com/login/oauth/authorize?" + query.Encode()
}

type OAuthToken struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
	TokenType    string `json:"token_type"`
}

func ExchangeOAuthCode(ctx context.Context, clientID, clientSecret, code string) (OAuthToken, error) {
	values := url.Values{}
	values.Set("client_id", clientID)
	values.Set("client_secret", clientSecret)
	values.Set("code", code)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://github.com/login/oauth/access_token", strings.NewReader(values.Encode()))
	if err != nil {
		return OAuthToken{}, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", userAgent)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return OAuthToken{}, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return OAuthToken{}, fmt.Errorf("github oauth exchange returned %s", res.Status)
	}
	var token OAuthToken
	if err := json.NewDecoder(res.Body).Decode(&token); err != nil {
		return OAuthToken{}, err
	}
	if token.AccessToken == "" {
		return OAuthToken{}, fmt.Errorf("github oauth response did not contain an access token")
	}
	return token, nil
}
