package permissions

import (
	"context"

	"github.com/JustLABv1/justprojects/services/backend/internal/auth"
	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/google/uuid"
)

var defaultRolePermissions = map[string]map[string]bool{
	"owner": {"*": true},
	"admin": {"*": true},
	"member": {
		"tenant.read": true, "project.read": true, "project.create": true, "project.update": true,
		"project_request.read": true, "project_request.manage": true, "project_update.read": true, "project_update.manage": true,
		"notification.read": true, "notification.manage": true, "portfolio.read": true,
		"task.read": true, "task.create": true, "task.update": true, "task.edit": true, "task.delete": true,
		"milestone.read": true, "milestone.create": true, "milestone.update": true, "milestone.delete": true,
		"label.read": true, "label.manage": true, "public_page.read": true,
	},
	"viewer": {
		"tenant.read": true, "project.read": true, "task.read": true, "milestone.read": true,
		"label.read": true, "public_page.read": true,
	},
}

type Service struct {
	Store *db.Store
}

var permissionAliases = map[string][]string{
	"project.read":           {"project.read", "project.view"},
	"project.create":         {"project.create", "project.manage"},
	"project.update":         {"project.update", "project.manage"},
	"project.manage":         {"project.manage", "project.update"},
	"workflow.manage":        {"workflow.manage", "project.manage"},
	"task.read":              {"task.read", "task.view"},
	"task.create":            {"task.create", "task.edit"},
	"task.update":            {"task.update", "task.edit"},
	"task.edit":              {"task.edit", "task.update"},
	"milestone.read":         {"milestone.read", "milestone.view"},
	"milestone.create":       {"milestone.create", "milestone.manage"},
	"milestone.update":       {"milestone.update", "milestone.manage"},
	"label.read":             {"label.read", "label.view"},
	"label.manage":           {"label.manage", "project.manage"},
	"integration.manage":     {"integration.manage", "project.manage"},
	"sync.resolve":           {"sync.resolve", "project.manage"},
	"public_page.read":       {"public_page.read", "public_page.manage"},
	"public_page.manage":     {"public_page.manage", "project.manage"},
	"project_request.read":   {"project_request.read", "tenant.read"},
	"project_request.manage": {"project_request.manage", "tenant.manage"},
	"project_update.read":    {"project_update.read", "project.read"},
	"project_update.manage":  {"project_update.manage", "project.update"},
	"notification.read":      {"notification.read", "tenant.read"},
	"notification.manage":    {"notification.manage", "tenant.read"},
	"portfolio.read":         {"portfolio.read", "project.read"},
}

func permissionNames(permission string) []string {
	if names, ok := permissionAliases[permission]; ok {
		return names
	}
	return []string{permission}
}

func grantMatches(grant db.PermissionGrant, permission string) bool {
	if grant.Permission == "*" {
		return true
	}
	for _, name := range permissionNames(permission) {
		if grant.Permission == name {
			return true
		}
	}
	return false
}

func (s Service) Can(ctx context.Context, principal *auth.Principal, permission string, projectID *uuid.UUID) (bool, error) {
	if principal == nil {
		return false, nil
	}

	var grants []db.PermissionGrant
	query := s.Store.DB.NewSelect().Model(&grants).
		Where("tenant_id = ? AND user_id = ?", principal.Tenant.ID, principal.User.ID)
	if projectID == nil {
		query = query.Where("project_id IS NULL")
	} else {
		query = query.Where("project_id IS NULL OR project_id = ?", *projectID)
	}
	if err := query.Scan(ctx); err != nil {
		return false, err
	}

	// An exact project grant is more specific than a tenant grant. A deny wins
	// at either scope so an owner/admin wildcard can still be restricted on a
	// sensitive project or integration action.
	for _, effect := range []string{"deny", "allow"} {
		for _, scope := range []int{1, 0} {
			for _, grant := range grants {
				if !grantMatches(grant, permission) || grant.Effect != effect {
					continue
				}
				isProjectGrant := projectID != nil && grant.ProjectID != nil && *grant.ProjectID == *projectID
				isTenantGrant := grant.ProjectID == nil
				if (scope == 1 && isProjectGrant) || (scope == 0 && isTenantGrant) {
					return effect == "allow", nil
				}
			}
		}
	}

	rolePermissions := defaultRolePermissions[principal.Membership.Role]
	if rolePermissions["*"] {
		return true, nil
	}
	for _, name := range permissionNames(permission) {
		if rolePermissions[name] {
			return true, nil
		}
	}
	return false, nil
}
