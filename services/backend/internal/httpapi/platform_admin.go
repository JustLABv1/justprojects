package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/auth"
	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type platformStats struct {
	Users          int `json:"users"`
	ActiveUsers    int `json:"activeUsers"`
	SuspendedUsers int `json:"suspendedUsers"`
	Workspaces     int `json:"workspaces"`
	Projects       int `json:"projects"`
	Tasks          int `json:"tasks"`
	ActiveSessions int `json:"activeSessions"`
	RecentSignups  int `json:"recentSignups"`
	RecentProjects int `json:"recentProjects"`
}

type platformUserSummary struct {
	ID             uuid.UUID  `bun:"id" json:"id"`
	Name           string     `bun:"name" json:"name"`
	Email          string     `bun:"email" json:"email"`
	EmailVerified  bool       `bun:"email_verified" json:"emailVerified"`
	PlatformAdmin  bool       `bun:"platform_admin" json:"platformAdmin"`
	Suspended      bool       `bun:"suspended" json:"suspended"`
	CreatedAt      time.Time  `bun:"created_at" json:"createdAt"`
	UpdatedAt      time.Time  `bun:"updated_at" json:"updatedAt"`
	TenantCount    int        `bun:"tenant_count" json:"tenantCount"`
	ProjectCount   int        `bun:"project_count" json:"projectCount"`
	ActiveSessions int        `bun:"active_sessions" json:"activeSessions"`
	LastActiveAt   *time.Time `bun:"last_active_at" json:"lastActiveAt,omitempty"`
}

type platformProjectSummary struct {
	ID             uuid.UUID `bun:"id" json:"id"`
	TenantID       uuid.UUID `bun:"tenant_id" json:"tenantId"`
	TenantName     string    `bun:"tenant_name" json:"tenantName"`
	Name           string    `bun:"name" json:"name"`
	Key            string    `bun:"key" json:"key"`
	Status         string    `bun:"status" json:"status"`
	CreatedAt      time.Time `bun:"created_at" json:"createdAt"`
	UpdatedAt      time.Time `bun:"updated_at" json:"updatedAt"`
	CreatedByName  string    `bun:"created_by_name" json:"createdByName"`
	TaskCount      int       `bun:"task_count" json:"taskCount"`
	CompletedTasks int       `bun:"completed_tasks" json:"completedTasks"`
}

type platformUserUpdateRequest struct {
	PlatformAdmin *bool `json:"platformAdmin"`
	Suspended     *bool `json:"suspended"`
}

type platformProjectUpdateRequest struct {
	Status string `json:"status"`
}

type platformSettingsUpdateRequest struct {
	LoginEnabled  *bool `json:"loginEnabled"`
	SignupEnabled *bool `json:"signupEnabled"`
}

func (s *Server) requirePlatformAdmin(c *gin.Context) {
	principal := s.principal(c)
	if principal == nil || !s.Auth.IsPlatformAdmin(principal.User) {
		forbidden(c)
		return
	}
	c.Next()
}

