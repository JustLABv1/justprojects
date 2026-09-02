package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/mail"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/auth"
	"github.com/JustLABv1/justprojects/services/backend/internal/config"
	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/JustLABv1/justprojects/services/backend/internal/integrations"
	gh "github.com/JustLABv1/justprojects/services/backend/internal/integrations/github"
	gitlab "github.com/JustLABv1/justprojects/services/backend/internal/integrations/gitlab"
	"github.com/JustLABv1/justprojects/services/backend/internal/permissions"
	"github.com/JustLABv1/justprojects/services/backend/internal/queue"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/driver/pgdriver"
)

const (
	principalKey      = "justprojects.principal"
	oidcStateCookie   = "justprojects_oidc_state"
	githubStateCookie = "justprojects_github_state"
)

var publicPageSlugPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$`)

type Server struct {
	Store        *db.Store
	Config       config.Config
	Auth         *auth.Service
	Permissions  permissions.Service
	Queue        queue.Queue
	publicRateMu sync.Mutex
	publicRate   map[string]publicRateEntry
}

type publicRateEntry struct {
	StartedAt time.Time
	Count     int
}

func NewServer(store *db.Store, cfg config.Config, authService *auth.Service) *Server {
	return &Server{Store: store, Config: cfg, Auth: authService, Permissions: permissions.Service{Store: store}, Queue: queue.Queue{Store: store}, publicRate: make(map[string]publicRateEntry)}
}

func (s *Server) Router() *gin.Engine {
	router := gin.New()
	router.Use(gin.Recovery(), s.requestLogger(), s.cors())
	router.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	router.GET("/readyz", s.ready)

	api := router.Group("/api/v1")
	authRoutes := api.Group("/auth")
	authRoutes.POST("/register", s.register)
	authRoutes.POST("/login", s.login)
	authRoutes.POST("/logout", s.logout)
	authRoutes.GET("/session", s.session)
	authRoutes.GET("/oidc/start", s.oidcStart)
	authRoutes.GET("/oidc/callback", s.oidcCallback)
	authRoutes.POST("/public/pages/:slug/login", s.customerLogin)

	api.GET("/public/pages/:slug", s.publicPage)
	api.POST("/webhooks/github", s.githubWebhook)
	api.POST("/webhooks/gitlab", s.gitlabWebhook)

	protected := api.Group("")
	protected.Use(s.requireAuth)
	protected.GET("/me", s.me)
	protected.GET("/tenant", s.getTenant)
	protected.GET("/tenant/members", s.listTenantMembers)
	protected.PATCH("/tenant/members/:userId", s.updateTenantMember)
	protected.GET("/tenant/permissions", s.listPermissionGrants)
	protected.POST("/tenant/permissions", s.createPermissionGrant)
	protected.DELETE("/tenant/permissions/:grantId", s.deletePermissionGrant)
	protected.GET("/tenant/invitations", s.listInvitations)
	protected.POST("/tenant/invitations", s.createInvitation)
	protected.POST("/tenant/invitations/:token/accept", s.acceptInvitation)
	protected.GET("/projects", s.listProjects)
	protected.POST("/projects", s.createProject)
	protected.GET("/projects/:projectId", s.getProject)
	protected.PATCH("/projects/:projectId", s.updateProject)
	protected.GET("/projects/:projectId/statuses", s.listStatuses)
	protected.POST("/projects/:projectId/statuses", s.createStatus)
	protected.PATCH("/projects/:projectId/statuses/:statusId", s.updateStatus)
	protected.GET("/projects/:projectId/tasks", s.listTasks)
	protected.POST("/projects/:projectId/tasks", s.createTask)
	protected.PATCH("/projects/:projectId/tasks/:taskId", s.updateTask)
	protected.GET("/projects/:projectId/milestones", s.listMilestones)
	protected.POST("/projects/:projectId/milestones", s.createMilestone)
	protected.PATCH("/projects/:projectId/milestones/:milestoneId", s.updateMilestone)
	protected.GET("/projects/:projectId/labels", s.listLabels)
	protected.POST("/projects/:projectId/labels", s.createLabel)
	protected.GET("/projects/:projectId/public-pages", s.listPublicPages)
	protected.POST("/projects/:projectId/public-pages", s.createPublicPage)
	protected.GET("/public-pages/:pageId/viewers", s.listPublicPageViewers)
	protected.POST("/public-pages/:pageId/viewers", s.addPublicPageViewer)
	protected.DELETE("/public-pages/:pageId/viewers/:userId", s.removePublicPageViewer)
	protected.POST("/public-pages/:pageId/revoke", s.revokePublicPage)
	protected.GET("/sync/conflicts", s.listConflicts)
	protected.POST("/sync/conflicts/:conflictId/resolve", s.resolveConflict)
	protected.GET("/sync/runs", s.listSyncRuns)
	protected.GET("/audit/events", s.listAuditEvents)
	protected.GET("/integrations/github/connections", s.listGitHubConnections)
	protected.GET("/integrations/connections", s.listGitConnections)
	protected.DELETE("/integrations/connections/:connectionId", s.deleteGitConnection)
	protected.POST("/integrations/github/connections", s.createGitHubTokenConnection)
	protected.POST("/integrations/gitlab/connections", s.createGitLabConnection)
	protected.GET("/integrations/github/oauth/start", s.githubOAuthStart)
	protected.GET("/integrations/github/oauth/callback", s.githubOAuthCallback)
	protected.GET("/integrations/github/repositories", s.listGitHubRepositories)
	protected.GET("/integrations/repositories", s.listGitRepositories)
	protected.GET("/integrations/github/user-mappings", s.listGitHubUserMappings)
	protected.POST("/integrations/github/user-mappings", s.createGitHubUserMapping)
	protected.DELETE("/integrations/github/user-mappings/:mappingId", s.deleteGitHubUserMapping)
	protected.GET("/integrations/github/app/install", s.githubAppInstall)
	protected.GET("/integrations/github/app/callback", s.githubAppCallback)
	protected.GET("/projects/:projectId/repositories", s.listProjectRepositories)
	protected.POST("/projects/:projectId/repositories", s.attachProjectRepository)
	protected.DELETE("/projects/:projectId/repositories/:repositoryId", s.detachProjectRepository)
	protected.POST("/projects/:projectId/github/import", s.importGitHubProject)
	protected.POST("/projects/:projectId/git/import", s.importGitProject)

	return router
}

func (s *Server) requestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		c.Next()
		slog.Default().Info("http_request",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"duration_ms", time.Since(started).Milliseconds(),
			"client_ip", c.ClientIP(),
		)
	}
}

func (s *Server) cors() gin.HandlerFunc {
	allowed := make(map[string]bool, len(s.Config.AllowedOrigins))
	for _, origin := range s.Config.AllowedOrigins {
		allowed[origin] = true
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if allowed[origin] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, X-Tenant-ID")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			c.Header("Vary", "Origin")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func (s *Server) ready(c *gin.Context) {
	if err := s.Store.DB.PingContext(c.Request.Context()); err != nil {
		writeError(c, http.StatusServiceUnavailable, errors.New("database unavailable"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}

func (s *Server) requireAuth(c *gin.Context) {
	token, err := c.Cookie(s.Config.SessionCookieName)
	if err != nil || token == "" {
		unauthorized(c)
		return
	}
	principal, err := s.Auth.PrincipalFromToken(c.Request.Context(), token)
	if err != nil {
		unauthorized(c)
		return
	}
	c.Set(principalKey, principal)
	c.Next()
}

func (s *Server) principal(c *gin.Context) *auth.Principal {
	value, ok := c.Get(principalKey)
	if !ok {
		return nil
	}
	principal, _ := value.(*auth.Principal)
	return principal
}

func (s *Server) authorize(c *gin.Context, permission string, projectID *uuid.UUID) bool {
	allowed, err := s.Permissions.Can(c.Request.Context(), s.principal(c), permission, projectID)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("permission check failed"))
		return false
	}
	if !allowed {
		forbidden(c)
		return false
	}
	return true
}

func (s *Server) setSessionCookie(c *gin.Context, token string) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(s.Config.SessionCookieName, token, int(s.Config.SessionTTL.Seconds()), "/", "", s.Config.SecureCookies, true)
}

func (s *Server) clearSessionCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(s.Config.SessionCookieName, "", -1, "/", "", s.Config.SecureCookies, true)
}

type registerRequest struct {
	Email      string `json:"email"`
	Name       string `json:"name"`
	Password   string `json:"password"`
	TenantName string `json:"tenantName"`
}
type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	TenantID string `json:"tenantId"`
}

func (s *Server) register(c *gin.Context) {
	var input registerRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid registration payload"))
		return
	}
	principal, token, err := s.Auth.Register(c.Request.Context(), auth.RegisterInput{Email: input.Email, Name: input.Name, Password: input.Password, TenantName: input.TenantName})
	if err != nil {
		badRequest(c, err)
		return
	}
	s.setSessionCookie(c, token)
	c.JSON(http.StatusCreated, gin.H{"user": principal.User, "tenant": principal.Tenant, "membership": principal.Membership})
}

func (s *Server) login(c *gin.Context) {
	var input loginRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid login payload"))
		return
	}
	var tenantID *uuid.UUID
	if input.TenantID != "" {
		parsed, err := uuid.Parse(input.TenantID)
		if err != nil {
			badRequest(c, errors.New("invalid tenant id"))
			return
		}
		tenantID = &parsed
	}
	principal, token, err := s.Auth.Login(c.Request.Context(), auth.LoginInput{Email: input.Email, Password: input.Password, TenantID: tenantID})
	if err != nil {
		writeError(c, http.StatusUnauthorized, auth.ErrInvalidCredentials)
		return
	}
	s.setSessionCookie(c, token)
	c.JSON(http.StatusOK, gin.H{"user": principal.User, "tenant": principal.Tenant, "membership": principal.Membership})
}

func (s *Server) customerLogin(c *gin.Context) {
	var input loginRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid customer login payload"))
		return
	}
	principal, token, err := s.Auth.LoginCustomer(c.Request.Context(), c.Param("slug"), input.Email, input.Password)
	if err != nil {
		writeError(c, http.StatusUnauthorized, auth.ErrInvalidCredentials)
		return
	}
	s.setSessionCookie(c, token)
	c.JSON(http.StatusOK, gin.H{"user": principal.User, "tenant": principal.Tenant, "membership": principal.Membership, "customerPageId": principal.CustomerPageID})
}

func (s *Server) logout(c *gin.Context) {
	if token, err := c.Cookie(s.Config.SessionCookieName); err == nil {
		_ = s.Auth.DeleteSession(c.Request.Context(), token)
	}
	s.clearSessionCookie(c)
	c.Status(http.StatusNoContent)
}

func (s *Server) session(c *gin.Context) {
	token, err := c.Cookie(s.Config.SessionCookieName)
	if err != nil {
		unauthorized(c)
		return
	}
	principal, err := s.Auth.PrincipalFromToken(c.Request.Context(), token)
	if err != nil {
		unauthorized(c)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": principal.User, "tenant": principal.Tenant, "membership": principal.Membership})
}

func (s *Server) oidcStart(c *gin.Context) {
	state, err := randomToken(24)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not create oidc state"))
		return
	}
	url, err := (auth.OIDCService{Config: s.Config, Auth: s.Auth}).StartURL(c.Request.Context(), state)
	if err != nil {
		writeError(c, http.StatusNotImplemented, errors.New("oidc is not configured"))
		return
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(oidcStateCookie, state, 600, "/", "", s.Config.SecureCookies, true)
	c.JSON(http.StatusOK, gin.H{"url": url})
}

func (s *Server) oidcCallback(c *gin.Context) {
	state, err := c.Cookie(oidcStateCookie)
	if err != nil || state == "" || subtle.ConstantTimeCompare([]byte(state), []byte(c.Query("state"))) != 1 {
		badRequest(c, errors.New("invalid oidc state"))
		return
	}
	if c.Query("code") == "" {
		badRequest(c, errors.New("oidc code is required"))
		return
	}
	_, token, err := (auth.OIDCService{Config: s.Config, Auth: s.Auth}).Callback(c.Request.Context(), c.Query("code"))
	if err != nil {
		writeError(c, http.StatusBadGateway, errors.New("oidc authentication failed"))
		return
	}
	s.setSessionCookie(c, token)
	c.SetCookie(oidcStateCookie, "", -1, "/", "", s.Config.SecureCookies, true)
	c.Redirect(http.StatusFound, s.Config.FrontendURL+"/?auth=connected")
}

func (s *Server) me(c *gin.Context) {
	principal := s.principal(c)
	c.JSON(http.StatusOK, gin.H{"user": principal.User, "tenant": principal.Tenant, "membership": principal.Membership})
}

type tenantMemberResponse struct {
	Membership db.Membership `json:"membership"`
	User       db.User       `json:"user"`
}

func (s *Server) getTenant(c *gin.Context) {
	if !s.authorize(c, "tenant.read", nil) {
		return
	}
	var members []db.Membership
	if err := s.Store.DB.NewSelect().Model(&members).Where("tenant_id = ?", s.principal(c).Tenant.ID).Order("created_at ASC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load tenant members"))
		return
	}
	users := make(map[uuid.UUID]db.User, len(members))
	if len(members) > 0 {
		ids := make([]uuid.UUID, 0, len(members))
		for _, member := range members {
			ids = append(ids, member.UserID)
		}
		var records []db.User
		if err := s.Store.DB.NewSelect().Model(&records).Where("id IN (?)", bun.In(ids)).Scan(c.Request.Context()); err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not load tenant users"))
			return
		}
		for _, user := range records {
			users[user.ID] = user
		}
	}
	result := make([]tenantMemberResponse, 0, len(members))
	for _, member := range members {
		result = append(result, tenantMemberResponse{Membership: member, User: users[member.UserID]})
	}
	c.JSON(http.StatusOK, gin.H{"tenant": s.principal(c).Tenant, "members": result})
}

func (s *Server) listTenantMembers(c *gin.Context) {
	s.getTenant(c)
}

type memberRoleRequest struct {
	Role string `json:"role"`
}

func (s *Server) updateTenantMember(c *gin.Context) {
	if !s.authorize(c, "tenant.manage", nil) {
		return
	}
	userID, ok := pathUUID(c, "userId")
	if !ok {
		return
	}
	var input memberRoleRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid member payload"))
		return
	}
	if input.Role != "admin" && input.Role != "member" && input.Role != "viewer" {
		badRequest(c, errors.New("member role must be admin, member, or viewer"))
		return
	}
	var membership db.Membership
	if err := s.Store.DB.NewSelect().Model(&membership).Where("tenant_id = ? AND user_id = ?", s.principal(c).Tenant.ID, userID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	if membership.Role == "owner" {
		forbidden(c)
		return
	}
	result, err := s.Store.DB.NewUpdate().Model((*db.Membership)(nil)).Set("role = ?", input.Role).Set("updated_at = ?", time.Now().UTC()).Where("id = ? AND tenant_id = ?", membership.ID, s.principal(c).Tenant.ID).Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not update member role"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		notFound(c)
		return
	}
	membership.Role = input.Role
	_ = s.audit(c, "membership.updated", "membership", membership.ID, map[string]any{"role": input.Role})
	c.JSON(http.StatusOK, membership)
}

type permissionGrantRequest struct {
	UserID     string `json:"userId"`
	ProjectID  string `json:"projectId"`
	Permission string `json:"permission"`
	Effect     string `json:"effect"`
}

func (s *Server) listPermissionGrants(c *gin.Context) {
	if !s.authorize(c, "tenant.manage", nil) {
		return
	}
	query := s.Store.DB.NewSelect().Model((*db.PermissionGrant)(nil)).Where("tenant_id = ?", s.principal(c).Tenant.ID)
	if raw := c.Query("userId"); raw != "" {
		userID, err := uuid.Parse(raw)
		if err != nil {
			badRequest(c, errors.New("invalid user id"))
			return
		}
		query = query.Where("user_id = ?", userID)
	}
	if raw := c.Query("projectId"); raw != "" {
		projectID, err := uuid.Parse(raw)
		if err != nil {
			badRequest(c, errors.New("invalid project id"))
			return
		}
		query = query.Where("project_id = ?", projectID)
	}
	grants := make([]db.PermissionGrant, 0)
	if err := query.Order("created_at ASC").Scan(c.Request.Context(), &grants); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load permission grants"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": grants, "count": len(grants)})
}

func (s *Server) createPermissionGrant(c *gin.Context) {
	if !s.authorize(c, "tenant.manage", nil) {
		return
	}
	var input permissionGrantRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid permission grant payload"))
		return
	}
	userID, err := uuid.Parse(input.UserID)
	if err != nil {
		badRequest(c, errors.New("invalid user id"))
		return
	}
	var memberCount int
	memberCount, err = s.Store.DB.NewSelect().Model((*db.Membership)(nil)).Where("tenant_id = ? AND user_id = ?", s.principal(c).Tenant.ID, userID).Count(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not validate member"))
		return
	}
	if memberCount != 1 {
		notFound(c)
		return
	}
	projectID, err := optionalUUID(input.ProjectID)
	if err != nil {
		badRequest(c, errors.New("invalid project id"))
		return
	}
	if projectID != nil {
		if _, err = s.project(c, *projectID); err != nil {
			notFound(c)
			return
		}
	}
	permission := strings.TrimSpace(input.Permission)
	if !validPermission(permission) {
		badRequest(c, errors.New("unsupported permission"))
		return
	}
	effect := input.Effect
	if effect == "" {
		effect = "allow"
	}
	if effect != "allow" && effect != "deny" {
		badRequest(c, errors.New("permission effect must be allow or deny"))
		return
	}
	var existing db.PermissionGrant
	existingQuery := s.Store.DB.NewSelect().Model(&existing).Where("tenant_id = ? AND user_id = ? AND permission = ? AND effect = ?", s.principal(c).Tenant.ID, userID, permission, effect)
	if projectID == nil {
		existingQuery = existingQuery.Where("project_id IS NULL")
	} else {
		existingQuery = existingQuery.Where("project_id = ?", *projectID)
	}
	if err = existingQuery.Scan(c.Request.Context()); err == nil {
		c.JSON(http.StatusOK, existing)
		return
	}
	now := time.Now().UTC()
	grant := db.PermissionGrant{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: s.principal(c).Tenant.ID, UserID: userID, ProjectID: projectID, Permission: permission, Effect: effect}
	if _, err = s.Store.DB.NewInsert().Model(&grant).Exec(c.Request.Context()); err != nil {
		conflict(c, "permission grant already exists")
		return
	}
	_ = s.audit(c, "permission_grant.created", "permission_grant", grant.ID, map[string]any{"userId": userID, "projectId": projectID, "permission": permission, "effect": effect})
	c.JSON(http.StatusCreated, grant)
}

func (s *Server) deletePermissionGrant(c *gin.Context) {
	if !s.authorize(c, "tenant.manage", nil) {
		return
	}
	grantID, ok := pathUUID(c, "grantId")
	if !ok {
		return
	}
	result, err := s.Store.DB.NewDelete().Model((*db.PermissionGrant)(nil)).Where("id = ? AND tenant_id = ?", grantID, s.principal(c).Tenant.ID).Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not delete permission grant"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		notFound(c)
		return
	}
	_ = s.audit(c, "permission_grant.deleted", "permission_grant", grantID, nil)
	c.Status(http.StatusNoContent)
}

func validPermission(permission string) bool {
	switch permission {
	case "*", "tenant.read", "tenant.manage", "project.read", "project.create", "project.update", "project.manage", "workflow.manage", "task.read", "task.create", "task.update", "task.edit", "task.delete", "milestone.read", "milestone.create", "milestone.update", "milestone.manage", "milestone.delete", "label.read", "label.manage", "integration.manage", "sync.resolve", "public_page.read", "public_page.manage":
		return true
	default:
		return false
	}
}

type invitationRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

func (s *Server) listInvitations(c *gin.Context) {
	if !s.authorize(c, "tenant.read", nil) {
		return
	}
	invitations := make([]db.TenantInvitation, 0)
	if err := s.Store.DB.NewSelect().Model(&invitations).Where("tenant_id = ? AND accepted_at IS NULL", s.principal(c).Tenant.ID).Order("created_at DESC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load invitations"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": invitations, "count": len(invitations)})
}

func (s *Server) createInvitation(c *gin.Context) {
	if !s.authorize(c, "tenant.manage", nil) {
		return
	}
	var input invitationRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid invitation payload"))
		return
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if _, err := mail.ParseAddress(email); err != nil || !strings.Contains(email, "@") {
		badRequest(c, errors.New("valid invitation email is required"))
		return
	}
	role := input.Role
	if role == "" {
		role = "member"
	}
	if role != "admin" && role != "member" && role != "viewer" {
		badRequest(c, errors.New("invitation role must be admin, member, or viewer"))
		return
	}
	var existing db.User
	if err := s.Store.DB.NewSelect().Model(&existing).Where("lower(email) = ?", email).Limit(1).Scan(c.Request.Context()); err == nil {
		var count int
		count, err = s.Store.DB.NewSelect().Model((*db.Membership)(nil)).Where("tenant_id = ? AND user_id = ?", s.principal(c).Tenant.ID, existing.ID).Count(c.Request.Context())
		if err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not check existing membership"))
			return
		}
		if count > 0 {
			conflict(c, "user is already a tenant member")
			return
		}
	}
	rawToken, err := randomToken(32)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not create invitation token"))
		return
	}
	hash := sha256.Sum256([]byte(rawToken))
	now := time.Now().UTC()
	invitation := db.TenantInvitation{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: s.principal(c).Tenant.ID, Email: email, Role: role, TokenHash: hex.EncodeToString(hash[:]), ExpiresAt: now.Add(7 * 24 * time.Hour), InvitedBy: s.principal(c).User.ID}
	if _, err = s.Store.DB.NewInsert().Model(&invitation).Exec(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not save invitation"))
		return
	}
	_ = s.audit(c, "tenant_invitation.created", "tenant_invitation", invitation.ID, map[string]any{"email": email, "role": role})
	c.JSON(http.StatusCreated, gin.H{"invitation": invitation, "token": rawToken, "acceptUrl": s.Config.FrontendURL + "/invite/" + rawToken})
}

func (s *Server) acceptInvitation(c *gin.Context) {
	if !s.authorize(c, "tenant.read", nil) {
		return
	}
	rawToken := c.Param("token")
	hash := sha256.Sum256([]byte(rawToken))
	var invitation db.TenantInvitation
	if err := s.Store.DB.NewSelect().Model(&invitation).Where("token_hash = ? AND expires_at > now() AND accepted_at IS NULL", hex.EncodeToString(hash[:])).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	if !strings.EqualFold(invitation.Email, s.principal(c).User.Email) {
		forbidden(c)
		return
	}
	var membership db.Membership
	if err := s.Store.DB.NewSelect().Model(&membership).Where("tenant_id = ? AND user_id = ?", invitation.TenantID, s.principal(c).User.ID).Scan(c.Request.Context()); err == nil {
		c.JSON(http.StatusOK, gin.H{"membership": membership})
		return
	}
	now := time.Now().UTC()
	membership = db.Membership{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: invitation.TenantID, UserID: s.principal(c).User.ID, Role: invitation.Role}
	tx, err := s.Store.DB.BeginTx(c.Request.Context(), nil)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not start invitation transaction"))
		return
	}
	defer func() { _ = tx.Rollback() }()
	if _, err = tx.NewInsert().Model(&membership).Exec(c.Request.Context()); err != nil {
		conflict(c, "invitation has already been accepted")
		return
	}
	if _, err = tx.NewUpdate().Model((*db.TenantInvitation)(nil)).Set("accepted_at = ?", now).Set("updated_at = ?", now).Where("id = ? AND accepted_at IS NULL", invitation.ID).Exec(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not accept invitation"))
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not commit invitation"))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"membership": membership})
}

type projectRequest struct {
	Name         string `json:"name"`
	Key          string `json:"key"`
	Description  string `json:"description"`
	StartDate    string `json:"startDate"`
	TargetDate   string `json:"targetDate"`
	ConnectionID string `json:"connectionId"`
}

func (s *Server) listProjects(c *gin.Context) {
	if !s.authorize(c, "project.read", nil) {
		return
	}
	projects := make([]db.Project, 0)
	if err := s.Store.DB.NewSelect().Model(&projects).Where("tenant_id = ?", s.principal(c).Tenant.ID).Order("updated_at DESC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load projects"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": projects, "count": len(projects)})
}

func (s *Server) createProject(c *gin.Context) {
	if !s.authorize(c, "project.create", nil) {
		return
	}
	var input projectRequest
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Name) == "" {
		badRequest(c, errors.New("project name is required"))
		return
	}
	key := strings.ToUpper(strings.TrimSpace(input.Key))
	if key == "" {
		key = projectKey(input.Name)
	}
	if !validProjectKey(key) {
		badRequest(c, errors.New("project key must contain 1-12 letters, numbers, or hyphens"))
		return
	}
	keyInUse, err := s.Store.DB.NewSelect().Model((*db.Project)(nil)).Where("tenant_id = ? AND lower(key) = lower(?)", s.principal(c).Tenant.ID, key).Count(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not validate project key"))
		return
	}
	if keyInUse > 0 {
		conflict(c, "project key is already in use in this workspace")
		return
	}
	startDate, err := parseDate(input.StartDate)
	if err != nil {
		badRequest(c, err)
		return
	}
	targetDate, err := parseDate(input.TargetDate)
	if err != nil {
		badRequest(c, err)
		return
	}
	connectionID, err := optionalUUID(input.ConnectionID)
	if err != nil {
		badRequest(c, errors.New("invalid connection id"))
		return
	}
	if connectionID != nil {
		if _, err = s.gitConnection(c, *connectionID); err != nil {
			notFound(c)
			return
		}
	}
	now := time.Now().UTC()
	project := db.Project{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: s.principal(c).Tenant.ID, Name: strings.TrimSpace(input.Name), Key: key, Description: strings.TrimSpace(input.Description), CreatedBy: s.principal(c).User.ID, ConnectionID: connectionID, Version: 1}
	project.StartDate = startDate
	project.TargetDate = targetDate
	tx, err := s.Store.DB.BeginTx(c.Request.Context(), nil)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not start project transaction"))
		return
	}
	defer func() { _ = tx.Rollback() }()
	if _, err = tx.NewInsert().Model(&project).Exec(c.Request.Context()); err != nil {
		conflict(c, "project key is already in use in this workspace")
		return
	}
	for position, status := range []struct{ name, category, color string }{{"Backlog", "backlog", "#94a3b8"}, {"Todo", "todo", "#60a5fa"}, {"In Progress", "in_progress", "#a78bfa"}, {"Blocked", "blocked", "#f59e0b"}, {"Done", "done", "#34d399"}} {
		item := &db.ProjectStatus{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, ProjectID: project.ID, Name: status.name, Category: status.category, Position: position, Color: status.color}
		if _, err = tx.NewInsert().Model(item).Exec(c.Request.Context()); err != nil {
			badRequest(c, errors.New("could not create project workflow"))
			return
		}
	}
	if err = tx.Commit(); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not commit project"))
		return
	}
	_ = s.audit(c, "project.created", "project", project.ID, nil)
	c.JSON(http.StatusCreated, project)
}

func (s *Server) getProject(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "project.read", &projectID) {
		return
	}
	project, err := s.project(c, projectID)
	if err != nil {
		notFound(c)
		return
	}
	statuses := make([]db.ProjectStatus, 0)
	if err = s.Store.DB.NewSelect().Model(&statuses).Where("project_id = ?", projectID).Order("position ASC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load workflow"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"project": project, "statuses": statuses})
}

func (s *Server) updateProject(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "project.update", &projectID) {
		return
	}
	var input struct {
		Name         *string         `json:"name"`
		Description  *string         `json:"description"`
		TargetDate   *string         `json:"targetDate"`
		ConnectionID json.RawMessage `json:"connectionId"`
		Version      int64           `json:"version"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid project payload"))
		return
	}
	updates := make(map[string]any)
	if input.Name != nil {
		updates["name"] = strings.TrimSpace(*input.Name)
	}
	if input.Description != nil {
		updates["description"] = strings.TrimSpace(*input.Description)
	}
	if input.TargetDate != nil {
		parsed, parseErr := parseDate(*input.TargetDate)
		if parseErr != nil {
			badRequest(c, parseErr)
			return
		}
		updates["target_date"] = parsed
	}
	if input.ConnectionID != nil {
		var connectionValue string
		if strings.TrimSpace(string(input.ConnectionID)) != "null" {
			if err := json.Unmarshal(input.ConnectionID, &connectionValue); err != nil {
				badRequest(c, errors.New("invalid connection id"))
				return
			}
		}
		connectionID, parseErr := optionalUUID(connectionValue)
		if parseErr != nil {
			badRequest(c, errors.New("invalid connection id"))
			return
		}
		if connectionID != nil {
			if _, parseErr = s.gitConnection(c, *connectionID); parseErr != nil {
				notFound(c)
				return
			}
		}
		var attached int
		if connectionID == nil {
			attached, parseErr = s.Store.DB.NewSelect().Model((*db.ProjectRepository)(nil)).Where("project_id = ?", projectID).Count(c.Request.Context())
		} else {
			attached, parseErr = s.Store.DB.NewSelect().Model((*db.ProjectRepository)(nil)).Join("JOIN git_repositories AS gr ON gr.id = pr.repository_id").Where("pr.project_id = ? AND gr.connection_id <> ?", projectID, *connectionID).Count(c.Request.Context())
		}
		if parseErr != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not validate project connection"))
			return
		}
		if attached > 0 {
			badRequest(c, errors.New("project connection must match all attached repositories"))
			return
		}
		updates["connection_id"] = connectionID
	}
	if len(updates) == 0 {
		badRequest(c, errors.New("no project changes supplied"))
		return
	}
	updates["updated_at"] = time.Now().UTC()
	updates["version"] = bun.Safe("version + 1")
	query := s.Store.DB.NewUpdate().Model((*db.Project)(nil)).Where("id = ? AND tenant_id = ?", projectID, s.principal(c).Tenant.ID)
	if input.Version > 0 {
		query = query.Where("version = ?", input.Version)
	}
	for field, value := range updates {
		if field == "version" {
			query = query.Set("version = version + 1")
		} else {
			query = query.Set(field+" = ?", value)
		}
	}
	result, err := query.Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not update project"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		conflict(c, "project was changed by another user")
		return
	}
	project, err := s.project(c, projectID)
	if err != nil {
		notFound(c)
		return
	}
	_ = s.audit(c, "project.updated", "project", projectID, nil)
	c.JSON(http.StatusOK, project)
}

