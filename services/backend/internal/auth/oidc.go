package auth

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/JustLABv1/justprojects/services/backend/internal/config"
	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type OIDCService struct {
	Config config.Config
	Auth   *Service
}

func (o OIDCService) configured() bool {
	return o.Config.OIDCIssuerURL != "" && o.Config.OIDCClientID != "" && o.Config.OIDCClientSecret != "" && o.Config.OIDCRedirectURL != ""
}

func (o OIDCService) oauthConfig(ctx context.Context) (*oidc.Provider, *oauth2.Config, error) {
	if !o.configured() {
		return nil, nil, fmt.Errorf("oidc is not configured")
	}
	provider, err := oidc.NewProvider(ctx, o.Config.OIDCIssuerURL)
	if err != nil {
		return nil, nil, fmt.Errorf("discover oidc provider: %w", err)
	}
	return provider, &oauth2.Config{ClientID: o.Config.OIDCClientID, ClientSecret: o.Config.OIDCClientSecret, Endpoint: provider.Endpoint(), RedirectURL: o.Config.OIDCRedirectURL, Scopes: []string{oidc.ScopeOpenID, "profile", "email"}}, nil
}

func (o OIDCService) StartURL(ctx context.Context, state string) (string, error) {
	_, oauth, err := o.oauthConfig(ctx)
	if err != nil {
		return "", err
	}
	return oauth.AuthCodeURL(state, oauth2.AccessTypeOffline), nil
}

func (o OIDCService) Callback(ctx context.Context, code string) (*Principal, string, error) {
	provider, oauth, err := o.oauthConfig(ctx)
	if err != nil {
		return nil, "", err
	}
	token, err := oauth.Exchange(ctx, code)
	if err != nil {
		return nil, "", fmt.Errorf("exchange oidc code: %w", err)
	}
	idToken, ok := token.Extra("id_token").(string)
	if !ok || idToken == "" {
		return nil, "", fmt.Errorf("oidc response did not contain an id token")
	}
	verifier := provider.Verifier(&oidc.Config{ClientID: o.Config.OIDCClientID})
	verified, err := verifier.Verify(ctx, idToken)
	if err != nil {
		return nil, "", fmt.Errorf("verify oidc id token: %w", err)
	}
	var claims struct {
		Subject           string `json:"sub"`
		Email             string `json:"email"`
		Name              string `json:"name"`
		PreferredUsername string `json:"preferred_username"`
	}
	if err = verified.Claims(&claims); err != nil {
		return nil, "", fmt.Errorf("read oidc claims: %w", err)
	}
	name := claims.Name
	if name == "" {
		name = claims.PreferredUsername
	}
	if name == "" {
		name = claims.Email
	}
	return o.Auth.LoginIdentity(ctx, "oidc:"+issuerHost(o.Config.OIDCIssuerURL), claims.Subject, claims.Email, name)
}

func issuerHost(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return strings.TrimRight(raw, "/")
	}
	return parsed.Host
}
