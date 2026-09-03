package httpapi

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/auth"
	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	syncservice "github.com/JustLABv1/justprojects/services/backend/internal/sync"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/driver/pgdriver"
)

var validProjectRequestStatuses = map[string]bool{
	"submitted": true, "in_review": true, "needs_info": true, "approved": true,
	"rejected": true, "converted": true, "cancelled": true,
}

var validProjectRequestPriorities = map[string]bool{
	"low": true, "medium": true, "high": true, "urgent": true,
}

type projectRequestSummary struct {
	ID                  uuid.UUID  `json:"id"`
	TenantID            uuid.UUID  `json:"tenantId"`
	SourcePublicPageID  *uuid.UUID `json:"sourcePublicPageId"`
	RequesterUserID     *uuid.UUID `json:"requesterUserId"`
	RequesterName       string     `json:"requesterName"`
	RequesterEmail      string     `json:"requesterEmail"`
	Title               string     `json:"title"`
	Description         string     `json:"description"`
	RequestedStartDate  *time.Time `json:"requestedStartDate"`
	RequestedTargetDate *time.Time `json:"requestedTargetDate"`
	Priority            string     `json:"priority"`
	Status              string     `json:"status"`
	AssignedTo          *uuid.UUID `json:"assignedTo"`
	InternalNotes       string     `json:"internalNotes"`
	ConvertedProjectID  *uuid.UUID `json:"convertedProjectId"`
	CreatedAt           time.Time  `json:"createdAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`
}