func (s *Server) project(c *gin.Context, id uuid.UUID) (db.Project, error) {
	var project db.Project
	err := s.Store.DB.NewSelect().Model(&project).Where("id = ? AND tenant_id = ?", id, s.principal(c).Tenant.ID).Scan(c.Request.Context())
	return project, err
}

func (s *Server) gitConnection(c *gin.Context, id uuid.UUID) (db.GitConnection, error) {
	var connection db.GitConnection
	err := s.Store.DB.NewSelect().Model(&connection).Where("id = ? AND tenant_id = ? AND active = true", id, s.principal(c).Tenant.ID).Scan(c.Request.Context())
	return connection, err
}

func projectKey(name string) string {
	parts := strings.Fields(name)
	if len(parts) == 0 {
		return "PROJECT"
	}
	var b strings.Builder
	for _, part := range parts {
		b.WriteString(strings.ToUpper(part[:1]))
	}
	key := b.String()
	if len(key) > 8 {
		key = key[:8]
	}
	return key
}

func parseDate(value string) (*time.Time, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return nil, errors.New("date must use YYYY-MM-DD format")
	}
	return &parsed, nil
}

func validProjectKey(value string) bool {
	if len(value) < 1 || len(value) > 12 {
		return false
	}
	for _, char := range value {
		if (char < 'A' || char > 'Z') && (char < '0' || char > '9') && char != '-' {
			return false
		}
	}
	return true
}