func (s *Server) platformOverview(c *gin.Context) {
	ctx := c.Request.Context()
	var stats platformStats
	var err error
	if stats.Users, err = s.Store.DB.NewSelect().Model((*db.User)(nil)).Count(ctx); err != nil {
		s.platformAdminError(c, "could not calculate platform users")
		return
	}
	if stats.ActiveUsers, err = s.Store.DB.NewSelect().Model((*db.User)(nil)).Where("suspended = false").Count(ctx); err != nil {
		s.platformAdminError(c, "could not calculate active users")
		return
	}
	if stats.SuspendedUsers, err = s.Store.DB.NewSelect().Model((*db.User)(nil)).Where("suspended = true").Count(ctx); err != nil {
		s.platformAdminError(c, "could not calculate suspended users")
		return
	}
	if stats.Workspaces, err = s.Store.DB.NewSelect().Model((*db.Tenant)(nil)).Count(ctx); err != nil {
		s.platformAdminError(c, "could not calculate workspaces")
		return
	}
	if stats.Projects, err = s.Store.DB.NewSelect().Model((*db.Project)(nil)).Count(ctx); err != nil {
		s.platformAdminError(c, "could not calculate projects")
		return
	}
	if stats.Tasks, err = s.Store.DB.NewSelect().Model((*db.Task)(nil)).Count(ctx); err != nil {
		s.platformAdminError(c, "could not calculate tasks")
		return
	}
	if stats.ActiveSessions, err = s.Store.DB.NewSelect().Model((*db.Session)(nil)).Where("expires_at > now()").Count(ctx); err != nil {
		s.platformAdminError(c, "could not calculate active sessions")
		return
	}
	if stats.RecentSignups, err = s.Store.DB.NewSelect().Model((*db.User)(nil)).Where("created_at >= now() - interval '30 days'").Count(ctx); err != nil {
		s.platformAdminError(c, "could not calculate recent signups")
		return
	}
	if stats.RecentProjects, err = s.Store.DB.NewSelect().Model((*db.Project)(nil)).Where("created_at >= now() - interval '30 days'").Count(ctx); err != nil {
		s.platformAdminError(c, "could not calculate recent projects")
		return
	}
	settings, err := s.Auth.PlatformSettings(ctx)
	if err != nil {
		s.platformAdminError(c, "could not load platform settings")
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"stats": stats,
		"settings": gin.H{
			"loginEnabled":  settings.LoginEnabled,
			"signupEnabled": settings.SignupEnabled,
			"oidcEnabled":   (auth.OIDCService{Config: s.Config, Auth: s.Auth}).Configured(),
		},
	})
}

func (s *Server) listPlatformUsers(c *gin.Context) {
	search := strings.TrimSpace(c.Query("q"))
	pattern := "%" + search + "%"
	users := make([]platformUserSummary, 0)
	err := s.Store.DB.NewRaw(`
		SELECT
			u.id,
			u.name,
			u.email,
			u.email_verified,
			u.platform_admin,
			u.suspended,
			u.created_at,
			u.updated_at,
			COUNT(DISTINCT m.tenant_id) AS tenant_count,
			COUNT(DISTINCT p.id) AS project_count,
			COUNT(DISTINCT sess.id) FILTER (WHERE sess.expires_at > now()) AS active_sessions,
			MAX(sess.created_at) AS last_active_at
		FROM users AS u
		LEFT JOIN memberships AS m ON m.user_id = u.id
		LEFT JOIN projects AS p ON p.tenant_id = m.tenant_id
		LEFT JOIN sessions AS sess ON sess.user_id = u.id
		WHERE (? = '' OR u.name ILIKE ? OR u.email ILIKE ?)
		GROUP BY u.id, u.name, u.email, u.email_verified, u.platform_admin, u.suspended, u.created_at, u.updated_at
		ORDER BY u.created_at DESC, u.id DESC`, search, pattern, pattern).Scan(c.Request.Context(), &users)
	if err != nil {
		s.platformAdminError(c, "could not load platform users")
		return
	}
	for index := range users {
		users[index].PlatformAdmin = users[index].PlatformAdmin || s.Auth.IsPlatformAdmin(db.User{Email: users[index].Email})
	}
	c.JSON(http.StatusOK, gin.H{"items": users, "count": len(users)})
}