type projectUpdateResponse struct {
	ID         uuid.UUID  `json:"id"`
	ProjectID  uuid.UUID  `json:"projectId"`
	AuthorID   *uuid.UUID `json:"authorId"`
	AuthorName string     `json:"authorName,omitempty"`
	Title      string     `json:"title"`
	Body       string     `json:"body"`
	Visibility string     `json:"visibility"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

type notificationResponse struct {
	ID        uuid.UUID  `json:"id"`
	Type      string     `json:"type"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Link      string     `json:"link,omitempty"`
	ReadAt    *time.Time `json:"readAt,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
}

type portfolioNextMilestone struct {
	ID      uuid.UUID  `json:"id"`
	Name    string     `json:"name"`
	DueDate *time.Time `json:"dueDate"`
	Status  string     `json:"status"`
}

type portfolioProject struct {
	Project             db.Project              `json:"project"`
	TaskTotal           int                     `json:"taskTotal"`
	CompletedTasks      int                     `json:"completedTasks"`
	BlockedTasks        int                     `json:"blockedTasks"`
	NextMilestone       *portfolioNextMilestone `json:"nextMilestone,omitempty"`
	ActiveCustomerPages int                     `json:"activeCustomerPages"`
}

type customerProjectRequestInput struct {
	Token               string `json:"token"`
	RequesterName       string `json:"requesterName"`
	RequesterEmail      string `json:"requesterEmail"`
	Title               string `json:"title"`
	Description         string `json:"description"`
	RequestedStartDate  string `json:"requestedStartDate"`
	RequestedTargetDate string `json:"requestedTargetDate"`
	Priority            string `json:"priority"`
}

type normalizedProjectRequest struct {
	RequesterName       string
	RequesterEmail      string
	Title               string
	Description         string
	RequestedStartDate  *time.Time
	RequestedTargetDate *time.Time
	Priority            string
}

func (s *Server) submitPublicProjectRequest(c *gin.Context) {
	if !s.allowPublicRequest(c) {
		writeError(c, http.StatusTooManyRequests, errors.New("public request rate limit exceeded"))
		return
	}
	var input customerProjectRequestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid project request payload"))
		return
	}
	slug := c.Param("slug")
	var page db.PublicPage
	if err := s.Store.DB.NewSelect().Model(&page).Where("slug = ? AND revoked = false", slug).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}

	var customer *auth.Principal
	if page.AccessMode == "link" {
		hash := sha256.Sum256([]byte(strings.TrimSpace(input.Token)))
		if input.Token == "" || subtleConstantTimeEqual(page.TokenHash, hex.EncodeToString(hash[:])) == false {
			notFound(c)
			return
		}
	} else {
		customer = s.optionalPrincipal(c)
		if customer == nil || customer.CustomerPageID == nil || *customer.CustomerPageID != page.ID {
			unauthorized(c)
			return
		}
		c.Set(principalKey, customer)
		input.RequesterName = customer.User.Name
		input.RequesterEmail = customer.User.Email
	}

	normalized, err := normalizeProjectRequestInput(input)
	if err != nil {
		badRequest(c, err)
		return
	}
	var requesterUserID *uuid.UUID
	if customer != nil {
		requesterUserID = &customer.User.ID
	}
	request, rawToken, err := s.insertProjectRequest(c.Request.Context(), page.TenantID, &page.ID, requesterUserID, normalized)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not save project request"))
		return
	}
	if customer != nil {
		_ = s.audit(c, "project_request.created", "project_request", request.ID, map[string]any{"source": "customer"})
	} else {
		_ = s.auditTenant(c.Request.Context(), request.TenantID, nil, "project_request.created", "project_request", request.ID, map[string]any{"source": "public_page", "pageId": page.ID})
	}
	c.JSON(http.StatusCreated, gin.H{"request": projectRequestSummaryFromModel(request), "requestToken": rawToken})
}

func (s *Server) publicRequestWorkspace(c *gin.Context) {
	if !s.allowPublicRequest(c) {
		writeError(c, http.StatusTooManyRequests, errors.New("public request rate limit exceeded"))
		return
	}
	tenant, ok := s.publicRequestTenant(c)
	if !ok {
		return
	}
	c.Header("X-Robots-Tag", "noindex, nofollow")
	c.JSON(http.StatusOK, gin.H{"tenant": gin.H{"name": tenant.Name, "requestSlug": tenant.RequestSlug}})
}

func (s *Server) submitWorkspaceProjectRequest(c *gin.Context) {
	if !s.allowPublicRequest(c) {
		writeError(c, http.StatusTooManyRequests, errors.New("public request rate limit exceeded"))
		return
	}
	var input customerProjectRequestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid project request payload"))
		return
	}
	tenant, ok := s.publicRequestTenant(c)
	if !ok {
		return
	}
	normalized, err := normalizeProjectRequestInput(input)
	if err != nil {
		badRequest(c, err)
		return
	}
	request, rawToken, err := s.insertProjectRequest(c.Request.Context(), tenant.ID, nil, nil, normalized)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not save project request"))
		return
	}
	_ = s.auditTenant(c.Request.Context(), request.TenantID, nil, "project_request.created", "project_request", request.ID, map[string]any{"source": "workspace_request_page", "requestSlug": tenant.RequestSlug})
	c.JSON(http.StatusCreated, gin.H{"request": projectRequestSummaryFromModel(request), "requestToken": rawToken})
}

func (s *Server) publicRequestTenant(c *gin.Context) (db.Tenant, bool) {
	slug := strings.ToLower(strings.TrimSpace(c.Param("slug")))
	var tenant db.Tenant
	if slug == "" {
		notFound(c)
		return db.Tenant{}, false
	}
	err := s.Store.DB.NewSelect().Model(&tenant).Where("request_slug = ?", slug).Scan(c.Request.Context())
	if errors.Is(err, sql.ErrNoRows) {
		// Keep previously shared request URLs working after the public slug migration.
		err = s.Store.DB.NewSelect().Model(&tenant).Where("slug = ?", slug).Scan(c.Request.Context())
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			notFound(c)
			return db.Tenant{}, false
		}
		writeError(c, http.StatusInternalServerError, errors.New("could not load public request workspace"))
		return db.Tenant{}, false
	}
	return tenant, true
}

func normalizeProjectRequestInput(input customerProjectRequestInput) (normalizedProjectRequest, error) {
	name := strings.TrimSpace(input.RequesterName)
	email := strings.ToLower(strings.TrimSpace(input.RequesterEmail))
	if name == "" || email == "" || !strings.Contains(email, "@") {
		return normalizedProjectRequest{}, errors.New("requester name and valid email are required")
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return normalizedProjectRequest{}, errors.New("request title is required")
	}
	description := strings.TrimSpace(input.Description)
	if description == "" {
		return normalizedProjectRequest{}, errors.New("request description is required")
	}
	priority := strings.ToLower(strings.TrimSpace(input.Priority))
	if priority == "" {
		priority = "medium"
	}
	if !validProjectRequestPriorities[priority] {
		return normalizedProjectRequest{}, errors.New("invalid request priority")
	}
	startDate, err := parseDate(input.RequestedStartDate)
	if err != nil {
		return normalizedProjectRequest{}, err
	}
	targetDate, err := parseDate(input.RequestedTargetDate)
	if err != nil {
		return normalizedProjectRequest{}, err
	}
	if startDate != nil && targetDate != nil && startDate.After(*targetDate) {
		return normalizedProjectRequest{}, errors.New("requested start date must be before target date")
	}
	return normalizedProjectRequest{RequesterName: name, RequesterEmail: email, Title: title, Description: description, RequestedStartDate: startDate, RequestedTargetDate: targetDate, Priority: priority}, nil
}

func (s *Server) insertProjectRequest(ctx context.Context, tenantID uuid.UUID, sourcePublicPageID, requesterUserID *uuid.UUID, input normalizedProjectRequest) (db.ProjectRequest, string, error) {
	rawToken, err := randomToken(24)
	if err != nil {
		return db.ProjectRequest{}, "", err
	}
	tokenHash := sha256.Sum256([]byte(rawToken))
	now := time.Now().UTC()
	request := db.ProjectRequest{
		RecordFields:        db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:            tenantID,
		SourcePublicPageID:  sourcePublicPageID,
		RequesterUserID:     requesterUserID,
		RequesterName:       input.RequesterName,
		RequesterEmail:      input.RequesterEmail,
		Title:               input.Title,
		Description:         input.Description,
		RequestedStartDate:  input.RequestedStartDate,
		RequestedTargetDate: input.RequestedTargetDate,
		Priority:            input.Priority,
		Status:              "submitted",
		RequestTokenHash:    stringPtr(hex.EncodeToString(tokenHash[:])),
	}
	if _, err = s.Store.DB.NewInsert().Model(&request).Exec(ctx); err != nil {
		return db.ProjectRequest{}, "", err
	}
	if err = s.notifyRequestOwners(ctx, request); err != nil {
		// Notification delivery is intentionally best-effort; the request itself
		// is already durable and should not fail because an inbox row could not be written.
		_ = err
	}
	return request, rawToken, nil
}

func (s *Server) listProjectRequests(c *gin.Context) {
	if !s.authorize(c, "project_request.read", nil) {
		return
	}
	query := s.Store.DB.NewSelect().Model((*db.ProjectRequest)(nil)).Where("tenant_id = ?", s.principal(c).Tenant.ID)
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		if !validProjectRequestStatuses[status] {
			badRequest(c, errors.New("invalid request status"))
			return
		}
		query = query.Where("status = ?", status)
	}
	if search := strings.TrimSpace(c.Query("search")); search != "" {
		pattern := "%" + search + "%"
		query = query.Where("(title ILIKE ? OR requester_name ILIKE ? OR requester_email ILIKE ? OR description ILIKE ?)", pattern, pattern, pattern, pattern)
	}
	requests := make([]db.ProjectRequest, 0)
	if err := query.Order("created_at DESC").Limit(200).Scan(c.Request.Context(), &requests); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load project requests"))
		return
	}
	items := make([]projectRequestSummary, 0, len(requests))
	for _, request := range requests {
		items = append(items, projectRequestSummaryFromModel(request))
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "count": len(items)})
}

func (s *Server) updateProjectRequest(c *gin.Context) {
	if !s.authorize(c, "project_request.manage", nil) {
		return
	}
	requestID, ok := pathUUID(c, "requestId")
	if !ok {
		return
	}
	var request db.ProjectRequest
	if err := s.Store.DB.NewSelect().Model(&request).Where("id = ? AND tenant_id = ?", requestID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	var input struct {
		Status        *string         `json:"status"`
		AssignedTo    json.RawMessage `json:"assignedTo"`
		InternalNotes *string         `json:"internalNotes"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid project request payload"))
		return
	}
	updates := make(map[string]any)
	statusChanged := false
	if input.Status != nil {
		status := strings.ToLower(strings.TrimSpace(*input.Status))
		if !validProjectRequestStatuses[status] {
			badRequest(c, errors.New("invalid request status"))
			return
		}
		updates["status"] = status
		statusChanged = status != request.Status
	}
	if len(input.AssignedTo) > 0 {
		assignedToValue := ""
		if strings.TrimSpace(string(input.AssignedTo)) != "null" {
			if err := json.Unmarshal(input.AssignedTo, &assignedToValue); err != nil {
				badRequest(c, errors.New("invalid assigned user id"))
				return
			}
		}
		assignedTo, err := optionalUUID(assignedToValue)
		if err != nil {
			badRequest(c, errors.New("invalid assigned user id"))
			return
		}
		if assignedTo != nil && !s.isTenantUser(c, *assignedTo) {
			notFound(c)
			return
		}
		updates["assigned_to"] = assignedTo
	}
	if input.InternalNotes != nil {
		updates["internal_notes"] = strings.TrimSpace(*input.InternalNotes)
	}
	if len(updates) == 0 {
		badRequest(c, errors.New("no project request changes supplied"))
		return
	}
	updates["updated_at"] = time.Now().UTC()
	query := s.Store.DB.NewUpdate().Model((*db.ProjectRequest)(nil)).Where("id = ? AND tenant_id = ?", request.ID, s.principal(c).Tenant.ID)
	for field, value := range updates {
		query = query.Set(field+" = ?", value)
	}
	if _, err := query.Exec(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not update project request"))
		return
	}
	if err := s.Store.DB.NewSelect().Model(&request).Where("id = ?", request.ID).Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not reload project request"))
		return
	}
	if statusChanged {
		_ = s.audit(c, "project_request.status_changed", "project_request", request.ID, map[string]any{"status": request.Status})
		if request.RequesterUserID != nil {
			_ = s.createNotifications(c.Request.Context(), request.TenantID, []uuid.UUID{*request.RequesterUserID}, "project_request.status_changed", "Project request updated", "Your request \""+request.Title+"\" is now "+request.Status+".", "")
		}
	} else {
		_ = s.audit(c, "project_request.updated", "project_request", request.ID, nil)
	}
	c.JSON(http.StatusOK, gin.H{"request": projectRequestSummaryFromModel(request)})
}