func pathUUID(c *gin.Context, name string) (uuid.UUID, bool) {
	parsed, err := uuid.Parse(c.Param(name))
	if err != nil {
		badRequest(c, fmt.Errorf("invalid %s", name))
		return uuid.Nil, false
	}
	return parsed, true
}

type statusRequest struct {
	Name     string `json:"name"`
	Category string `json:"category"`
	Color    string `json:"color"`
	Position *int   `json:"position"`
}

func (s *Server) listStatuses(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "project.read", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	statuses := make([]db.ProjectStatus, 0)
	if err := s.Store.DB.NewSelect().Model(&statuses).Where("project_id = ?", projectID).Order("position ASC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load statuses"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": statuses})
}

func (s *Server) createStatus(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "workflow.manage", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	var input statusRequest
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Name) == "" {
		badRequest(c, errors.New("status name is required"))
		return
	}
	if !validStatusCategory(input.Category) {
		badRequest(c, errors.New("invalid status category"))
		return
	}
	project, err := s.project(c, projectID)
	if err != nil {
		notFound(c)
		return
	}
	var last db.ProjectStatus
	_ = s.Store.DB.NewSelect().Model(&last).Where("project_id = ?", projectID).Order("position DESC").Limit(1).Scan(c.Request.Context())
	position := last.Position + 1
	if input.Position != nil {
		position = *input.Position
	}
	now := time.Now().UTC()
	status := db.ProjectStatus{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, ProjectID: project.ID, Name: strings.TrimSpace(input.Name), Category: input.Category, Color: input.Color, Position: position}
	if _, err = s.Store.DB.NewInsert().Model(&status).Exec(c.Request.Context()); err != nil {
		badRequest(c, errors.New("could not create status"))
		return
	}
	_ = s.audit(c, "status.created", "project_status", status.ID, nil)
	c.JSON(http.StatusCreated, status)
}

func (s *Server) updateStatus(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	statusID, ok := pathUUID(c, "statusId")
	if !ok {
		return
	}
	if !s.authorize(c, "workflow.manage", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	var input statusRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid status payload"))
		return
	}
	updates := map[string]any{}
	if input.Name != "" {
		updates["name"] = strings.TrimSpace(input.Name)
	}
	if input.Category != "" {
		if !validStatusCategory(input.Category) {
			badRequest(c, errors.New("invalid status category"))
			return
		}
		updates["category"] = input.Category
	}
	if input.Color != "" {
		updates["color"] = input.Color
	}
	if input.Position != nil {
		updates["position"] = *input.Position
	}
	if len(updates) == 0 {
		badRequest(c, errors.New("no status changes supplied"))
		return
	}
	for field, value := range updates {
		result, updateErr := s.Store.DB.NewUpdate().Model((*db.ProjectStatus)(nil)).Set(field+" = ?", value).Set("updated_at = ?", time.Now().UTC()).Where("id = ? AND project_id = ?", statusID, projectID).Exec(c.Request.Context())
		if updateErr != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not update status"))
			return
		}
		if count, _ := result.RowsAffected(); count == 0 {
			notFound(c)
			return
		}
	}
	var status db.ProjectStatus
	if err := s.Store.DB.NewSelect().Model(&status).Where("id = ? AND project_id = ?", statusID, projectID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	c.JSON(http.StatusOK, status)
}

func validStatusCategory(value string) bool {
	switch value {
	case "backlog", "todo", "in_progress", "blocked", "done":
		return true
	default:
		return false
	}
}

type taskResponse struct {
	db.Task
	StatusName     string     `json:"statusName"`
	StatusCategory string     `json:"statusCategory"`
	AssigneeName   string     `json:"assigneeName,omitempty"`
	Labels         []db.Label `json:"labels,omitempty"`
}

type taskRequest struct {
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	StatusID     string   `json:"statusId"`
	ParentID     string   `json:"parentId"`
	MilestoneID  string   `json:"milestoneId"`
	Priority     string   `json:"priority"`
	StartDate    string   `json:"startDate"`
	DueDate      string   `json:"dueDate"`
	EstimateMins *int     `json:"estimateMinutes"`
	AssigneeID   string   `json:"assigneeId"`
	LabelIDs     []string `json:"labelIds"`
	Visibility   string   `json:"visibility"`
	Position     *int     `json:"position"`
}

func (s *Server) listTasks(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "task.read", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	tasks := make([]db.Task, 0)
	query := s.Store.DB.NewSelect().Model(&tasks).Where("project_id = ?", projectID).Order("position ASC", "created_at ASC")
	if value := strings.TrimSpace(c.Query("q")); value != "" {
		query = query.Where("title ILIKE ?", "%"+value+"%")
	}
	if value := c.Query("statusId"); value != "" {
		query = query.Where("status_id = ?", value)
	}
	if value := c.Query("milestoneId"); value != "" {
		query = query.Where("milestone_id = ?", value)
	}
	if value := c.Query("visibility"); value != "" {
		query = query.Where("visibility = ?", value)
	}
	if err := query.Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load tasks"))
		return
	}
	responses, err := s.taskResponses(c, tasks)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load task metadata"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": responses, "count": len(responses)})
}

func (s *Server) taskResponses(c *gin.Context, tasks []db.Task) ([]taskResponse, error) {
	if len(tasks) == 0 {
		return []taskResponse{}, nil
	}
	ids := make([]uuid.UUID, 0, len(tasks))
	assigneeIDs := make([]uuid.UUID, 0)
	for _, task := range tasks {
		ids = append(ids, task.StatusID)
		if task.AssigneeID != nil {
			assigneeIDs = append(assigneeIDs, *task.AssigneeID)
		}
	}
	statuses := make([]db.ProjectStatus, 0)
	if err := s.Store.DB.NewSelect().Model(&statuses).Where("id IN (?)", bun.In(ids)).Scan(c.Request.Context()); err != nil {
		return nil, err
	}
	statusMap := make(map[uuid.UUID]db.ProjectStatus, len(statuses))
	for _, item := range statuses {
		statusMap[item.ID] = item
	}
	users := map[uuid.UUID]string{}
	if len(assigneeIDs) > 0 {
		var assignees []db.User
		if err := s.Store.DB.NewSelect().Model(&assignees).Column("u.id", "u.name").Join("JOIN memberships AS m ON m.user_id = u.id").Where("u.id IN (?) AND m.tenant_id = ?", bun.In(assigneeIDs), s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
			return nil, err
		}
		for _, user := range assignees {
			users[user.ID] = user.Name
		}
	}
	var taskLabels []db.TaskLabel
	if err := s.Store.DB.NewSelect().Model(&taskLabels).Where("task_id IN (?)", bun.In(taskIDs(tasks))).Scan(c.Request.Context()); err != nil {
		return nil, err
	}
	labelIDs := make([]uuid.UUID, 0, len(taskLabels))
	for _, taskLabel := range taskLabels {
		labelIDs = append(labelIDs, taskLabel.LabelID)
	}
	labelsByID := make(map[uuid.UUID]db.Label)
	if len(labelIDs) > 0 {
		labels := make([]db.Label, 0)
		if err := s.Store.DB.NewSelect().Model(&labels).Where("id IN (?) AND tenant_id = ?", bun.In(labelIDs), s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
			return nil, err
		}
		for _, label := range labels {
			labelsByID[label.ID] = label
		}
	}
	labelsByTask := make(map[uuid.UUID][]db.Label)
	for _, taskLabel := range taskLabels {
		if label, ok := labelsByID[taskLabel.LabelID]; ok {
			labelsByTask[taskLabel.TaskID] = append(labelsByTask[taskLabel.TaskID], label)
		}
	}
	responses := make([]taskResponse, 0, len(tasks))
	for _, task := range tasks {
		status := statusMap[task.StatusID]
		response := taskResponse{Task: task, StatusName: status.Name, StatusCategory: status.Category, Labels: labelsByTask[task.ID]}
		if task.AssigneeID != nil {
			response.AssigneeName = users[*task.AssigneeID]
		}
		responses = append(responses, response)
	}
	return responses, nil
}

func taskIDs(tasks []db.Task) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(tasks))
	for _, task := range tasks {
		ids = append(ids, task.ID)
	}
	return ids
}

func (s *Server) validateLabelIDs(c *gin.Context, projectID uuid.UUID, rawIDs []string) ([]uuid.UUID, error) {
	ids, err := parseUUIDList(rawIDs)
	if err != nil {
		return nil, errors.New("invalid label id")
	}
	if len(ids) == 0 {
		return ids, nil
	}
	count, err := s.Store.DB.NewSelect().Model((*db.Label)(nil)).Where("id IN (?) AND tenant_id = ? AND (project_id IS NULL OR project_id = ?)", bun.In(ids), s.principal(c).Tenant.ID, projectID).Count(c.Request.Context())
	if err != nil || count != len(ids) {
		return nil, errors.New("one or more labels do not belong to the project")
	}
	return ids, nil
}

func (s *Server) validateAssignee(c *gin.Context, userID *uuid.UUID) error {
	if userID == nil {
		return nil
	}
	count, err := s.Store.DB.NewSelect().Model((*db.Membership)(nil)).Where("tenant_id = ? AND user_id = ?", s.principal(c).Tenant.ID, *userID).Count(c.Request.Context())
	if err != nil || count != 1 {
		return errors.New("assignee is not a member of the tenant")
	}
	return nil
}

func (s *Server) replaceTaskLabels(c *gin.Context, taskID uuid.UUID, labelIDs []uuid.UUID) error {
	if _, err := s.Store.DB.NewDelete().Model((*db.TaskLabel)(nil)).Where("task_id = ?", taskID).Exec(c.Request.Context()); err != nil {
		return err
	}
	if len(labelIDs) == 0 {
		return nil
	}
	now := time.Now().UTC()
	rows := make([]db.TaskLabel, 0, len(labelIDs))
	for _, labelID := range labelIDs {
		rows = append(rows, db.TaskLabel{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TaskID: taskID, LabelID: labelID})
	}
	_, err := s.Store.DB.NewInsert().Model(&rows).Exec(c.Request.Context())
	return err
}

func (s *Server) createTask(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "task.create", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	var input taskRequest
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Title) == "" {
		badRequest(c, errors.New("task title is required"))
		return
	}
	statusID, err := s.resolveStatusID(c, projectID, input.StatusID)
	if err != nil {
		badRequest(c, err)
		return
	}
	parentID, err := optionalUUID(input.ParentID)
	if err != nil {
		badRequest(c, errors.New("invalid parent id"))
		return
	}
	if parentID != nil {
		if err = s.validateParent(c, projectID, uuid.Nil, parentID); err != nil {
			badRequest(c, err)
			return
		}
	}
	milestoneID, err := optionalUUID(input.MilestoneID)
	if err != nil {
		badRequest(c, errors.New("invalid milestone id"))
		return
	}
	if milestoneID != nil {
		var count int
		count, err = s.Store.DB.NewSelect().Model((*db.Milestone)(nil)).Where("id = ? AND project_id = ?", *milestoneID, projectID).Count(c.Request.Context())
		if err != nil || count != 1 {
			badRequest(c, errors.New("milestone does not belong to project"))
			return
		}
	}
	assigneeID, err := optionalUUID(input.AssigneeID)
	if err != nil {
		badRequest(c, errors.New("invalid assignee id"))
		return
	}
	if err = s.validateAssignee(c, assigneeID); err != nil {
		badRequest(c, err)
		return
	}
	labelIDs, err := s.validateLabelIDs(c, projectID, input.LabelIDs)
	if err != nil {
		badRequest(c, err)
		return
	}
	priority := input.Priority
	if priority == "" {
		priority = "medium"
	}
	if !validPriority(priority) {
		badRequest(c, errors.New("invalid task priority"))
		return
	}
	visibility := input.Visibility
	if visibility == "" {
		visibility = "internal"
	}
	if visibility != "internal" && visibility != "customer" {
		badRequest(c, errors.New("invalid task visibility"))
		return
	}
	startDate, err := parseDate(input.StartDate)
	if err != nil {
		badRequest(c, err)
		return
	}
	dueDate, err := parseDate(input.DueDate)
	if err != nil {
		badRequest(c, err)
		return
	}
	now := time.Now().UTC()
	task := db.Task{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: s.principal(c).Tenant.ID, ProjectID: projectID, ParentID: parentID, MilestoneID: milestoneID, StatusID: statusID, Title: strings.TrimSpace(input.Title), Description: strings.TrimSpace(input.Description), Priority: priority, StartDate: startDate, DueDate: dueDate, EstimateMins: input.EstimateMins, AssigneeID: assigneeID, Visibility: visibility, Version: 1}
	if input.Position != nil {
		task.Position = *input.Position
	}
	if _, err = s.Store.DB.NewInsert().Model(&task).Exec(c.Request.Context()); err != nil {
		badRequest(c, errors.New("could not create task"))
		return
	}
	if err = s.replaceTaskLabels(c, task.ID, labelIDs); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not save task labels"))
		return
	}
	_ = s.audit(c, "task.created", "task", task.ID, nil)
	response, err := s.taskResponse(c, task)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load task"))
		return
	}
	c.JSON(http.StatusCreated, response)
}