func (s *Server) listPlatformProjects(c *gin.Context) {
	search := strings.TrimSpace(c.Query("q"))
	pattern := "%" + search + "%"
	projects := make([]platformProjectSummary, 0)
	err := s.Store.DB.NewRaw(`
		SELECT
			p.id,
			p.tenant_id,
			t.name AS tenant_name,
			p.name,
			p.key,
			p.status,
			p.created_at,
			p.updated_at,
			COALESCE(u.name, '') AS created_by_name,
			COUNT(DISTINCT ta.id) AS task_count,
			COUNT(DISTINCT ta.id) FILTER (WHERE ps.category = 'done') AS completed_tasks
		FROM projects AS p
		JOIN tenants AS t ON t.id = p.tenant_id
		LEFT JOIN users AS u ON u.id = p.created_by
		LEFT JOIN tasks AS ta ON ta.project_id = p.id
		LEFT JOIN project_statuses AS ps ON ps.id = ta.status_id
		WHERE (? = '' OR p.name ILIKE ? OR p.key ILIKE ? OR t.name ILIKE ?)
		GROUP BY p.id, p.tenant_id, t.name, p.name, p.key, p.status, p.created_at, p.updated_at, u.name
		ORDER BY p.updated_at DESC, p.id DESC`, search, pattern, pattern, pattern).Scan(c.Request.Context(), &projects)
	if err != nil {
		s.platformAdminError(c, "could not load platform projects")
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": projects, "count": len(projects)})
}

func (s *Server) updatePlatformUser(c *gin.Context) {
	userID, ok := pathUUID(c, "userId")
	if !ok {
		return
	}
	var input platformUserUpdateRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid platform user payload"))
		return
	}
	if input.PlatformAdmin == nil && input.Suspended == nil {
		badRequest(c, errors.New("platformAdmin or suspended is required"))
		return
	}
	principal := s.principal(c)
	if principal != nil && userID == principal.User.ID && ((input.PlatformAdmin != nil && !*input.PlatformAdmin) || (input.Suspended != nil && *input.Suspended)) {
		forbidden(c)
		return
	}

	ctx := c.Request.Context()
	tx, err := s.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		s.platformAdminError(c, "could not update platform user")
		return
	}
	defer func() { _ = tx.Rollback() }()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('justprojects:platform-admin-bootstrap'))`); err != nil {
		s.platformAdminError(c, "could not lock platform user update")
		return
	}
	var target db.User
	if err = tx.NewSelect().Model(&target).Where("id = ?", userID).Scan(ctx); err != nil {
		notFound(c)
		return
	}
	if input.PlatformAdmin != nil && !*input.PlatformAdmin && !target.PlatformAdmin && s.Auth.IsPlatformAdmin(target) {
		conflict(c, "this administrator is configured by PLATFORM_ADMIN_EMAILS")
		return
	}
	finalAdmin := target.PlatformAdmin
	if input.PlatformAdmin != nil {
		finalAdmin = *input.PlatformAdmin
	}
	finalSuspended := target.Suspended
	if input.Suspended != nil {
		finalSuspended = *input.Suspended
	}
	if s.Auth.IsPlatformAdmin(target) && (!finalAdmin || finalSuspended) {
		adminCount, countErr := platformAdminCount(ctx, tx, s.Auth)
		if countErr != nil {
			s.platformAdminError(c, "could not validate platform administrators")
			return
		}
		if adminCount <= 1 {
			conflict(c, "at least one active platform administrator is required")
			return
		}
	}
	update := tx.NewUpdate().Model((*db.User)(nil)).Where("id = ?", userID).Set("updated_at = ?", time.Now().UTC())
	if input.PlatformAdmin != nil {
		update = update.Set("platform_admin = ?", *input.PlatformAdmin)
	}
	if input.Suspended != nil {
		update = update.Set("suspended = ?", *input.Suspended)
	}
	if _, err = update.Exec(ctx); err != nil {
		s.platformAdminError(c, "could not update platform user")
		return
	}
	if input.Suspended != nil && *input.Suspended {
		if _, err = tx.NewDelete().Model((*db.Session)(nil)).Where("user_id = ?", userID).Exec(ctx); err != nil {
			s.platformAdminError(c, "could not revoke suspended user sessions")
			return
		}
	}
	if err = tx.Commit(); err != nil {
		s.platformAdminError(c, "could not update platform user")
		return
	}
	if err = s.Store.DB.NewSelect().Model(&target).Where("id = ?", userID).Scan(ctx); err != nil {
		s.platformAdminError(c, "could not load updated platform user")
		return
	}
	target.PlatformAdmin = s.Auth.IsPlatformAdmin(target)
	c.JSON(http.StatusOK, target)
}

func (s *Server) revokePlatformUserSessions(c *gin.Context) {
	userID, ok := pathUUID(c, "userId")
	if !ok {
		return
	}
	principal := s.principal(c)
	if principal != nil && userID == principal.User.ID {
		forbidden(c)
		return
	}
	if count, err := s.Store.DB.NewSelect().Model((*db.User)(nil)).Where("id = ?", userID).Count(c.Request.Context()); err != nil {
		s.platformAdminError(c, "could not validate platform user")
		return
	} else if count == 0 {
		notFound(c)
		return
	}
	result, err := s.Store.DB.NewDelete().Model((*db.Session)(nil)).Where("user_id = ?", userID).Exec(c.Request.Context())
	if err != nil {
		s.platformAdminError(c, "could not revoke sessions")
		return
	}
	revoked, _ := result.RowsAffected()
	c.JSON(http.StatusOK, gin.H{"revoked": revoked})
}

func (s *Server) updatePlatformProject(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	var input platformProjectUpdateRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid platform project payload"))
		return
	}
	if input.Status != "active" && input.Status != "paused" && input.Status != "archived" {
		badRequest(c, errors.New("project status must be active, paused, or archived"))
		return
	}
	result, err := s.Store.DB.NewUpdate().Model((*db.Project)(nil)).Set("status = ?", input.Status).Set("updated_at = ?", time.Now().UTC()).Set("version = version + 1").Where("id = ?", projectID).Exec(c.Request.Context())
	if err != nil {
		s.platformAdminError(c, "could not update platform project")
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		notFound(c)
		return
	}
	var project db.Project
	if err = s.Store.DB.NewSelect().Model(&project).Where("id = ?", projectID).Scan(c.Request.Context()); err != nil {
		s.platformAdminError(c, "could not load updated platform project")
		return
	}
	c.JSON(http.StatusOK, project)
}

func (s *Server) updatePlatformSettings(c *gin.Context) {
	var input platformSettingsUpdateRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid platform settings payload"))
		return
	}
	if input.LoginEnabled == nil && input.SignupEnabled == nil {
		badRequest(c, errors.New("loginEnabled or signupEnabled is required"))
		return
	}
	update := s.Store.DB.NewUpdate().Model((*db.PlatformSettings)(nil)).Where("singleton_id = true").Set("updated_at = ?", time.Now().UTC())
	if input.LoginEnabled != nil {
		update = update.Set("login_enabled = ?", *input.LoginEnabled)
	}
	if input.SignupEnabled != nil {
		update = update.Set("signup_enabled = ?", *input.SignupEnabled)
	}
	if _, err := update.Exec(c.Request.Context()); err != nil {
		s.platformAdminError(c, "could not update platform settings")
		return
	}
	settings, err := s.Auth.PlatformSettings(c.Request.Context())
	if err != nil {
		s.platformAdminError(c, "could not load platform settings")
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"loginEnabled":  settings.LoginEnabled,
		"signupEnabled": settings.SignupEnabled,
		"oidcEnabled":   (auth.OIDCService{Config: s.Config, Auth: s.Auth}).Configured(),
	})
}

func (s *Server) platformAdminError(c *gin.Context, message string) {
	writeError(c, http.StatusInternalServerError, errors.New(message))
}

type platformAdminReader interface {
	IsPlatformAdmin(user db.User) bool
}

func platformAdminCount(ctx context.Context, database bun.IDB, authService platformAdminReader) (int, error) {
	users := make([]db.User, 0)
	if err := database.NewSelect().Model(&users).Column("email", "platform_admin", "suspended").Scan(ctx); err != nil {
		return 0, err
	}
	count := 0
	for _, user := range users {
		if !user.Suspended && authService.IsPlatformAdmin(user) {
			count++
		}
	}
	return count, nil
}