func (s *Server) convertProjectRequest(c *gin.Context) {
	if !s.authorize(c, "project_request.manage", nil) {
		return
	}
	requestID, ok := pathUUID(c, "requestId")
	if !ok {
		return
	}
	var request db.ProjectRequest
	if err := s.Store.DB.NewSelect().Model(&request).Where("id = ? AND tenant_id = ?", requestID, s.principal(c).Tenant.ID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	if request.ConvertedProjectID != nil || request.Status == "converted" {
		conflict(c, "project request has already been converted")
		return
	}
	var input struct {
		Name        string `json:"name"`
		Key         string `json:"key"`
		Description string `json:"description"`
		TargetDate  string `json:"targetDate"`
	}
	if err := c.ShouldBindJSON(&input); err != nil && !errors.Is(err, io.EOF) {
		badRequest(c, errors.New("invalid project conversion payload"))
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = request.Title
	}
	key := strings.ToUpper(strings.TrimSpace(input.Key))
	if key == "" {
		key = projectKey(name)
	}
	if !validProjectKey(key) {
		badRequest(c, errors.New("project key must contain 1-12 letters, numbers, or hyphens"))
		return
	}
	keyInUse, err := s.Store.DB.NewSelect().Model((*db.Project)(nil)).Where("tenant_id = ? AND lower(key) = lower(?)", request.TenantID, key).Count(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not validate project key"))
		return
	}
	if keyInUse > 0 {
		conflict(c, "project key is already in use in this workspace")
		return
	}
	targetDate := request.RequestedTargetDate
	if input.TargetDate != "" {
		targetDate, err = parseDate(input.TargetDate)
		if err != nil {
			badRequest(c, err)
			return
		}
	}
	description := strings.TrimSpace(input.Description)
	if description == "" {
		description = request.Description
	}
	now := time.Now().UTC()
	project := db.Project{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: request.TenantID, Name: name, Key: key, Description: description, StartDate: request.RequestedStartDate, TargetDate: targetDate, Status: "active", CreatedBy: s.principal(c).User.ID, Version: 1}
	tx, err := s.Store.DB.BeginTx(c.Request.Context(), nil)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not start project conversion"))
		return
	}
	defer func() { _ = tx.Rollback() }()
	if err = insertProjectWithStatuses(c.Request.Context(), tx, project); err != nil {
		if isProjectKeyConflict(err) {
			conflict(c, "project key is already in use in this workspace")
		} else {
			writeError(c, http.StatusInternalServerError, errors.New("could not create converted project"))
		}
		return
	}
	result, err := tx.NewUpdate().Model((*db.ProjectRequest)(nil)).Where("id = ? AND tenant_id = ? AND converted_project_id IS NULL", request.ID, request.TenantID).Set("status = 'converted'").Set("converted_project_id = ?", project.ID).Set("updated_at = ?", now).Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not mark project request converted"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		conflict(c, "project request has already been converted")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not commit project conversion"))
		return
	}
	request.Status = "converted"
	request.ConvertedProjectID = &project.ID
	request.UpdatedAt = now
	_ = s.audit(c, "project_request.converted", "project_request", request.ID, map[string]any{"projectId": project.ID})
	if request.RequesterUserID != nil {
		_ = s.createNotifications(c.Request.Context(), request.TenantID, []uuid.UUID{*request.RequesterUserID}, "project_request.converted", "Project request approved", "Your request \""+request.Title+"\" has been converted into a project.", "")
	}
	c.JSON(http.StatusCreated, gin.H{"request": projectRequestSummaryFromModel(request), "project": project})
}