func (s *Server) updateTask(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	taskID, ok := pathUUID(c, "taskId")
	if !ok {
		return
	}
	if !s.authorize(c, "task.update", &projectID) {
		return
	}
	task, err := s.task(c, projectID, taskID)
	if err != nil {
		notFound(c)
		return
	}
	var input struct {
		Title        *string   `json:"title"`
		Description  *string   `json:"description"`
		StatusID     *string   `json:"statusId"`
		ParentID     *string   `json:"parentId"`
		MilestoneID  *string   `json:"milestoneId"`
		Priority     *string   `json:"priority"`
		StartDate    *string   `json:"startDate"`
		DueDate      *string   `json:"dueDate"`
		EstimateMins *int      `json:"estimateMinutes"`
		AssigneeID   *string   `json:"assigneeId"`
		LabelIDs     *[]string `json:"labelIds"`
		Visibility   *string   `json:"visibility"`
		Position     *int      `json:"position"`
		Version      int64     `json:"version"`
	}
	if err = c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid task payload"))
		return
	}
	updates := map[string]any{}
	if input.Title != nil {
		if strings.TrimSpace(*input.Title) == "" {
			badRequest(c, errors.New("task title cannot be empty"))
			return
		}
		updates["title"] = strings.TrimSpace(*input.Title)
	}
	if input.Description != nil {
		updates["description"] = strings.TrimSpace(*input.Description)
	}
	if input.StatusID != nil {
		statusID, statusErr := s.resolveStatusID(c, projectID, *input.StatusID)
		if statusErr != nil {
			badRequest(c, statusErr)
			return
		}
		updates["status_id"] = statusID
	}
	if input.ParentID != nil {
		parentID, parentErr := optionalUUID(*input.ParentID)
		if parentErr != nil {
			badRequest(c, errors.New("invalid parent id"))
			return
		}
		if parentID != nil {
			if parentErr = s.validateParent(c, projectID, taskID, parentID); parentErr != nil {
				badRequest(c, parentErr)
				return
			}
		}
		updates["parent_id"] = parentID
	}
	if input.MilestoneID != nil {
		milestoneID, milestoneErr := optionalUUID(*input.MilestoneID)
		if milestoneErr != nil {
			badRequest(c, errors.New("invalid milestone id"))
			return
		}
		if milestoneID != nil {
			count, countErr := s.Store.DB.NewSelect().Model((*db.Milestone)(nil)).Where("id = ? AND project_id = ?", *milestoneID, projectID).Count(c.Request.Context())
			if countErr != nil || count != 1 {
				badRequest(c, errors.New("milestone does not belong to project"))
				return
			}
		}
		updates["milestone_id"] = milestoneID
	}
	if input.Priority != nil {
		if !validPriority(*input.Priority) {
			badRequest(c, errors.New("invalid task priority"))
			return
		}
		updates["priority"] = *input.Priority
	}
	if input.StartDate != nil {
		parsed, parseErr := parseDate(*input.StartDate)
		if parseErr != nil {
			badRequest(c, parseErr)
			return
		}
		updates["start_date"] = parsed
	}
	if input.DueDate != nil {
		parsed, parseErr := parseDate(*input.DueDate)
		if parseErr != nil {
			badRequest(c, parseErr)
			return
		}
		updates["due_date"] = parsed
	}
	if input.EstimateMins != nil {
		if *input.EstimateMins < 0 {
			badRequest(c, errors.New("estimate cannot be negative"))
			return
		}
		updates["estimate_minutes"] = *input.EstimateMins
	}
	if input.AssigneeID != nil {
		assigneeID, assigneeErr := optionalUUID(*input.AssigneeID)
		if assigneeErr != nil {
			badRequest(c, errors.New("invalid assignee id"))
			return
		}
		if assigneeErr = s.validateAssignee(c, assigneeID); assigneeErr != nil {
			badRequest(c, assigneeErr)
			return
		}
		updates["assignee_id"] = assigneeID
	}
	if input.Visibility != nil {
		if *input.Visibility != "internal" && *input.Visibility != "customer" {
			badRequest(c, errors.New("invalid task visibility"))
			return
		}
		updates["visibility"] = *input.Visibility
	}
	if input.Position != nil {
		updates["position"] = *input.Position
	}
	var labelIDs []uuid.UUID
	if input.LabelIDs != nil {
		labelIDs, err = s.validateLabelIDs(c, projectID, *input.LabelIDs)
		if err != nil {
			badRequest(c, err)
			return
		}
	}
	if len(updates) == 0 {
		if input.LabelIDs == nil {
			badRequest(c, errors.New("no task changes supplied"))
			return
		}
	}
	version := input.Version
	if version == 0 {
		version = task.Version
	}
	query := s.Store.DB.NewUpdate().Model((*db.Task)(nil)).Where("id = ? AND project_id = ? AND tenant_id = ? AND version = ?", taskID, projectID, s.principal(c).Tenant.ID, version).Set("updated_at = ?", time.Now().UTC()).Set("version = version + 1")
	for field, value := range updates {
		query = query.Set(field+" = ?", value)
	}
	result, err := query.Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not update task"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		conflict(c, "task was changed by another user")
		return
	}
	if input.LabelIDs != nil {
		if err = s.replaceTaskLabels(c, taskID, labelIDs); err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not save task labels"))
			return
		}
	}
	updated, err := s.task(c, projectID, taskID)
	if err != nil {
		notFound(c)
		return
	}
	_ = s.audit(c, "task.updated", "task", taskID, nil)
	if err := s.Queue.Enqueue(c.Request.Context(), "git.issue.update", map[string]any{"tenantId": s.principal(c).Tenant.ID.String(), "taskId": taskID.String()}); err != nil {
		slog.Default().Warn("queue git issue update", "task_id", taskID, "error", err)
	}
	response, err := s.taskResponse(c, updated)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load task"))
		return
	}
	c.JSON(http.StatusOK, response)
}

func (s *Server) resolveStatusID(c *gin.Context, projectID uuid.UUID, raw string) (uuid.UUID, error) {
	if raw != "" {
		parsed, err := uuid.Parse(raw)
		if err != nil {
			return uuid.Nil, errors.New("invalid status id")
		}
		var status db.ProjectStatus
		if err = s.Store.DB.NewSelect().Model(&status).Where("id = ? AND project_id = ?", parsed, projectID).Scan(c.Request.Context()); err != nil {
			return uuid.Nil, errors.New("status does not belong to project")
		}
		return parsed, nil
	}
	var status db.ProjectStatus
	if err := s.Store.DB.NewSelect().Model(&status).Where("project_id = ?", projectID).Order("position ASC").Limit(1).Scan(c.Request.Context()); err != nil {
		return uuid.Nil, errors.New("project has no statuses")
	}
	return status.ID, nil
}

func (s *Server) validateParent(c *gin.Context, projectID, taskID uuid.UUID, parentID *uuid.UUID) error {
	if parentID == nil {
		return nil
	}
	if taskID != uuid.Nil && *parentID == taskID {
		return errors.New("task cannot be its own parent")
	}
	seen := map[uuid.UUID]bool{}
	current := *parentID
	for depth := 0; depth < 100; depth++ {
		if seen[current] {
			return errors.New("task hierarchy contains a cycle")
		}
		seen[current] = true
		if taskID != uuid.Nil && current == taskID {
			return errors.New("task hierarchy contains a cycle")
		}
		var parent db.Task
		if err := s.Store.DB.NewSelect().Model(&parent).Column("id", "parent_id").Where("id = ? AND project_id = ?", current, projectID).Scan(c.Request.Context()); err != nil {
			return errors.New("parent task does not belong to project")
		}
		if parent.ParentID == nil {
			return nil
		}
		current = *parent.ParentID
	}
	return errors.New("task hierarchy is too deep")
}

func (s *Server) task(c *gin.Context, projectID, taskID uuid.UUID) (db.Task, error) {
	var task db.Task
	err := s.Store.DB.NewSelect().Model(&task).Where("id = ? AND project_id = ? AND tenant_id = ?", taskID, projectID, s.principal(c).Tenant.ID).Scan(c.Request.Context())
	return task, err
}
func (s *Server) taskResponse(c *gin.Context, task db.Task) (taskResponse, error) {
	responses, err := s.taskResponses(c, []db.Task{task})
	if err != nil || len(responses) == 0 {
		return taskResponse{}, err
	}
	return responses[0], nil
}
func optionalUUID(value string) (*uuid.UUID, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	parsed, err := uuid.Parse(value)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}
func validPriority(value string) bool {
	switch value {
	case "low", "medium", "high", "urgent":
		return true
	default:
		return false
	}
}

type milestoneRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	StartDate   string `json:"startDate"`
	DueDate     string `json:"dueDate"`
	Status      string `json:"status"`
	Visibility  string `json:"visibility"`
}

func (s *Server) listMilestones(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "milestone.read", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	milestones := make([]db.Milestone, 0)
	if err := s.Store.DB.NewSelect().Model(&milestones).Where("project_id = ? AND tenant_id = ?", projectID, s.principal(c).Tenant.ID).Order("due_date ASC NULLS LAST", "created_at ASC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load milestones"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": milestones, "count": len(milestones)})
}

func (s *Server) createMilestone(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "milestone.create", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	var input milestoneRequest
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Name) == "" {
		badRequest(c, errors.New("milestone name is required"))
		return
	}
	status := input.Status
	if status == "" {
		status = "open"
	}
	if status != "open" && status != "closed" {
		badRequest(c, errors.New("invalid milestone status"))
		return
	}
	visibility := input.Visibility
	if visibility == "" {
		visibility = "internal"
	}
	if visibility != "internal" && visibility != "customer" {
		badRequest(c, errors.New("invalid milestone visibility"))
		return
	}
	startDate, err := parseDate(input.StartDate)
	if err != nil {
		badRequest(c, err)
		return
	}
	dueDate, err := parseDate(input.DueDate)
	if err != nil {
		badRequest(c, err)
		return
	}
	now := time.Now().UTC()
	milestone := db.Milestone{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: s.principal(c).Tenant.ID, ProjectID: projectID, Name: strings.TrimSpace(input.Name), Description: strings.TrimSpace(input.Description), StartDate: startDate, DueDate: dueDate, Status: status, Visibility: visibility, Version: 1}
	if _, err := s.Store.DB.NewInsert().Model(&milestone).Exec(c.Request.Context()); err != nil {
		badRequest(c, errors.New("could not create milestone"))
		return
	}
	_ = s.audit(c, "milestone.created", "milestone", milestone.ID, nil)
	c.JSON(http.StatusCreated, milestone)
}

