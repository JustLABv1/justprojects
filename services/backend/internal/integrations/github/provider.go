package github

import "github.com/JustLABv1/justprojects/services/backend/internal/integrations"

// Aliases preserve the package-local names used by the GitHub client while
// making the provider contract reusable by GitLab and future providers.
type Repository = integrations.Repository
type User = integrations.User
type Issue = integrations.Issue
type Milestone = integrations.Milestone
type IssuePatch = integrations.IssuePatch
type MilestonePatch = integrations.MilestonePatch
type Provider = integrations.Provider