func insertProjectWithStatuses(ctx context.Context, tx bun.Tx, project db.Project) error {
	if _, err := tx.NewInsert().Model(&project).Exec(ctx); err != nil {
		return err
	}
	for position, status := range []struct{ name, category, color string }{{"Backlog", "backlog", "#94a3b8"}, {"Todo", "todo", "#60a5fa"}, {"In Progress", "in_progress", "#a78bfa"}, {"Blocked", "blocked", "#f59e0b"}, {"Done", "done", "#34d399"}} {
		statusID := uuid.New()
		item := &db.ProjectStatus{RecordFields: db.RecordFields{ID: statusID, CreatedAt: project.CreatedAt, UpdatedAt: project.CreatedAt}, ProjectID: project.ID, Name: status.name, Category: status.category, Position: position, Color: status.color, ProviderLabel: syncservice.ProviderStatusLabel(project.Key, statusID, status.name)}
		if _, err := tx.NewInsert().Model(item).Exec(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) listProjectUpdates(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "project_update.read", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	items, err := s.projectUpdateItems(c.Request.Context(), projectID, false)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load project updates"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) createProjectUpdate(c *gin.Context) {
	projectID, ok := pathUUID(c, "projectId")
	if !ok {
		return
	}
	if !s.authorize(c, "project_update.manage", &projectID) {
		return
	}
	if _, err := s.project(c, projectID); err != nil {
		notFound(c)
		return
	}
	var input struct {
		Title      string `json:"title"`
		Body       string `json:"body"`
		Visibility string `json:"visibility"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Title) == "" || strings.TrimSpace(input.Body) == "" {
		badRequest(c, errors.New("update title and body are required"))
		return
	}
	visibility := strings.ToLower(strings.TrimSpace(input.Visibility))
	if visibility == "" {
		visibility = "customer"
	}
	if visibility != "internal" && visibility != "customer" {
		badRequest(c, errors.New("update visibility must be internal or customer"))
		return
	}
	now := time.Now().UTC()
	update := db.ProjectUpdate{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: s.principal(c).Tenant.ID, ProjectID: projectID, AuthorID: uuidPtr(s.principal(c).User.ID), Title: strings.TrimSpace(input.Title), Body: strings.TrimSpace(input.Body), Visibility: visibility}
	if _, err := s.Store.DB.NewInsert().Model(&update).Exec(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not save project update"))
		return
	}
	if visibility == "customer" {
		viewerIDs, err := s.loginPageViewerIDs(c.Request.Context(), s.principal(c).Tenant.ID, projectID)
		if err == nil {
			_ = s.createNotifications(c.Request.Context(), update.TenantID, viewerIDs, "project.update", update.Title, update.Body, "")
		}
	}
	_ = s.audit(c, "project_update.created", "project_update", update.ID, map[string]any{"projectId": projectID, "visibility": visibility})
	items, err := s.projectUpdateItems(c.Request.Context(), projectID, false)
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load project update"))
		return
	}
	for _, item := range items {
		if item.ID == update.ID {
			c.JSON(http.StatusCreated, gin.H{"update": item})
			return
		}
	}
	writeError(c, http.StatusInternalServerError, errors.New("could not load project update"))
}

func (s *Server) listNotifications(c *gin.Context) {
	if !s.customerOrAuthorized(c, "notification.read") {
		return
	}
	notifications := make([]db.Notification, 0)
	if err := s.Store.DB.NewSelect().Model(&notifications).Where("tenant_id = ? AND user_id = ?", s.principal(c).Tenant.ID, s.principal(c).User.ID).Order("created_at DESC").Limit(100).Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load notifications"))
		return
	}
	items := make([]notificationResponse, 0, len(notifications))
	for _, notification := range notifications {
		items = append(items, notificationResponseFromModel(notification))
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) markNotificationRead(c *gin.Context) {
	if !s.customerOrAuthorized(c, "notification.manage") {
		return
	}
	notificationID, ok := pathUUID(c, "notificationId")
	if !ok {
		return
	}
	now := time.Now().UTC()
	result, err := s.Store.DB.NewUpdate().Model((*db.Notification)(nil)).Where("id = ? AND tenant_id = ? AND user_id = ?", notificationID, s.principal(c).Tenant.ID, s.principal(c).User.ID).Set("read_at = ?", now).Set("updated_at = ?", now).Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not mark notification read"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		notFound(c)
		return
	}
	var notification db.Notification
	if err = s.Store.DB.NewSelect().Model(&notification).Where("id = ? AND tenant_id = ? AND user_id = ?", notificationID, s.principal(c).Tenant.ID, s.principal(c).User.ID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	c.JSON(http.StatusOK, gin.H{"notification": notificationResponseFromModel(notification)})
}

func (s *Server) deleteNotification(c *gin.Context) {
	if !s.customerOrAuthorized(c, "notification.manage") {
		return
	}
	notificationID, ok := pathUUID(c, "notificationId")
	if !ok {
		return
	}
	result, err := s.Store.DB.NewDelete().Model((*db.Notification)(nil)).
		Where("id = ? AND tenant_id = ? AND user_id = ?", notificationID, s.principal(c).Tenant.ID, s.principal(c).User.ID).
		Exec(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not delete notification"))
		return
	}
	if count, _ := result.RowsAffected(); count == 0 {
		notFound(c)
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) clearNotifications(c *gin.Context) {
	if !s.customerOrAuthorized(c, "notification.manage") {
		return
	}
	if _, err := s.Store.DB.NewDelete().Model((*db.Notification)(nil)).
		Where("tenant_id = ? AND user_id = ?", s.principal(c).Tenant.ID, s.principal(c).User.ID).
		Exec(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not clear notifications"))
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) portfolio(c *gin.Context) {
	if !s.authorize(c, "portfolio.read", nil) {
		return
	}
	projects := make([]db.Project, 0)
	if err := s.Store.DB.NewSelect().Model(&projects).Where("tenant_id = ?", s.principal(c).Tenant.ID).Order("updated_at DESC").Scan(c.Request.Context()); err != nil {
		writeError(c, http.StatusInternalServerError, errors.New("could not load portfolio"))
		return
	}
	items := make([]portfolioProject, 0, len(projects))
	for _, project := range projects {
		var card portfolioProject
		card.Project = project
		var err error
		card.TaskTotal, err = s.Store.DB.NewSelect().Model((*db.Task)(nil)).Where("tenant_id = ? AND project_id = ?", project.TenantID, project.ID).Count(c.Request.Context())
		if err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not calculate portfolio task totals"))
			return
		}
		card.CompletedTasks, err = s.Store.DB.NewSelect().Model((*db.Task)(nil)).Join("JOIN project_statuses AS ps ON ps.id = ta.status_id").Where("ta.tenant_id = ? AND ta.project_id = ? AND ps.category = 'done'", project.TenantID, project.ID).Count(c.Request.Context())
		if err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not calculate portfolio completion"))
			return
		}
		card.BlockedTasks, err = s.Store.DB.NewSelect().Model((*db.Task)(nil)).Join("JOIN project_statuses AS ps ON ps.id = ta.status_id").Where("ta.tenant_id = ? AND ta.project_id = ? AND ps.category = 'blocked'", project.TenantID, project.ID).Count(c.Request.Context())
		if err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not calculate portfolio risk"))
			return
		}
		var milestone db.Milestone
		if err = s.Store.DB.NewSelect().Model(&milestone).Where("tenant_id = ? AND project_id = ? AND visibility = 'customer' AND status = 'open'", project.TenantID, project.ID).Order("due_date ASC NULLS LAST").Limit(1).Scan(c.Request.Context()); err == nil {
			card.NextMilestone = &portfolioNextMilestone{ID: milestone.ID, Name: milestone.Name, DueDate: milestone.DueDate, Status: milestone.Status}
		}
		card.ActiveCustomerPages, err = s.Store.DB.NewSelect().Model((*db.PublicPage)(nil)).Where("tenant_id = ? AND project_id = ? AND revoked = false", project.TenantID, project.ID).Count(c.Request.Context())
		if err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not calculate portfolio customer pages"))
			return
		}
		items = append(items, card)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) updatePublicPage(c *gin.Context) {
	pageID, ok := pathUUID(c, "pageId")
	if !ok {
		return
	}
	page, ok := s.publicPageForManage(c, pageID)
	if !ok {
		return
	}
	var input struct {
		Title *string `json:"title"`
		Slug  *string `json:"slug"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		badRequest(c, errors.New("invalid public page payload"))
		return
	}
	updates := make(map[string]any)
	if input.Title != nil {
		updates["title"] = strings.TrimSpace(*input.Title)
	}
	if input.Slug != nil {
		slug := strings.ToLower(strings.TrimSpace(*input.Slug))
		if !publicPageSlugPattern.MatchString(slug) {
			badRequest(c, errors.New("public page slug must contain 3-64 lowercase letters, numbers, or hyphens"))
			return
		}
		count, err := s.Store.DB.NewSelect().Model((*db.PublicPage)(nil)).Where("slug = ? AND revoked = false AND id <> ?", slug, page.ID).Count(c.Request.Context())
		if err != nil {
			writeError(c, http.StatusInternalServerError, errors.New("could not validate public page slug"))
			return
		}
		if count > 0 {
			conflict(c, "public page slug is already in use")
			return
		}
		updates["slug"] = slug
	}
	if len(updates) == 0 {
		badRequest(c, errors.New("no public page changes supplied"))
		return
	}
	updates["updated_at"] = time.Now().UTC()
	query := s.Store.DB.NewUpdate().Model((*db.PublicPage)(nil)).Where("id = ? AND tenant_id = ?", page.ID, page.TenantID)
	for field, value := range updates {
		query = query.Set(field+" = ?", value)
	}
	if _, err := query.Exec(c.Request.Context()); err != nil {
		if isPublicPageSlugConflict(err) {
			conflict(c, "public page slug is already in use")
			return
		}
		writeError(c, http.StatusInternalServerError, errors.New("could not update public page"))
		return
	}
	if err := s.Store.DB.NewSelect().Model(&page).Where("id = ?", page.ID).Scan(c.Request.Context()); err != nil {
		notFound(c)
		return
	}
	_ = s.audit(c, "public_page.updated", "public_page", page.ID, nil)
	c.JSON(http.StatusOK, gin.H{"page": page})
}

func (s *Server) projectUpdateItems(ctx context.Context, projectID uuid.UUID, customerOnly bool) ([]projectUpdateResponse, error) {
	query := s.Store.DB.NewSelect().Model((*db.ProjectUpdate)(nil)).Where("project_id = ?", projectID)
	if customerOnly {
		query = query.Where("visibility = 'customer'")
	}
	updates := make([]db.ProjectUpdate, 0)
	if err := query.Order("created_at DESC").Limit(50).Scan(ctx, &updates); err != nil {
		return nil, err
	}
	users := make(map[uuid.UUID]db.User)
	ids := make([]uuid.UUID, 0)
	for _, update := range updates {
		if update.AuthorID != nil {
			ids = append(ids, *update.AuthorID)
		}
	}
	if len(ids) > 0 {
		var records []db.User
		if err := s.Store.DB.NewSelect().Model(&records).Where("id IN (?)", bun.In(ids)).Scan(ctx); err != nil {
			return nil, err
		}
		for _, user := range records {
			users[user.ID] = user
		}
	}
	items := make([]projectUpdateResponse, 0, len(updates))
	for _, update := range updates {
		item := projectUpdateResponse{ID: update.ID, ProjectID: update.ProjectID, AuthorID: update.AuthorID, Title: update.Title, Body: update.Body, Visibility: update.Visibility, CreatedAt: update.CreatedAt, UpdatedAt: update.UpdatedAt}
		if update.AuthorID != nil {
			item.AuthorName = users[*update.AuthorID].Name
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Server) loginPageViewerIDs(ctx context.Context, tenantID, projectID uuid.UUID) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := s.Store.DB.NewSelect().Table("public_page_viewers AS pv").Column("pv.user_id").Join("JOIN public_pages AS pp ON pp.id = pv.public_page_id").Where("pp.tenant_id = ? AND pp.project_id = ? AND pp.access_mode = 'login' AND pp.revoked = false", tenantID, projectID).Distinct().Scan(ctx, &ids)
	return ids, err
}

func (s *Server) notifyRequestOwners(ctx context.Context, request db.ProjectRequest) error {
	var userIDs []uuid.UUID
	if err := s.Store.DB.NewSelect().Model((*db.Membership)(nil)).Column("user_id").Where("tenant_id = ? AND role IN ('owner', 'admin')", request.TenantID).Scan(ctx, &userIDs); err != nil {
		return err
	}
	return s.createNotifications(ctx, request.TenantID, userIDs, "project_request.submitted", "New project request", request.RequesterName+" submitted \""+request.Title+"\".", "")
}

func (s *Server) createNotifications(ctx context.Context, tenantID uuid.UUID, userIDs []uuid.UUID, kind, title, body, link string) error {
	seen := make(map[uuid.UUID]bool, len(userIDs))
	now := time.Now().UTC()
	items := make([]db.Notification, 0, len(userIDs))
	for _, userID := range userIDs {
		if userID == uuid.Nil || seen[userID] {
			continue
		}
		seen[userID] = true
		items = append(items, db.Notification{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, UserID: userID, Type: kind, Title: title, Body: body, Link: link})
	}
	if len(items) == 0 {
		return nil
	}
	_, err := s.Store.DB.NewInsert().Model(&items).Exec(ctx)
	return err
}

func (s *Server) customerOrAuthorized(c *gin.Context, permission string) bool {
	principal := s.principal(c)
	if principal == nil {
		unauthorized(c)
		return false
	}
	if principal.CustomerPageID != nil {
		return true
	}
	return s.authorize(c, permission, nil)
}

func (s *Server) isTenantUser(c *gin.Context, userID uuid.UUID) bool {
	count, err := s.Store.DB.NewSelect().Model((*db.Membership)(nil)).Where("tenant_id = ? AND user_id = ?", s.principal(c).Tenant.ID, userID).Count(c.Request.Context())
	return err == nil && count == 1
}

func (s *Server) auditTenant(ctx context.Context, tenantID uuid.UUID, actorID *uuid.UUID, action, entityType string, entityID uuid.UUID, metadata map[string]any) error {
	if metadata == nil {
		metadata = map[string]any{}
	}
	now := time.Now().UTC()
	event := &db.AuditEvent{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, ActorID: actorID, Action: action, EntityType: entityType, EntityID: entityID, Metadata: metadata}
	_, err := s.Store.DB.NewInsert().Model(event).Exec(ctx)
	return err
}

func projectRequestSummaryFromModel(request db.ProjectRequest) projectRequestSummary {
	return projectRequestSummary{ID: request.ID, TenantID: request.TenantID, SourcePublicPageID: request.SourcePublicPageID, RequesterUserID: request.RequesterUserID, RequesterName: request.RequesterName, RequesterEmail: request.RequesterEmail, Title: request.Title, Description: request.Description, RequestedStartDate: request.RequestedStartDate, RequestedTargetDate: request.RequestedTargetDate, Priority: request.Priority, Status: request.Status, AssignedTo: request.AssignedTo, InternalNotes: request.InternalNotes, ConvertedProjectID: request.ConvertedProjectID, CreatedAt: request.CreatedAt, UpdatedAt: request.UpdatedAt}
}

func notificationResponseFromModel(notification db.Notification) notificationResponse {
	return notificationResponse{ID: notification.ID, Type: notification.Type, Title: notification.Title, Body: notification.Body, Link: notification.Link, ReadAt: notification.ReadAt, CreatedAt: notification.CreatedAt}
}

func stringPtr(value string) *string { return &value }

// Kept local so customer request handling does not need to expose the auth
// package's token-comparison implementation.
func subtleConstantTimeEqual(left, right string) bool {
	if len(left) != len(right) {
		return false
	}
	var result byte
	for i := range left {
		result |= left[i] ^ right[i]
	}
	return result == 0
}

func isProjectKeyConflict(err error) bool {
	var pgErr pgdriver.Error
	return errors.As(err, &pgErr) && pgErr.Field('C') == "23505"
}