func (s *Server) updateMilestone(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	milestoneID, ok := pathUUID(c, "milestoneId")
	if !ok {
		return
	}
	if !s.authorize(c, "milestone.update", &projectID) {
		return
	}
	var milestone db.Milestone
	if err := s.Store.DB.NewSelect().Model(&milestone).Where("id = ? AND project_id = ? AND tenant_id = ?", milestoneID, projectID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	var input struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		StartDate   *string `json:"startDate"`
		DueDate     *string `json:"dueDate"`
		Status      *string `json:"status"`
		Visibility  *string `json:"visibility"`
		Version     int64   `json:"version"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid milestone payload"))
		return
	}
	updates := map[string]any{}
	if input.Name != nil {
		if strings.TrimSpace(*input.Name) == "" {
			badRequest(c, errors.New("milestone name cannot be empty"))
			return
		}
		updates["name"] = strings.TrimSpace(*input.Name)
	}
	if input.Description != nil {
		updates["description"] = strings.TrimSpace(*input.Description)
	}
	if input.StartDate != nil {
		parsed, parseErr := parseDate(*input.StartDate)
		if parseErr != nil {
			badRequest(c, parseErr)
			return
		}
		updates["start_date"] = parsed
	}
	if input.DueDate != nil {
		parsed, parseErr := parseDate(*input.DueDate)
		if parseErr != nil {
			badRequest(c, parseErr)
			return
		}
		updates["due_date"] = parsed
	}
	if input.Status != nil {
		if *input.Status != "open" && *input.Status != "closed" {
			badRequest(c, errors.New("invalid milestone status"))
			return
		}
		updates["status"] = *input.Status
	}
	if input.Visibility != nil {
		if *input.Visibility != "internal" && *input.Visibility != "customer" {
			badRequest(c, errors.New("invalid milestone visibility"))
			return
		}
		updates["visibility"] = *input.Visibility
	}
	if len(updates) == 0 {
		badRequest(c, errors.New("no milestone changes supplied"))
		return
	}
	version := input.Version
	if version == 0 {
		version = milestone.Version
	}
	query := s.Store.DB.NewUpdate().Model((*db.Milestone)(nil)).Where("id = ? AND project_id = ? AND tenant_id = ? AND version = ?", milestoneID, projectID, s.principal(c).Tenant.ID, version).Set("updated_at = ?", time.Now().UTC()).Set("version = version + 1")
	for field, value := range updates {
		query = query.Set(field+" = ?", value)
	}
	result, err := query.Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not update milestone"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		conflict(c, "milestone was changed by another user")
		return
	}
	if err = s.Store.DB.NewSelect().Model(&milestone).Where("id = ? AND project_id = ? AND tenant_id = ?", milestoneID, projectID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	_ = s.audit(c, "milestone.updated", "milestone", milestoneID, nil)
	if err := s.Queue.Enqueue(c.Request.Context(), "git.milestone.update", map[string]any{"tenantId": s.principal(c).Tenant.ID.String(), "milestoneId": milestoneID.String()}); err != nil {
		slog.Default().Warn("queue git milestone update", "milestone_id", milestoneID, "error", err)
	}
	c.JSON(http.StatusOK, milestone)
}

type labelRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

func (s *Server) listLabels(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "label.read", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	labels := make([]db.Label, 0)
	if err := s.Store.DB.NewSelect().Model(&labels).Where("tenant_id = ? AND (project_id IS NULL OR project_id = ?)", s.principal(c).Tenant.ID, projectID).Order("position ASC", "name ASC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load labels"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": labels})
}

func (s *Server) createLabel(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "label.manage", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	var input labelRequest
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Name) == "" {
		badRequest(c, errors.New("label name is required"))
		return
	}
	color := input.Color
	if color == "" {
		color = "#64748b"
	}
	now := time.Now().UTC()
	label := db.Label{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: s.principal(c).Tenant.ID, ProjectID: &projectID, Name: strings.TrimSpace(input.Name), Color: color}
	if _, err := s.Store.DB.NewInsert().Model(&label).Exec(c.Request.Context()); err != nil {
		badRequest(c, errors.New("could not create label"))
		return
	}
	c.JSON(http.StatusCreated, label)
}

type publicPageRequest struct {
	AccessMode          string   `json:"accessMode"`
	Title               string   `json:"title"`
	Slug                string   `json:"slug"`
	VisibleTaskIDs      []string `json:"visibleTaskIds"`
	VisibleMilestoneIDs []string `json:"visibleMilestoneIds"`
	ViewerUserIDs       []string `json:"viewerUserIds"`
}

type publicTask struct {
	ID             uuid.UUID  `json:"id"`
	ParentID       *uuid.UUID `json:"parentId,omitempty"`
	MilestoneID    *uuid.UUID `json:"milestoneId,omitempty"`
	Title          string     `json:"title"`
	Description    string     `json:"description,omitempty"`
	Priority       string     `json:"priority"`
	StartDate      *time.Time `json:"startDate,omitempty"`
	DueDate        *time.Time `json:"dueDate,omitempty"`
	StatusName     string     `json:"statusName"`
	StatusCategory string     `json:"statusCategory"`
	EstimateMins   *int       `json:"estimateMinutes,omitempty"`
}
type publicMilestone struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	StartDate   *time.Time `json:"startDate,omitempty"`
	DueDate     *time.Time `json:"dueDate,omitempty"`
	Status      string     `json:"status"`
}

func (s *Server) listPublicPages(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "public_page.read", &projectID) {
		return
	}
	pages := make([]db.PublicPage, 0)
	if err := s.Store.DB.NewSelect().Model(&pages).Where("tenant_id = ? AND project_id = ?", s.principal(c).Tenant.ID, projectID).Order("created_at DESC").Scan(c.Request.Context()); err != nil {
		slog.Default().Error("list public pages failed", "project_id", projectID, "error", err)
		writeError(c, http.StatusInternalServerError, errors.New("could not load public pages"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": pages})
}

func (s *Server) createPublicPage(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "public_page.manage", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	var input publicPageRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid public page payload"))
		return
	}
	accessMode := input.AccessMode
	if accessMode == "" {
		accessMode = "link"
	}
	if accessMode != "link" && accessMode != "login" {
		badRequest(c, errors.New("invalid public page access mode"))
		return
	}
	visibleTasks, err := parseUUIDList(input.VisibleTaskIDs)
	if err != nil {
		badRequest(c, errors.New("invalid visible task id"))
		return
	}
	visibleMilestones, err := parseUUIDList(input.VisibleMilestoneIDs)
	if err != nil {
		badRequest(c, errors.New("invalid visible milestone id"))
		return
	}
	rawToken, err := randomToken(24)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not create public page token"))
		return
	}
	hash := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hash[:])
	now := time.Now().UTC()
	if len(visibleTasks) > 0 {
		count, countErr := s.Store.DB.NewSelect().Model((*db.Task)(nil)).Where("tenant_id = ? AND project_id = ? AND id IN (?)", s.principal(c).Tenant.ID, projectID, bun.In(visibleTasks)).Count(c.Request.Context())
		if countErr != nil || count != len(visibleTasks) {
			badRequest(c, errors.New("one or more visible tasks do not belong to the project"))
			return
		}
	}
	if len(visibleMilestones) > 0 {
		count, countErr := s.Store.DB.NewSelect().Model((*db.Milestone)(nil)).Where("tenant_id = ? AND project_id = ? AND id IN (?)", s.principal(c).Tenant.ID, projectID, bun.In(visibleMilestones)).Count(c.Request.Context())
		if countErr != nil || count != len(visibleMilestones) {
			badRequest(c, errors.New("one or more visible milestones do not belong to the project"))
			return
		}
	}
	viewerIDs, err := parseUUIDList(input.ViewerUserIDs)
	if err != nil {
		badRequest(c, errors.New("invalid viewer user id"))
		return
	}
	if len(viewerIDs) > 0 {
		count, countErr := s.Store.DB.NewSelect().Model((*db.User)(nil)).Where("id IN (?)", bun.In(viewerIDs)).Count(c.Request.Context())
		if countErr != nil || count != len(viewerIDs) {
			badRequest(c, errors.New("one or more viewers do not exist"))
			return
		}
	}
	pageSlug := strings.ToLower(strings.TrimSpace(input.Slug))
	if pageSlug == "" {
		pageSlug, err = randomToken(12)
		if err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not create public page slug"))
			return
		}
	} else if !publicPageSlugPattern.MatchString(pageSlug) {
		badRequest(c, errors.New("public page slug must contain 3-64 lowercase letters, numbers, or hyphens"))
		return
	}
	if input.Slug != "" {
		slugInUse, countErr := s.Store.DB.NewSelect().Model((*db.PublicPage)(nil)).Where("slug = ? AND revoked = false", pageSlug).Count(c.Request.Context())
		if countErr != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not validate public page slug"))
			return
		}
		if slugInUse > 0 {
			conflict(c, "public page slug is already in use")
			return
		}
	}
	page := db.PublicPage{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: s.principal(c).Tenant.ID, ProjectID: projectID, Slug: pageSlug, TokenHash: tokenHash, AccessMode: accessMode, Title: strings.TrimSpace(input.Title), VisibleTaskIDs: visibleTasks, VisibleMilestoneIDs: visibleMilestones}
	if _, err = s.Store.DB.NewInsert().Model(&page).Exec(c.Request.Context()); err != nil {
		if isPublicPageSlugConflict(err) {
			conflict(c, "public page slug is already in use")
			return
		}
		slog.Default().Error("create public page failed", "project_id", projectID, "page_id", page.ID, "error", err)
		writeError(c, http.StatusInternalServerError, errors.New("could not create public page"))
		return
	}
	if len(viewerIDs) > 0 {
		viewers := make([]db.PublicPageViewer, 0, len(viewerIDs))
		for _, viewerID := range viewerIDs {
			viewers = append(viewers, db.PublicPageViewer{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, PublicPageID: page.ID, UserID: viewerID})
		}
		if _, err = s.Store.DB.NewInsert().Model(&viewers).On("CONFLICT (public_page_id, user_id) DO NOTHING").Exec(c.Request.Context()); err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not save page viewers"))
			return
		}
	}
	_ = s.audit(c, "public_page.created", "public_page", page.ID, nil)
	c.JSON(http.StatusCreated, gin.H{"page": page, "token": rawToken, "url": s.Config.FrontendURL + "/p/" + pageSlug + "?token=" + rawToken})
}

func isPublicPageSlugConflict(err error) bool {
	var pgErr pgdriver.Error
	if !errors.As(err, &pgErr) || pgErr.Field('C') != "23505" {
		return false
	}
	constraint := pgErr.Field('n')
	return constraint == "public_pages_active_slug_idx" || constraint == "public_pages_slug_key" || strings.Contains(constraint, "public_pages_slug")
}

func (s *Server) revokePublicPage(c *gin.Context) {
	pageID, ok := pathUUID(c, "pageId")
	if !ok {
		return
	}
	page, ok := s.publicPageForManage(c, pageID)
	if !ok {
		return
	}
	result, err := s.Store.DB.NewUpdate().Model((*db.PublicPage)(nil)).Set("revoked = true").Set("updated_at = ?", time.Now().UTC()).Where("id = ? AND tenant_id = ?", page.ID, s.principal(c).Tenant.ID).Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not revoke public page"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		notFound(c)
		return
	}
	_ = s.audit(c, "public_page.revoked", "public_page", page.ID, nil)
	c.Status(http.StatusNoContent)
}

func (s *Server) publicPageForManage(c *gin.Context, pageID uuid.UUID) (db.PublicPage, bool) {
	var page db.PublicPage
	if err := s.Store.DB.NewSelect().Model(&page).Where("id = ? AND tenant_id = ?", pageID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return db.PublicPage{}, false
	}
	if !s.authorize(c, "public_page.manage", &page.ProjectID) {
		return db.PublicPage{}, false
	}
	return page, true
}

func (s *Server) listPublicPageViewers(c *gin.Context) {
	pageID, ok := pathUUID(c, "pageId")
	if !ok {
		return
	}
	page, ok := s.publicPageForManage(c, pageID)
	if !ok {
		return
	}
	viewers := make([]db.PublicPageViewer, 0)
	if err := s.Store.DB.NewSelect().Model(&viewers).Where("public_page_id = ?", page.ID).Order("created_at ASC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load page viewers"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": viewers, "count": len(viewers)})
}

func (s *Server) addPublicPageViewer(c *gin.Context) {
	pageID, ok := pathUUID(c, "pageId")
	if !ok {
		return
	}
	page, ok := s.publicPageForManage(c, pageID)
	if !ok {
		return
	}
	var input struct {
		UserID string `json:"userId"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid page viewer payload"))
		return
	}
	userID, err := uuid.Parse(input.UserID)
	if err != nil {
		badRequest(c, errors.New("invalid user id"))
		return
	}
	var user db.User
	if err = s.Store.DB.NewSelect().Model(&user).Where("id = ?", userID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	now := time.Now().UTC()
	viewer := db.PublicPageViewer{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, PublicPageID: page.ID, UserID: user.ID}
	if _, err = s.Store.DB.NewInsert().Model(&viewer).On("CONFLICT (public_page_id, user_id) DO UPDATE SET updated_at = now()").Exec(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not save page viewer"))
		return
	}
	_ = s.audit(c, "public_page_viewer.added", "public_page_viewer", viewer.ID, map[string]any{"userId": user.ID, "pageId": page.ID})
	c.JSON(http.StatusCreated, viewer)
}

func (s *Server) removePublicPageViewer(c *gin.Context) {
	pageID, ok := pathUUID(c, "pageId")
	if !ok {
		return
	}
	page, ok := s.publicPageForManage(c, pageID)
	if !ok {
		return
	}
	userID, ok := pathUUID(c, "userId")
	if !ok {
		return
	}
	result, err := s.Store.DB.NewDelete().Model((*db.PublicPageViewer)(nil)).Where("public_page_id = ? AND user_id = ?", page.ID, userID).Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not remove page viewer"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		notFound(c)
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) publicPage(c *gin.Context) {
	if !s.allowPublicRequest(c) {
		writeError(c, http.StatusTooManyRequests, errors.New("public page rate limit exceeded"))
		return
	}
	slug := c.Param("slug")
	var page db.PublicPage
	if err := s.Store.DB.NewSelect().Model(&page).Where("slug = ? AND revoked = false", slug).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	if page.AccessMode == "link" {
		rawToken := c.Query("token")
		hash := sha256.Sum256([]byte(rawToken))
		if rawToken == "" || subtle.ConstantTimeCompare([]byte(page.TokenHash), []byte(hex.EncodeToString(hash[:]))) != 1 {
			notFound(c)
			return
		}
	}
	if page.AccessMode == "login" {
		principal := s.optionalPrincipal(c)
		if principal == nil {
			unauthorized(c)
			return
		}
		count, err := s.Store.DB.NewSelect().Model((*db.PublicPageViewer)(nil)).Where("public_page_id = ? AND user_id = ?", page.ID, principal.User.ID).Count(c.Request.Context())
		if err != nil || count == 0 {
			forbidden(c)
			return
		}
	}
	var project db.Project
	if err := s.Store.DB.NewSelect().Model(&project).Where("id = ? AND tenant_id = ?", page.ProjectID, page.TenantID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	statuses := make([]db.ProjectStatus, 0)
	if err := s.Store.DB.NewSelect().Model(&statuses).Where("project_id = ?", project.ID).Order("position ASC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load public workflow"))
		return
	}
	statusMap := make(map[uuid.UUID]db.ProjectStatus, len(statuses))
	for _, status := range statuses {
		statusMap[status.ID] = status
	}
	tasks := make([]db.Task, 0)
	query := s.Store.DB.NewSelect().Model(&tasks).Where("project_id = ? AND visibility = 'customer'", project.ID)
	if len(page.VisibleTaskIDs) > 0 {
		query = query.Where("id IN (?)", bun.In(page.VisibleTaskIDs))
	}
	if err := query.Order("position ASC", "created_at ASC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load public tasks"))
		return
	}
	milestones := make([]db.Milestone, 0)
	milestoneQuery := s.Store.DB.NewSelect().Model(&milestones).Where("project_id = ? AND visibility = 'customer'", project.ID)
	if len(page.VisibleMilestoneIDs) > 0 {
		milestoneQuery = milestoneQuery.Where("id IN (?)", bun.In(page.VisibleMilestoneIDs))
	}
	if err := milestoneQuery.Order("due_date ASC NULLS LAST").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load public milestones"))
		return
	}
	publicTasks := make([]publicTask, 0, len(tasks))
	for _, task := range tasks {
		status := statusMap[task.StatusID]
		publicTasks = append(publicTasks, publicTask{ID: task.ID, ParentID: task.ParentID, MilestoneID: task.MilestoneID, Title: task.Title, Description: task.Description, Priority: task.Priority, StartDate: task.StartDate, DueDate: task.DueDate, StatusName: status.Name, StatusCategory: status.Category, EstimateMins: task.EstimateMins})
	}
	publicMilestones := make([]publicMilestone, 0, len(milestones))
	for _, milestone := range milestones {
		publicMilestones = append(publicMilestones, publicMilestone{ID: milestone.ID, Name: milestone.Name, Description: milestone.Description, StartDate: milestone.StartDate, DueDate: milestone.DueDate, Status: milestone.Status})
	}
	c.Header("X-Robots-Tag", "noindex, nofollow")
	c.JSON(http.StatusOK, gin.H{"page": gin.H{"title": page.Title, "accessMode": page.AccessMode}, "project": gin.H{"name": project.Name, "key": project.Key, "description": project.Description, "targetDate": project.TargetDate}, "tasks": publicTasks, "milestones": publicMilestones})
}

func (s *Server) allowPublicRequest(c *gin.Context) bool {
	key := c.ClientIP()
	now := time.Now()
	s.publicRateMu.Lock()
	defer s.publicRateMu.Unlock()
	entry := s.publicRate[key]
	if entry.StartedAt.IsZero() || now.Sub(entry.StartedAt) >= time.Minute {
		s.publicRate[key] = publicRateEntry{StartedAt: now, Count: 1}
		return true
	}
	if entry.Count >= 120 {
		return false
	}
	entry.Count++
	s.publicRate[key] = entry
	return true
}

func (s *Server) optionalPrincipal(c *gin.Context) *auth.Principal {
	token, err := c.Cookie(s.Config.SessionCookieName)
	if err != nil || token == "" {
		return nil
	}
	principal, err := s.Auth.PrincipalFromToken(c.Request.Context(), token)
	if err != nil {
		return nil
	}
	return principal
}

func parseUUIDList(values []string) ([]uuid.UUID, error) {
	result := make([]uuid.UUID, 0, len(values))
	for _, value := range values {
		parsed, err := uuid.Parse(value)
		if err != nil {
			return nil, err
		}
		result = append(result, parsed)
	}
	return result, nil
}
func randomToken(size int) (string, error) {
	raw := make([]byte, size)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func (s *Server) audit(c *gin.Context, action, entityType string, entityID uuid.UUID, metadata map[string]any) error {
	principal := s.principal(c)
	if principal == nil {
		return errors.New("cannot audit without a principal")
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	var actorID *uuid.UUID
	if principal != nil {
		actorID = &principal.User.ID
	}
	event := &db.AuditEvent{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}, TenantID: principal.Tenant.ID, ActorID: actorID, Action: action, EntityType: entityType, EntityID: entityID, Metadata: metadata}
	_, err := s.Store.DB.NewInsert().Model(event).Exec(c.Request.Context())
	return err
}

func (s *Server) listConflicts(c *gin.Context) {
	var projectID *uuid.UUID
	if raw := c.Query("projectId"); raw != "" {
		parsed, err := uuid.Parse(raw)
		if err != nil {
			badRequest(c, errors.New("invalid project id"))
			return
		}
		projectID = &parsed
	}
	if !s.authorize(c, "sync.resolve", projectID) {
		return
	}
	conflicts := make([]db.SyncConflict, 0)
	query := s.Store.DB.NewSelect().Model(&conflicts).Where("tenant_id = ?", s.principal(c).Tenant.ID).Order("created_at DESC")
	if projectID != nil {
		query = query.Where(`external_link_id IN (
			SELECT el.id FROM external_links AS el
			WHERE el.tenant_id = ? AND (
				(el.local_type = 'task' AND el.local_id IN (SELECT id FROM tasks WHERE tenant_id = ? AND project_id = ?))
				OR (el.local_type = 'milestone' AND el.local_id IN (SELECT id FROM milestones WHERE tenant_id = ? AND project_id = ?))
			)
		)`, s.principal(c).Tenant.ID, s.principal(c).Tenant.ID, *projectID, s.principal(c).Tenant.ID, *projectID)
	}
	if status := c.Query("status"); status != "" {
		if status != "open" && status != "resolved" && status != "ignored" {
			badRequest(c, errors.New("invalid conflict status"))
			return
		}
		query = query.Where("status = ?", status)
	} else {
		query = query.Where("status = 'open'")
	}
	if err := query.Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load sync conflicts"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": conflicts, "count": len(conflicts)})
}

func (s *Server) resolveConflict(c *gin.Context) {
	conflictID, ok := pathUUID(c, "conflictId")
	if !ok {
		return
	}
	var conflict db.SyncConflict
	if err := s.Store.DB.NewSelect().Model(&conflict).Where("id = ? AND tenant_id = ? AND status = 'open'", conflictID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	projectID, err := s.projectForExternalLink(c, conflict.ExternalLinkID)
	if err != nil {
		notFound(c)
		return
	}
	if !s.authorize(c, "sync.resolve", projectID) {
		return
	}
	var input struct {
		Resolution string `json:"resolution"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || (input.Resolution != "local" && input.Resolution != "remote" && input.Resolution != "ignore") {
		badRequest(c, errors.New("resolution must be local, remote, or ignore"))
		return
	}
	status := "resolved"
	if input.Resolution == "ignore" {
		status = "ignored"
	}
	result, err := s.Store.DB.NewUpdate().Model((*db.SyncConflict)(nil)).Set("status = ?", status).Set("resolution = ?", input.Resolution).Set("resolved_by = ?", s.principal(c).User.ID).Set("updated_at = ?", time.Now().UTC()).Where("id = ? AND tenant_id = ? AND status = 'open'", conflictID, s.principal(c).Tenant.ID).Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not resolve conflict"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		notFound(c)
		return
	}
	_ = s.audit(c, "sync_conflict.resolved", "sync_conflict", conflictID, map[string]any{"resolution": input.Resolution})
	if err := s.Queue.Enqueue(c.Request.Context(), "git.conflict.resolved", map[string]any{"conflictId": conflictID.String(), "resolution": input.Resolution}); err != nil {
		_, _ = s.Store.DB.NewUpdate().Model((*db.SyncConflict)(nil)).Set("status = 'open'").Set("resolution = NULL").Set("resolved_by = NULL").Set("updated_at = now()").Where("id = ? AND tenant_id = ?", conflictID, s.principal(c).Tenant.ID).Exec(c.Request.Context())
		writeError(c, http.StatusServiceUnavailable, errors.New("could not queue conflict resolution"))
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) projectForExternalLink(c *gin.Context, linkID uuid.UUID) (*uuid.UUID, error) {
	var link db.ExternalLink
	if err := s.Store.DB.NewSelect().Model(&link).Where("id = ? AND tenant_id = ?", linkID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
		return nil, err
	}
	var projectID uuid.UUID
	switch link.LocalType {
	case "task":
		var task db.Task
		if err := s.Store.DB.NewSelect().Model(&task).Column("project_id").Where("id = ? AND tenant_id = ?", link.LocalID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
			return nil, err
		}
		projectID = task.ProjectID
	case "milestone":
		var milestone db.Milestone
		if err := s.Store.DB.NewSelect().Model(&milestone).Column("project_id").Where("id = ? AND tenant_id = ?", link.LocalID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
			return nil, err
		}
		projectID = milestone.ProjectID
	default:
		return nil, errors.New("unsupported external link type")
	}
	return &projectID, nil
}

func (s *Server) listSyncRuns(c *gin.Context) {
	if !s.authorize(c, "sync.resolve", nil) {
		return
	}
	limit := 50
	if raw := c.Query("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			badRequest(c, errors.New("limit must be a positive integer"))
			return
		}
		if parsed > 100 {
			parsed = 100
		}
		limit = parsed
	}
	query := s.Store.DB.NewSelect().Model((*db.SyncEvent)(nil)).Where("tenant_id = ?", s.principal(c).Tenant.ID).Order("created_at DESC").Limit(limit)
	if status := c.Query("status"); status != "" {
		if status != "queued" && status != "processing" && status != "succeeded" && status != "failed" {
			badRequest(c, errors.New("invalid sync run status"))
			return
		}
		query = query.Where("status = ?", status)
	}
	events := make([]db.SyncEvent, 0)
	if err := query.Scan(c.Request.Context(), &events); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load sync runs"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": events, "count": len(events)})
}

func (s *Server) listAuditEvents(c *gin.Context) {
	if !s.authorize(c, "tenant.read", nil) {
		return
	}
	limit := 50
	if raw := c.Query("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			badRequest(c, errors.New("limit must be a positive integer"))
			return
		}
		if parsed > 100 {
			parsed = 100
		}
		limit = parsed
	}
	events := make([]db.AuditEvent, 0)
	if err := s.Store.DB.NewSelect().Model(&events).Where("tenant_id = ?", s.principal(c).Tenant.ID).Order("created_at DESC").Limit(limit).Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load audit events"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": events, "count": len(events)})
}

func (s *Server) listGitHubConnections(c *gin.Context) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	connections := make([]db.GitHubConnection, 0)
	if err := s.Store.DB.NewSelect().Model(&connections).Where("tenant_id = ? AND provider = 'github' AND active = true", s.principal(c).Tenant.ID).Order("created_at DESC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load github connections"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": connections})
}

func (s *Server) listGitConnections(c *gin.Context) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	connections := make([]db.GitConnection, 0)
	if err := s.Store.DB.NewSelect().Model(&connections).Where("tenant_id = ? AND active = true", s.principal(c).Tenant.ID).Order("created_at DESC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load git connections"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": connections, "count": len(connections)})
}

func (s *Server) deleteGitConnection(c *gin.Context) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	connectionID, ok := pathUUID(c, "connectionId")
	if !ok {
		return
	}
	connection, err := s.gitConnection(c, connectionID)
	if err != nil {
		notFound(c)
		return
	}
	result, err := s.Store.DB.NewUpdate().Model((*db.GitConnection)(nil)).Set("active = false").Set("updated_at = ?", time.Now().UTC()).Where("id = ? AND tenant_id = ?", connection.ID, s.principal(c).Tenant.ID).Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not deactivate git connection"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		notFound(c)
		return
	}
	_, _ = s.Store.DB.NewUpdate().Model((*db.Project)(nil)).Set("connection_id = NULL").Set("updated_at = ?", time.Now().UTC()).Where("tenant_id = ? AND connection_id = ?", s.principal(c).Tenant.ID, connection.ID).Exec(c.Request.Context())
	_ = s.audit(c, "git_connection.deactivated", "git_connection", connection.ID, map[string]any{"provider": connection.Provider})
	c.Status(http.StatusNoContent)
}

type tokenConnectionRequest struct {
	Name          string `json:"name"`
	BaseURL       string `json:"baseUrl"`
	AccessToken   string `json:"accessToken"`
	WebhookSecret string `json:"webhookSecret"`
}

func (s *Server) createGitHubTokenConnection(c *gin.Context) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	var input tokenConnectionRequest
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.AccessToken) == "" {
		badRequest(c, errors.New("github access token is required"))
		return
	}
	remoteUser, err := gh.NewClient(strings.TrimSpace(input.AccessToken)).User(c.Request.Context())
	if err != nil || remoteUser.ID == 0 {
		writeError(c, http.StatusBadGateway, errors.New("could not validate github access token"))
		return
	}
	s.saveTokenConnection(c, "github", "https://api.github.com", "pat", remoteUser.ID, remoteUser.Login, input, []string{})
}

func (s *Server) createGitLabConnection(c *gin.Context) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	var input tokenConnectionRequest
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.AccessToken) == "" {
		badRequest(c, errors.New("gitlab access token is required"))
		return
	}
	client, err := gitlab.NewClient(input.BaseURL, input.AccessToken)
	if err != nil {
		badRequest(c, err)
		return
	}
	remoteUser, err := client.User(c.Request.Context())
	if err != nil || remoteUser.ID == 0 {
		writeError(c, http.StatusBadGateway, errors.New("could not validate gitlab access token"))
		return
	}
	s.saveTokenConnection(c, "gitlab", client.BaseURL, "pat", remoteUser.ID, remoteUser.Login, input, []string{})
}

func (s *Server) saveTokenConnection(c *gin.Context, provider, apiBaseURL, authMethod string, accountID int64, accountLogin string, input tokenConnectionRequest, scopes []string) {
	encrypted, err := s.Auth.Cipher.Encrypt(strings.TrimSpace(input.AccessToken))
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not secure access token"))
		return
	}
	encryptedWebhookSecret := ""
	if strings.TrimSpace(input.WebhookSecret) != "" {
		encryptedWebhookSecret, err = s.Auth.Cipher.Encrypt(strings.TrimSpace(input.WebhookSecret))
		if err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not secure webhook secret"))
			return
		}
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = accountLogin
	}
	now := time.Now().UTC()
	connection := db.GitConnection{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, Provider: provider, TenantID: s.principal(c).Tenant.ID, Name: name, APIBaseURL: apiBaseURL, AuthMethod: authMethod, ExternalAccountID: accountID, ExternalAccountLogin: accountLogin, EncryptedAccessToken: encrypted, EncryptedWebhookSecret: encryptedWebhookSecret, Scopes: scopes, Active: true}
	if _, err = s.Store.DB.NewInsert().Model(&connection).On("CONFLICT (tenant_id, provider, api_base_url, auth_method, external_account_id) DO UPDATE").Set("name = EXCLUDED.name").Set("encrypted_access_token = EXCLUDED.encrypted_access_token").Set("encrypted_webhook_secret = EXCLUDED.encrypted_webhook_secret").Set("scopes = EXCLUDED.scopes").Set("active = true").Set("updated_at = now()").Exec(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not save git connection"))
		return
	}
	if err = s.Store.DB.NewSelect().Model(&connection).Where("tenant_id = ? AND provider = ? AND api_base_url = ? AND auth_method = ? AND external_account_id = ?", s.principal(c).Tenant.ID, provider, apiBaseURL, authMethod, accountID).Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load saved git connection"))
		return
	}
	_ = s.audit(c, "git_connection.created", "git_connection", connection.ID, map[string]any{"provider": provider, "account": accountLogin})
	c.JSON(http.StatusCreated, connection)
}

func (s *Server) githubOAuthStart(c *gin.Context) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	if s.Config.GitHubOAuthClientID == "" {
		writeError(c, http.StatusNotImplemented, errors.New("github oauth is not configured"))
		return
	}
	state, err := randomToken(24)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not create oauth state"))
		return
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(githubStateCookie, state, 600, "/", "", s.Config.SecureCookies, true)
	redirect := s.Config.APIURL + "/api/v1/integrations/github/oauth/callback"
	c.JSON(http.StatusOK, gin.H{"url": gh.OAuthURL(s.Config.GitHubOAuthClientID, redirect, state)})
}

func (s *Server) githubOAuthCallback(c *gin.Context) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	state, err := c.Cookie(githubStateCookie)
	if err != nil || state == "" || subtle.ConstantTimeCompare([]byte(state), []byte(c.Query("state"))) != 1 {
		badRequest(c, errors.New("invalid oauth state"))
		return
	}
	if c.Query("code") == "" {
		badRequest(c, errors.New("oauth code is required"))
		return
	}
	token, err := gh.ExchangeOAuthCode(c.Request.Context(), s.Config.GitHubOAuthClientID, s.Config.GitHubOAuthSecret, c.Query("code"))
	if err != nil {
		writeError(c, http.StatusBadGateway, errors.New("github oauth exchange failed"))
		return
	}
	remoteUser, err := gh.NewClient(token.AccessToken).User(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusBadGateway, errors.New("could not load github account"))
		return
	}
	encrypted, err := s.Auth.Cipher.Encrypt(token.AccessToken)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not secure github token"))
		return
	}
	now := time.Now().UTC()
	connection := db.GitConnection{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, Provider: "github", TenantID: s.principal(c).Tenant.ID, Name: remoteUser.Login, APIBaseURL: "https://api.github.com", AuthMethod: "oauth", ExternalAccountID: remoteUser.ID, ExternalAccountLogin: remoteUser.Login, EncryptedAccessToken: encrypted, Scopes: strings.Fields(token.Scope), Active: true}
	if token.ExpiresIn > 0 {
		expires := now.Add(time.Duration(token.ExpiresIn) * time.Second)
		connection.TokenExpiresAt = &expires
	}
	if _, err = s.Store.DB.NewInsert().Model(&connection).On("CONFLICT (tenant_id, provider, api_base_url, auth_method, external_account_id) DO UPDATE").Set("name = EXCLUDED.name").Set("encrypted_access_token = EXCLUDED.encrypted_access_token").Set("encrypted_refresh_token = EXCLUDED.encrypted_refresh_token").Set("token_expires_at = EXCLUDED.token_expires_at").Set("scopes = EXCLUDED.scopes").Set("active = true").Set("updated_at = now()").Exec(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not save github connection"))
		return
	}
	c.SetCookie(githubStateCookie, "", -1, "/", "", s.Config.SecureCookies, true)
	c.Redirect(http.StatusFound, s.Config.FrontendURL+"/?github=connected")
}

func (s *Server) githubAppInstall(c *gin.Context) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	if s.Config.GitHubAppSlug == "" {
		writeError(c, http.StatusNotImplemented, errors.New("github app is not configured"))
		return
	}
	state, err := randomToken(24)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not create app state"))
		return
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(githubStateCookie, state, 600, "/", "", s.Config.SecureCookies, true)
	c.JSON(http.StatusOK, gin.H{"url": "https://github.com/apps/" + s.Config.GitHubAppSlug + "/installations/new?state=" + state})
}

func (s *Server) githubAppCallback(c *gin.Context) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	state, err := c.Cookie(githubStateCookie)
	if err != nil || state == "" || subtle.ConstantTimeCompare([]byte(state), []byte(c.Query("state"))) != 1 {
		badRequest(c, errors.New("invalid github app state"))
		return
	}
	installationID, err := strconv.ParseInt(c.Query("installation_id"), 10, 64)
	if err != nil || installationID <= 0 {
		badRequest(c, errors.New("github installation id is required"))
		return
	}
	now := time.Now().UTC()
	connection := db.GitConnection{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, Provider: "github", TenantID: s.principal(c).Tenant.ID, Name: "GitHub App installation " + strconv.FormatInt(installationID, 10), APIBaseURL: "https://api.github.com", AuthMethod: "app", ExternalAccountID: installationID, InstallationID: &installationID, Scopes: []string{"issues:read", "issues:write", "metadata:read"}, Active: true}
	if _, err = s.Store.DB.NewInsert().Model(&connection).On("CONFLICT (tenant_id, provider, api_base_url, auth_method, external_account_id) DO UPDATE").Set("name = EXCLUDED.name").Set("installation_id = EXCLUDED.installation_id").Set("scopes = EXCLUDED.scopes").Set("active = true").Set("updated_at = now()").Exec(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not save github app installation"))
		return
	}
	c.SetCookie(githubStateCookie, "", -1, "/", "", s.Config.SecureCookies, true)
	c.Redirect(http.StatusFound, s.Config.FrontendURL+"/?github=installed")
}

type projectRepositoryResponse struct {
	Link       db.ProjectRepository `json:"link"`
	Repository db.GitHubRepository  `json:"repository"`
}

func (s *Server) listProjectRepositories(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "project.read", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	var links []db.ProjectRepository
	if err := s.Store.DB.NewSelect().Model(&links).Where("project_id = ?", projectID).Order("created_at ASC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load project repositories"))
		return
	}
	result := make([]projectRepositoryResponse, 0, len(links))
	for _, link := range links {
		var repository db.GitHubRepository
		if err := s.Store.DB.NewSelect().Model(&repository).Join("JOIN git_connections AS c ON c.id = gr.connection_id").Where("gr.id = ? AND c.tenant_id = ? AND c.active = true", link.RepositoryID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
			continue
		}
		result = append(result, projectRepositoryResponse{Link: link, Repository: repository})
	}
	c.JSON(http.StatusOK, gin.H{"items": result, "count": len(result)})
}

func (s *Server) listGitRepositories(c *gin.Context) {
	s.listGitRepositoriesFor(c, "")
}

func (s *Server) attachProjectRepository(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "integration.manage", &projectID) {
		return
	}
	project, err := s.project(c, projectID)
	if err != nil {
		notFound(c)
		return
	}
	var input struct {
		RepositoryID string `json:"repositoryId"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid repository payload"))
		return
	}
	repositoryID, err := uuid.Parse(input.RepositoryID)
	if err != nil {
		badRequest(c, errors.New("invalid repository id"))
		return
	}
	var repository db.GitHubRepository
	if err = s.Store.DB.NewSelect().Model(&repository).Join("JOIN git_connections AS c ON c.id = gr.connection_id").Where("gr.id = ? AND c.tenant_id = ? AND c.active = true", repositoryID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	if project.ConnectionID != nil && *project.ConnectionID != repository.ConnectionID {
		badRequest(c, errors.New("repository belongs to a different project connection"))
		return
	}
	link := db.ProjectRepository{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}, ProjectID: projectID, RepositoryID: repositoryID}
	if _, err = s.Store.DB.NewInsert().Model(&link).On("CONFLICT (project_id, repository_id) DO NOTHING").Exec(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not attach repository"))
		return
	}
	if err = s.Store.DB.NewSelect().Model(&link).Where("project_id = ? AND repository_id = ?", projectID, repositoryID).Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load attached repository"))
		return
	}
	if project.ConnectionID == nil {
		_, _ = s.Store.DB.NewUpdate().Model((*db.Project)(nil)).Set("connection_id = ?", repository.ConnectionID).Set("updated_at = ?", time.Now().UTC()).Where("id = ? AND tenant_id = ? AND connection_id IS NULL", projectID, s.principal(c).Tenant.ID).Exec(c.Request.Context())
	}
	c.JSON(http.StatusCreated, projectRepositoryResponse{Link: link, Repository: repository})
}

func (s *Server) detachProjectRepository(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	repositoryID, ok := pathUUID(c, "repositoryId")
	if !ok {
		return
	}
	if !s.authorize(c, "integration.manage", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	result, err := s.Store.DB.NewDelete().Model((*db.ProjectRepository)(nil)).Where("project_id = ? AND repository_id = ?", projectID, repositoryID).Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not detach repository"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		notFound(c)
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) importGitHubProject(c *gin.Context) {
	s.importGitProject(c)
}

func (s *Server) importGitProject(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "integration.manage", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	var input struct {
		RepositoryID string `json:"repositoryId"`
	}
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&input); err != nil {
			badRequest(c, errors.New("invalid git import payload"))
			return
		}
	}
	var repository db.GitHubRepository
	if input.RepositoryID != "" {
		repositoryID, err := uuid.Parse(input.RepositoryID)
		if err != nil {
			badRequest(c, errors.New("invalid repository id"))
			return
		}
		if err = s.Store.DB.NewSelect().Model(&repository).
			Join("JOIN git_connections AS c ON c.id = gr.connection_id").
			Where("gr.id = ? AND c.tenant_id = ? AND c.active = true", repositoryID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
			notFound(c)
			return
		}
		attachedCount, attachedErr := s.Store.DB.NewSelect().Model((*db.ProjectRepository)(nil)).Where("project_id = ? AND repository_id = ?", projectID, repository.ID).Count(c.Request.Context())
		if attachedErr != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not validate project repository"))
			return
		}
		if attachedCount != 1 {
			badRequest(c, errors.New("repository must be attached to the project before import"))
			return
		}
	} else {
		if err := s.Store.DB.NewSelect().Model(&repository).
			Join("JOIN project_repositories AS pr ON pr.repository_id = gr.id").
			Join("JOIN git_connections AS c ON c.id = gr.connection_id").
			Where("pr.project_id = ? AND c.tenant_id = ? AND c.active = true", projectID, s.principal(c).Tenant.ID).
			Order("pr.created_at ASC").Limit(1).Scan(c.Request.Context()); err != nil {
			notFound(c)
			return
		}
	}
	now := time.Now().UTC()
	var connection db.GitConnection
	if err := s.Store.DB.NewSelect().Model(&connection).Where("id = ? AND tenant_id = ? AND active = true", repository.ConnectionID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	provider := connection.Provider
	if provider == "" {
		provider = "github"
	}
	event := &db.SyncEvent{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: uuidPtr(s.principal(c).Tenant.ID), ConnectionID: uuidPtr(repository.ConnectionID), DeliveryID: "import-" + uuid.NewString(), EventName: "import", Action: "manual", Payload: map[string]any{"projectId": projectID.String(), "repositoryId": repository.ID.String()}, Status: "queued"}
	event.Provider = provider
	if _, err := s.Store.DB.NewInsert().Model(event).Exec(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not create git sync run"))
		return
	}
	if err := s.Queue.Enqueue(c.Request.Context(), "git.import", map[string]any{"tenantId": s.principal(c).Tenant.ID.String(), "projectId": projectID.String(), "repositoryId": repository.ID.String(), "syncEventId": event.ID.String()}); err != nil {
		_ = s.setSyncRunFailed(c, event.ID, err.Error())
		writeError(c, http.StatusInternalServerError, errors.New("could not queue git import"))
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"runId": event.ID, "status": event.Status})
}

func uuidPtr(value uuid.UUID) *uuid.UUID {
	return &value
}

func (s *Server) setSyncRunFailed(c *gin.Context, eventID uuid.UUID, message string) error {
	_, err := s.Store.DB.NewUpdate().Model((*db.SyncEvent)(nil)).Set("status = 'failed'").Set("error_message = ?", message).Set("updated_at = ?", time.Now().UTC()).Where("id = ? AND tenant_id = ?", eventID, s.principal(c).Tenant.ID).Exec(c.Request.Context())
	return err
}

func (s *Server) listGitHubRepositories(c *gin.Context) {
	s.listGitRepositoriesFor(c, "github")
}

func (s *Server) listGitRepositoriesFor(c *gin.Context, provider string) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	var connectionID *uuid.UUID
	if raw := strings.TrimSpace(c.Query("connectionId")); raw != "" {
		parsed, err := uuid.Parse(raw)
		if err != nil {
			badRequest(c, errors.New("invalid connection id"))
			return
		}
		connectionID = &parsed
	}
	connections := make([]db.GitConnection, 0)
	query := s.Store.DB.NewSelect().Model(&connections).Where("tenant_id = ? AND active = true", s.principal(c).Tenant.ID).Order("created_at ASC")
	if provider != "" {
		query = query.Where("provider = ?", provider)
	}
	if connectionID != nil {
		query = query.Where("id = ?", *connectionID)
	}
	if err := query.Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load git connections"))
		return
	}
	result := make([]db.GitRepository, 0)
	for _, connection := range connections {
		client, clientErr := s.gitClient(c.Request.Context(), connection)
		if clientErr != nil {
			continue
		}
		remotes, listErr := client.ListRepositories(c.Request.Context())
		if listErr != nil {
			continue
		}
		for _, remote := range remotes {
			repository := db.GitRepository{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}, ConnectionID: connection.ID, ExternalID: remote.ID, Owner: remote.Owner, Name: remote.Name, FullName: remote.FullName, Private: remote.Private}
			if _, err := s.Store.DB.NewInsert().Model(&repository).
				On("CONFLICT (connection_id, external_id) DO UPDATE").
				Set("owner = EXCLUDED.owner").Set("name = EXCLUDED.name").Set("full_name = EXCLUDED.full_name").Set("private = EXCLUDED.private").Set("updated_at = now()").Exec(c.Request.Context()); err != nil {
				continue
			}
			if err := s.Store.DB.NewSelect().Model(&repository).Where("connection_id = ? AND external_id = ?", connection.ID, remote.ID).Scan(c.Request.Context()); err != nil {
				continue
			}
			result = append(result, repository)
		}
	}
	c.JSON(http.StatusOK, gin.H{"items": result, "count": len(result)})
}

func (s *Server) gitClient(ctx context.Context, connection db.GitConnection) (integrations.Provider, error) {
	provider := connection.Provider
	if provider == "" {
		provider = "github"
	}
	if connection.AuthMethod == "app" && provider == "github" {
		if connection.InstallationID == nil {
			return nil, errors.New("github installation id is missing")
		}
		return gh.NewInstallationClient(ctx, s.Config.GitHubAppID, s.Config.GitHubAppPrivateKey, *connection.InstallationID)
	}
	if connection.EncryptedAccessToken == "" {
		return nil, fmt.Errorf("%s connection token is missing", provider)
	}
	token, err := s.Auth.Cipher.Decrypt(connection.EncryptedAccessToken)
	if err != nil {
		return nil, err
	}
	switch provider {
	case "github":
		return gh.NewClient(token), nil
	case "gitlab":
		return gitlab.NewClient(connection.APIBaseURL, token)
	default:
		return nil, fmt.Errorf("unsupported git provider %q", provider)
	}
}

func (s *Server) listGitHubUserMappings(c *gin.Context) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	mappings := make([]db.GitHubUserMapping, 0)
	if err := s.Store.DB.NewSelect().Model(&mappings).Where("tenant_id = ? AND provider = 'github'", s.principal(c).Tenant.ID).Order("remote_login ASC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load github user mappings"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": mappings, "count": len(mappings)})
}

type githubUserMappingRequest struct {
	GitHubLogin string `json:"githubLogin"`
	UserID      string `json:"userId"`
}

func (s *Server) createGitHubUserMapping(c *gin.Context) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	var input githubUserMappingRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid github user mapping payload"))
		return
	}
	login := strings.TrimSpace(input.GitHubLogin)
	if login == "" {
		badRequest(c, errors.New("github login is required"))
		return
	}
	userID, err := uuid.Parse(input.UserID)
	if err != nil {
		badRequest(c, errors.New("invalid user id"))
		return
	}
	count, err := s.Store.DB.NewSelect().Model((*db.Membership)(nil)).Where("tenant_id = ? AND user_id = ?", s.principal(c).Tenant.ID, userID).Count(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not validate mapped user"))
		return
	}
	if count != 1 {
		notFound(c)
		return
	}
	now := time.Now().UTC()
	mapping := db.GitUserMapping{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: s.principal(c).Tenant.ID, Provider: "github", RemoteLogin: login, UserID: userID}
	if _, err = s.Store.DB.NewInsert().Model(&mapping).
		On("CONFLICT (tenant_id, provider, remote_login) DO UPDATE").
		Set("user_id = EXCLUDED.user_id").Set("updated_at = now()").Exec(c.Request.Context()); err != nil {
		conflict(c, "github login is already mapped")
		return
	}
	if err = s.Store.DB.NewSelect().Model(&mapping).Where("tenant_id = ? AND provider = 'github' AND remote_login = ?", s.principal(c).Tenant.ID, login).Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load saved github mapping"))
		return
	}
	_ = s.audit(c, "git_user_mapping.created", "git_user_mapping", mapping.ID, map[string]any{"provider": "github", "remoteLogin": login, "userId": userID})
	c.JSON(http.StatusCreated, mapping)
}

func (s *Server) deleteGitHubUserMapping(c *gin.Context) {
	if !s.authorize(c, "integration.manage", nil) {
		return
	}
	mappingID, ok := pathUUID(c, "mappingId")
	if !ok {
		return
	}
	result, err := s.Store.DB.NewDelete().Model((*db.GitUserMapping)(nil)).Where("id = ? AND tenant_id = ?", mappingID, s.principal(c).Tenant.ID).Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not delete github user mapping"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		notFound(c)
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) githubWebhook(c *gin.Context) {
	const maxWebhookBody = 2 << 20
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, maxWebhookBody+1))
	if err != nil {
		writeError(c, http.StatusBadRequest, errors.New("could not read webhook"))
		return
	}
	if len(body) > maxWebhookBody {
		writeError(c, http.StatusRequestEntityTooLarge, errors.New("webhook payload is too large"))
		return
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		badRequest(c, errors.New("invalid webhook json"))
		return
	}
	signatureHeader := c.GetHeader("X-Hub-Signature-256")
	if !strings.HasPrefix(signatureHeader, "sha256=") {
		writeError(c, http.StatusUnauthorized, errors.New("invalid webhook signature"))
		return
	}
	signature, decodeErr := hex.DecodeString(strings.TrimPrefix(signatureHeader, "sha256="))
	if decodeErr != nil {
		writeError(c, http.StatusUnauthorized, errors.New("invalid webhook signature"))
		return
	}
	connection, connectionErr := s.githubWebhookConnection(c, payload, body, signature)
	if connectionErr != nil {
		writeError(c, http.StatusUnauthorized, errors.New("invalid webhook signature"))
		return
	}
	deliveryID := c.GetHeader("X-GitHub-Delivery")
	eventName := strings.TrimSpace(c.GetHeader("X-GitHub-Event"))
	if deliveryID == "" || eventName == "" {
		badRequest(c, errors.New("webhook delivery id is required"))
		return
	}
	event := &db.SyncEvent{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}, Provider: "github", DeliveryID: deliveryID, EventName: eventName, Payload: payload, Status: "queued"}
	if connection != nil {
		event.TenantID = uuidPtr(connection.TenantID)
		event.ConnectionID = uuidPtr(connection.ID)
	}
	if action, ok := payload["action"].(string); ok {
		event.Action = action
	}
	result, err := s.Store.DB.NewInsert().Model(event).On("CONFLICT (delivery_id) DO NOTHING").Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not persist webhook"))
		return
	}
	count, _ := result.RowsAffected()
	duplicate := count == 0
	if duplicate {
		var existing db.SyncEvent
		if err = s.Store.DB.NewSelect().Model(&existing).Where("delivery_id = ?", deliveryID).Scan(c.Request.Context()); err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not load existing webhook"))
			return
		}
		if existing.Status == "succeeded" {
			c.JSON(http.StatusAccepted, gin.H{"accepted": true, "duplicate": true})
			return
		}
	}
	if err = s.Queue.Enqueue(c.Request.Context(), "git.webhook", map[string]any{"deliveryId": deliveryID, "event": eventName, "provider": "github"}); err != nil {
		failedEventID := event.ID
		if duplicate {
			var existing db.SyncEvent
			if lookupErr := s.Store.DB.NewSelect().Model(&existing).Where("delivery_id = ?", deliveryID).Scan(c.Request.Context()); lookupErr == nil {
				failedEventID = existing.ID
			}
		}
		_, _ = s.Store.DB.NewUpdate().Model((*db.SyncEvent)(nil)).Set("status = 'failed'").Set("error_message = ?", err.Error()).Set("updated_at = now()").Where("id = ?", failedEventID).Exec(c.Request.Context())
		writeError(c, http.StatusServiceUnavailable, errors.New("could not queue webhook"))
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"accepted": true, "duplicate": duplicate})
}

// githubWebhookConnection validates a delivery against a secret saved on the
// matching tenant connection. The global secret remains a compatibility
// fallback for a GitHub App installation that was registered before per-tenant
// connections existed; ordinary OAuth/PAT connections do not depend on it.
func (s *Server) githubWebhookConnection(c *gin.Context, payload map[string]any, body, signature []byte) (*db.GitConnection, error) {
	repositoryID, _ := gitHubPayloadRepositoryID(payload)
	installationID, _ := strconv.ParseInt(strings.TrimSpace(c.GetHeader("X-GitHub-Hook-Installation-Target-ID")), 10, 64)

	connections := make([]db.GitConnection, 0)
	query := s.Store.DB.NewSelect().Model(&connections).Where("gc.provider = 'github' AND gc.active = true")
	if repositoryID > 0 {
		query = query.Join("JOIN git_repositories AS gr ON gr.connection_id = gc.id").Where("gr.external_id = ?", repositoryID)
	}
	if installationID > 0 {
		if repositoryID > 0 {
			query = query.Where("(gc.installation_id = ? OR gc.external_account_id = ?)", installationID, installationID)
		} else {
			query = query.Where("gc.installation_id = ? OR gc.external_account_id = ?", installationID, installationID)
		}
	}
	if err := query.Order("gc.created_at ASC").Scan(c.Request.Context()); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	for index := range connections {
		connection := &connections[index]
		if connection.EncryptedWebhookSecret == "" {
			continue
		}
		secret, err := s.Auth.Cipher.Decrypt(connection.EncryptedWebhookSecret)
		if err != nil {
			continue
		}
		if validWebhookSignature(body, signature, secret) {
			return connection, nil
		}
	}
	if strings.TrimSpace(s.Config.GitHubWebhookSecret) != "" && validWebhookSignature(body, signature, s.Config.GitHubWebhookSecret) {
		return nil, nil
	}
	return nil, errors.New("github webhook signature did not match a connection")
}

func validWebhookSignature(body, signature []byte, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return hmac.Equal(mac.Sum(nil), signature)
}

func gitHubPayloadRepositoryID(payload map[string]any) (int64, bool) {
	repository, ok := payload["repository"].(map[string]any)
	if !ok {
		return 0, false
	}
	return jsonInt64(repository["id"])
}

func (s *Server) gitlabWebhook(c *gin.Context) {
	const maxWebhookBody = 2 << 20
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, maxWebhookBody+1))
	if err != nil {
		writeError(c, http.StatusBadRequest, errors.New("could not read webhook"))
		return
	}
	if len(body) > maxWebhookBody {
		writeError(c, http.StatusRequestEntityTooLarge, errors.New("webhook payload is too large"))
		return
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		badRequest(c, errors.New("invalid gitlab webhook json"))
		return
	}
	projectID, ok := gitLabPayloadProjectID(payload)
	if !ok {
		badRequest(c, errors.New("gitlab webhook project id is required"))
		return
	}
	connection, repository, err := s.gitLabWebhookConnection(c, projectID, c.GetHeader("X-Gitlab-Token"), payload)
	if err != nil {
		writeError(c, http.StatusUnauthorized, errors.New("invalid gitlab webhook token"))
		return
	}
	rawDeliveryID := strings.TrimSpace(c.GetHeader("X-Gitlab-Event-UUID"))
	if rawDeliveryID == "" {
		rawDeliveryID = strings.TrimSpace(c.GetHeader("X-Gitlab-Delivery"))
	}
	if rawDeliveryID == "" {
		badRequest(c, errors.New("gitlab webhook delivery id is required"))
		return
	}
	deliveryID := "gitlab:" + rawDeliveryID
	eventName := strings.ToLower(strings.TrimSpace(c.GetHeader("X-Gitlab-Event")))
	if eventName == "" {
		if objectKind, ok := payload["object_kind"].(string); ok {
			eventName = strings.ToLower(objectKind)
		}
	}
	if eventName == "" {
		badRequest(c, errors.New("gitlab webhook event is required"))
		return
	}
	event := &db.SyncEvent{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}, TenantID: uuidPtr(connection.TenantID), ConnectionID: uuidPtr(connection.ID), Provider: "gitlab", DeliveryID: deliveryID, EventName: eventName, Payload: payload, Status: "queued"}
	if attributes, ok := payload["object_attributes"].(map[string]any); ok {
		if action, ok := attributes["action"].(string); ok {
			event.Action = action
		}
	}
	result, err := s.Store.DB.NewInsert().Model(event).On("CONFLICT (delivery_id) DO NOTHING").Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not persist gitlab webhook"))
		return
	}
	count, _ := result.RowsAffected()
	duplicate := count == 0
	if duplicate {
		var existing db.SyncEvent
		if err = s.Store.DB.NewSelect().Model(&existing).Where("delivery_id = ?", deliveryID).Scan(c.Request.Context()); err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not load existing gitlab webhook"))
			return
		}
		if existing.Status == "succeeded" {
			c.JSON(http.StatusAccepted, gin.H{"accepted": true, "duplicate": true})
			return
		}
	}
	if err = s.Queue.Enqueue(c.Request.Context(), "git.webhook", map[string]any{"deliveryId": deliveryID, "event": eventName, "provider": "gitlab", "connectionId": connection.ID.String(), "repositoryId": repository.ID.String()}); err != nil {
		failedEventID := event.ID
		if duplicate {
			var existing db.SyncEvent
			if lookupErr := s.Store.DB.NewSelect().Model(&existing).Where("delivery_id = ?", deliveryID).Scan(c.Request.Context()); lookupErr == nil {
				failedEventID = existing.ID
			}
		}
		_, _ = s.Store.DB.NewUpdate().Model((*db.SyncEvent)(nil)).Set("status = 'failed'").Set("error_message = ?", err.Error()).Set("updated_at = ?", time.Now().UTC()).Where("id = ?", failedEventID).Exec(c.Request.Context())
		writeError(c, http.StatusServiceUnavailable, errors.New("could not queue gitlab webhook"))
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"accepted": true, "duplicate": duplicate})
}

func (s *Server) gitLabWebhookConnection(c *gin.Context, projectID int64, presentedToken string, payload map[string]any) (db.GitConnection, db.GitRepository, error) {
	if strings.TrimSpace(presentedToken) == "" {
		return db.GitConnection{}, db.GitRepository{}, errors.New("gitlab webhook token is missing")
	}
	connections := make([]db.GitConnection, 0)
	if err := s.Store.DB.NewSelect().Model(&connections).Where("provider = 'gitlab' AND active = true").Order("created_at ASC").Scan(c.Request.Context()); err != nil {
		return db.GitConnection{}, db.GitRepository{}, err
	}
	for _, connection := range connections {
		if connection.EncryptedWebhookSecret == "" {
			continue
		}
		secret, err := s.Auth.Cipher.Decrypt(connection.EncryptedWebhookSecret)
		if err != nil || subtle.ConstantTimeCompare([]byte(secret), []byte(presentedToken)) != 1 {
			continue
		}
		var repository db.GitRepository
		if err = s.Store.DB.NewSelect().Model(&repository).Where("connection_id = ? AND external_id = ?", connection.ID, projectID).Scan(c.Request.Context()); err == nil {
			return connection, repository, nil
		} else if !errors.Is(err, sql.ErrNoRows) {
			return db.GitConnection{}, db.GitRepository{}, err
		}
		repository = gitLabRepositoryFromPayload(connection.ID, projectID, payload)
		if repository.FullName == "" {
			return db.GitConnection{}, db.GitRepository{}, errors.New("gitlab webhook repository is missing")
		}
		if _, err = s.Store.DB.NewInsert().Model(&repository).On("CONFLICT (connection_id, external_id) DO UPDATE").Set("owner = EXCLUDED.owner").Set("name = EXCLUDED.name").Set("full_name = EXCLUDED.full_name").Set("private = EXCLUDED.private").Set("updated_at = now()").Exec(c.Request.Context()); err != nil {
			return db.GitConnection{}, db.GitRepository{}, err
		}
		if err = s.Store.DB.NewSelect().Model(&repository).Where("connection_id = ? AND external_id = ?", connection.ID, projectID).Scan(c.Request.Context()); err != nil {
			return db.GitConnection{}, db.GitRepository{}, err
		}
		return connection, repository, nil
	}
	return db.GitConnection{}, db.GitRepository{}, errors.New("gitlab webhook token did not match a connection")
}

func gitLabPayloadProjectID(payload map[string]any) (int64, bool) {
	project, ok := payload["project"].(map[string]any)
	if !ok {
		return 0, false
	}
	return jsonInt64(project["id"])
}

func jsonInt64(value any) (int64, bool) {
	switch parsed := value.(type) {
	case float64:
		return int64(parsed), parsed > 0
	case json.Number:
		value, err := parsed.Int64()
		return value, err == nil && value > 0
	case int64:
		return parsed, parsed > 0
	case int:
		return int64(parsed), parsed > 0
	case string:
		value, err := strconv.ParseInt(parsed, 10, 64)
		return value, err == nil && value > 0
	default:
		return 0, false
	}
}

func gitLabRepositoryFromPayload(connectionID uuid.UUID, projectID int64, payload map[string]any) db.GitRepository {
	project, _ := payload["project"].(map[string]any)
	name, _ := project["name"].(string)
	fullName, _ := project["path_with_namespace"].(string)
	namespace, _ := project["namespace"].(map[string]any)
	owner, _ := namespace["full_path"].(string)
	if owner == "" && fullName != "" {
		if index := strings.LastIndex(fullName, "/"); index > 0 {
			owner = fullName[:index]
		}
	}
	if fullName == "" && owner != "" && name != "" {
		fullName = owner + "/" + name
	}
	private := false
	if visibility, ok := project["visibility"].(string); ok {
		private = visibility == "private"
	}
	now := time.Now().UTC()
	return db.GitRepository{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, ConnectionID: connectionID, ExternalID: projectID, Owner: owner, Name: name, FullName: fullName, Private: private}
}
