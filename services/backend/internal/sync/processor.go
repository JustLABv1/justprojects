package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/auth"
	"github.com/JustLABv1/justprojects/services/backend/internal/config"
	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/JustLABv1/justprojects/services/backend/internal/integrations"
	gh "github.com/JustLABv1/justprojects/services/backend/internal/integrations/github"
	gitlab "github.com/JustLABv1/justprojects/services/backend/internal/integrations/gitlab"
	"github.com/JustLABv1/justprojects/services/backend/internal/queue"
	"github.com/google/uuid"
)

var errUnmatchedWebhook = errors.New("github webhook is not linked to an active connection")

// Processor contains the provider credentials needed by asynchronous jobs.
// Webhook reconciliation itself does not need a remote API token, which means
// signed deliveries can still be applied when a tenant's OAuth token expires.
type Processor struct {
	Store  *db.Store
	Config config.Config
	Cipher *auth.Cipher
}

func NewProcessor(store *db.Store, cfg config.Config) (*Processor, error) {
	cipher, err := auth.NewCipher(cfg.AppEncryptionKey)
	if err != nil {
		return nil, err
	}
	return &Processor{Store: store, Config: cfg, Cipher: cipher}, nil
}

func (p Processor) ProcessJob(ctx context.Context, job *db.OutboxJob) error {
	if job == nil {
		return errors.New("outbox job is nil")
	}
	switch job.Kind {
	case "git.webhook", "github.webhook":
		return p.processGitHubWebhook(ctx, job)
	case "git.poll", "github.poll", "gitlab.poll":
		return p.processGitPoll(ctx, job)
	case "git.import", "github.import":
		return p.processGitHubImport(ctx, job)
	case "git.issue.update", "github.issue.update":
		return p.processIssueUpdate(ctx, job)
	case "git.issue.create", "github.issue.create":
		return p.processIssueCreate(ctx, job)
	case "git.milestone.create", "github.milestone.create":
		return p.processMilestoneCreate(ctx, job)
	case "git.milestone.update", "github.milestone.update":
		return p.processMilestoneUpdate(ctx, job)
	case "git.conflict.resolved", "github.conflict.resolved":
		return p.processConflictResolution(ctx, job)
	default:
		return fmt.Errorf("unknown job kind %q", job.Kind)
	}
}

type webhookRepository struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Private  bool   `json:"private"`
	FullName string `json:"full_name"`
	Owner    struct {
		Login string `json:"login"`
	} `json:"owner"`
}

type webhookInstallation struct {
	ID int64 `json:"id"`
}

type webhookLabel struct {
	Name string `json:"name"`
}

type webhookAssignee struct {
	Login string `json:"login"`
}

type webhookMilestone struct {
	ID          int64      `json:"id"`
	Number      int        `json:"number"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	State       string     `json:"state"`
	DueOn       *time.Time `json:"due_on"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type webhookIssue struct {
	ID        int64             `json:"id"`
	Number    int               `json:"number"`
	Title     string            `json:"title"`
	Body      string            `json:"body"`
	State     string            `json:"state"`
	HTMLURL   string            `json:"html_url"`
	UpdatedAt time.Time         `json:"updated_at"`
	Labels    []webhookLabel    `json:"labels"`
	Assignees []webhookAssignee `json:"assignees"`
	Milestone *webhookMilestone `json:"milestone"`
}

type gitlabWebhookProject struct {
	ID                int64  `json:"id"`
	Name              string `json:"name"`
	PathWithNamespace string `json:"path_with_namespace"`
	Visibility        string `json:"visibility"`
	Namespace         struct {
		FullPath string `json:"full_path"`
	} `json:"namespace"`
}

type gitlabWebhookLabel struct {
	Title string `json:"title"`
	Name  string `json:"name"`
}

type gitlabWebhookAssignee struct {
	Username string `json:"username"`
	Name     string `json:"name"`
}

type gitlabWebhookMilestone struct {
	ID          int64  `json:"id"`
	IID         int    `json:"iid"`
	Title       string `json:"title"`
	Description string `json:"description"`
	State       string `json:"state"`
	DueDate     string `json:"due_date"`
	UpdatedAt   string `json:"updated_at"`
}

type gitlabWebhookIssue struct {
	ID          int64                   `json:"id"`
	IID         int                     `json:"iid"`
	Title       string                  `json:"title"`
	Description string                  `json:"description"`
	State       string                  `json:"state"`
	URL         string                  `json:"url"`
	WebURL      string                  `json:"web_url"`
	UpdatedAt   string                  `json:"updated_at"`
	Labels      []gitlabWebhookLabel    `json:"labels"`
	Assignees   []gitlabWebhookAssignee `json:"assignees"`
	Milestone   *gitlabWebhookMilestone `json:"milestone"`
}

func parseWebhookTime(value string) time.Time {
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05 MST"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func gitlabRemoteMilestone(value gitlabWebhookMilestone) gh.Milestone {
	var dueOn *time.Time
	if value.DueDate != "" {
		if parsed, err := time.Parse("2006-01-02", value.DueDate); err == nil {
			dueOn = &parsed
		}
	}
	return gh.Milestone{ID: value.ID, Number: value.IID, Title: value.Title, Description: value.Description, State: value.State, DueOn: dueOn, UpdatedAt: parseWebhookTime(value.UpdatedAt)}
}

func gitlabRemoteIssue(value gitlabWebhookIssue) gh.Issue {
	state := value.State
	if state == "opened" {
		state = "open"
	}
	remote := gh.Issue{ID: value.ID, Number: value.IID, Title: value.Title, Body: value.Description, State: state, HTMLURL: value.WebURL, UpdatedAt: parseWebhookTime(value.UpdatedAt)}
	if remote.HTMLURL == "" {
		remote.HTMLURL = value.URL
	}
	for _, label := range value.Labels {
		name := label.Title
		if name == "" {
			name = label.Name
		}
		remote.Labels = append(remote.Labels, name)
	}
	for _, assignee := range value.Assignees {
		login := assignee.Username
		if login == "" {
			login = assignee.Name
		}
		if login != "" {
			remote.Assignees = append(remote.Assignees, login)
		}
	}
	if value.Milestone != nil {
		milestone := gitlabRemoteMilestone(*value.Milestone)
		remote.Milestone = &milestone
	}
	return remote
}

func decodePayload(payload map[string]any, target any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return json.Unmarshal(encoded, target)
}

func decodeNested(payload map[string]any, key string, target any) error {
	value, ok := payload[key]
	if !ok {
		return fmt.Errorf("webhook payload has no %s", key)
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(encoded, target)
}

func webhookRemoteIssue(issue webhookIssue) gh.Issue {
	remote := gh.Issue{ID: issue.ID, Number: issue.Number, Title: issue.Title, Body: issue.Body, State: issue.State, HTMLURL: issue.HTMLURL, UpdatedAt: issue.UpdatedAt}
	for _, label := range issue.Labels {
		remote.Labels = append(remote.Labels, label.Name)
	}
	for _, assignee := range issue.Assignees {
		remote.Assignees = append(remote.Assignees, assignee.Login)
	}
	if issue.Milestone != nil {
		remote.Milestone = &gh.Milestone{ID: issue.Milestone.ID, Number: issue.Milestone.Number, Title: issue.Milestone.Title, Description: issue.Milestone.Description, State: issue.Milestone.State, DueOn: issue.Milestone.DueOn, UpdatedAt: issue.Milestone.UpdatedAt}
	}
	return remote
}

func webhookRemoteMilestone(milestone webhookMilestone) gh.Milestone {
	return gh.Milestone{ID: milestone.ID, Number: milestone.Number, Title: milestone.Title, Description: milestone.Description, State: milestone.State, DueOn: milestone.DueOn, UpdatedAt: milestone.UpdatedAt}
}

func (p Processor) processGitHubWebhook(ctx context.Context, job *db.OutboxJob) (returnErr error) {
	if provider, ok := stringPayload(job.Payload, "provider"); ok && provider == "gitlab" {
		return p.processGitLabWebhook(ctx, job)
	}
	deliveryID, ok := stringPayload(job.Payload, "deliveryId")
	if !ok {
		return errors.New("github webhook job has no delivery id")
	}
	var event db.SyncEvent
	if err := p.Store.DB.NewSelect().Model(&event).Where("delivery_id = ?", deliveryID).Scan(ctx); err != nil {
		return fmt.Errorf("load github delivery: %w", err)
	}
	if event.Status == "succeeded" {
		return nil
	}
	if err := p.setSyncEvent(ctx, event.ID, "processing", nil, nil, ""); err != nil {
		return err
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			panicErr := fmt.Errorf("github webhook reconciliation panic: %v", recovered)
			if markErr := p.failSyncEvent(ctx, event.ID, panicErr); markErr != nil {
				returnErr = fmt.Errorf("%w; mark delivery failed: %v", panicErr, markErr)
			} else {
				returnErr = panicErr
			}
			slog.Error("github webhook reconciliation panic", "delivery_id", deliveryID, "error", returnErr)
		}
	}()

	var repositoryPayload webhookRepository
	if err := decodeNested(event.Payload, "repository", &repositoryPayload); err != nil || repositoryPayload.ID == 0 {
		return p.failSyncEvent(ctx, event.ID, fmt.Errorf("decode github repository: %w", err))
	}
	var installation webhookInstallation
	_ = decodeNested(event.Payload, "installation", &installation)
	connection, repository, err := p.resolveWebhookRepository(ctx, repositoryPayload, installation.ID)
	if err != nil {
		if errors.Is(err, errUnmatchedWebhook) {
			_ = p.setSyncEvent(ctx, event.ID, "succeeded", nil, nil, "")
			return nil
		}
		return p.failSyncEvent(ctx, event.ID, err)
	}
	connectionID := connection.ID
	tenantID := connection.TenantID
	if err = p.setSyncEvent(ctx, event.ID, "processing", &tenantID, &connectionID, ""); err != nil {
		return err
	}

	var project db.Project
	if err = p.Store.DB.NewSelect().Model(&project).
		Join("JOIN project_repositories AS pr ON pr.project_id = p.id").
		Where("pr.repository_id = ? AND p.tenant_id = ?", repository.ID, tenantID).
		Order("p.created_at ASC").Limit(1).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return p.setSyncEvent(ctx, event.ID, "succeeded", &tenantID, &connectionID, "")
		}
		return p.failSyncEvent(ctx, event.ID, fmt.Errorf("find linked project: %w", err))
	}

	switch event.EventName {
	case "issues":
		var payload struct {
			Issue webhookIssue `json:"issue"`
		}
		if err = decodePayload(event.Payload, &payload); err != nil || payload.Issue.ID == 0 {
			return p.failSyncEvent(ctx, event.ID, fmt.Errorf("decode github issue: %w", err))
		}
		remote := webhookRemoteIssue(payload.Issue)
		if remote.UpdatedAt.IsZero() {
			remote.UpdatedAt = event.CreatedAt
		}
		err = p.reconcileIssue(ctx, tenantID, project, repository, remote, deliveryID, remote.UpdatedAt)
	case "milestone":
		var payload struct {
			Milestone webhookMilestone `json:"milestone"`
		}
		if err = decodePayload(event.Payload, &payload); err != nil || payload.Milestone.ID == 0 {
			return p.failSyncEvent(ctx, event.ID, fmt.Errorf("decode github milestone: %w", err))
		}
		remote := webhookRemoteMilestone(payload.Milestone)
		if remote.UpdatedAt.IsZero() {
			remote.UpdatedAt = event.CreatedAt
		}
		_, err = p.reconcileMilestone(ctx, tenantID, project, repository, remote, deliveryID, remote.UpdatedAt)
	default:
		// Other GitHub events are intentionally persisted for auditability but do
		// not mutate the product's issue/milestone projection.
		err = nil
	}
	if err != nil {
		return p.failSyncEvent(ctx, event.ID, err)
	}
	return p.setSyncEvent(ctx, event.ID, "succeeded", &tenantID, &connectionID, "")
}

func (p Processor) processGitLabWebhook(ctx context.Context, job *db.OutboxJob) (returnErr error) {
	deliveryID, ok := stringPayload(job.Payload, "deliveryId")
	if !ok {
		return errors.New("gitlab webhook job has no delivery id")
	}
	var event db.SyncEvent
	if err := p.Store.DB.NewSelect().Model(&event).Where("delivery_id = ? AND provider = 'gitlab'", deliveryID).Scan(ctx); err != nil {
		return fmt.Errorf("load gitlab delivery: %w", err)
	}
	if event.Status == "succeeded" {
		return nil
	}
	if err := p.setSyncEvent(ctx, event.ID, "processing", event.TenantID, event.ConnectionID, ""); err != nil {
		return err
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			panicErr := fmt.Errorf("gitlab webhook reconciliation panic: %v", recovered)
			if markErr := p.failSyncEvent(ctx, event.ID, panicErr); markErr != nil {
				returnErr = fmt.Errorf("%w; mark delivery failed: %v", panicErr, markErr)
			} else {
				returnErr = panicErr
			}
			slog.Error("gitlab webhook reconciliation panic", "delivery_id", deliveryID, "error", returnErr)
		}
	}()

	var projectPayload gitlabWebhookProject
	if err := decodeNested(event.Payload, "project", &projectPayload); err != nil || projectPayload.ID == 0 {
		return p.failSyncEvent(ctx, event.ID, errors.New("decode gitlab project"))
	}
	var connection db.GitConnection
	if event.ConnectionID != nil {
		if event.TenantID == nil {
			return p.failSyncEvent(ctx, event.ID, errors.New("gitlab delivery has no tenant"))
		}
		if err := p.Store.DB.NewSelect().Model(&connection).Where("id = ? AND tenant_id = ? AND provider = 'gitlab' AND active = true", *event.ConnectionID, *event.TenantID).Scan(ctx); err != nil {
			return p.failSyncEvent(ctx, event.ID, fmt.Errorf("load gitlab connection: %w", err))
		}
	} else {
		if err := p.Store.DB.NewSelect().Model(&connection).Join("JOIN git_repositories AS gr ON gr.connection_id = gc.id").Where("gr.external_id = ? AND gc.provider = 'gitlab' AND gc.active = true").Order("gc.created_at ASC").Limit(1).Scan(ctx); err != nil {
			return p.failSyncEvent(ctx, event.ID, fmt.Errorf("resolve gitlab connection: %w", err))
		}
	}
	var repository db.GitRepository
	if err := p.Store.DB.NewSelect().Model(&repository).Where("connection_id = ? AND external_id = ?", connection.ID, projectPayload.ID).Scan(ctx); err != nil {
		return p.failSyncEvent(ctx, event.ID, fmt.Errorf("resolve gitlab repository: %w", err))
	}
	var project db.Project
	if err := p.Store.DB.NewSelect().Model(&project).
		Join("JOIN project_repositories AS pr ON pr.project_id = p.id").
		Where("pr.repository_id = ? AND p.tenant_id = ?", repository.ID, connection.TenantID).
		Order("p.created_at ASC").Limit(1).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return p.setSyncEvent(ctx, event.ID, "succeeded", &connection.TenantID, &connection.ID, "")
		}
		return p.failSyncEvent(ctx, event.ID, fmt.Errorf("find linked gitlab project: %w", err))
	}
	eventName := strings.ToLower(event.EventName)
	var syncErr error
	switch {
	case strings.Contains(eventName, "milestone"):
		var payload struct {
			Attributes gitlabWebhookMilestone `json:"object_attributes"`
		}
		if err := decodePayload(event.Payload, &payload); err != nil || payload.Attributes.ID == 0 {
			syncErr = errors.New("decode gitlab milestone")
		} else {
			remote := gitlabRemoteMilestone(payload.Attributes)
			if remote.UpdatedAt.IsZero() {
				remote.UpdatedAt = event.CreatedAt
			}
			_, syncErr = p.reconcileMilestone(ctx, connection.TenantID, project, repository, remote, deliveryID, remote.UpdatedAt)
		}
	case strings.Contains(eventName, "issue"):
		var payload struct {
			Attributes gitlabWebhookIssue `json:"object_attributes"`
		}
		if err := decodePayload(event.Payload, &payload); err != nil || payload.Attributes.ID == 0 {
			syncErr = errors.New("decode gitlab issue")
		} else {
			remote := gitlabRemoteIssue(payload.Attributes)
			if remote.UpdatedAt.IsZero() {
				remote.UpdatedAt = event.CreatedAt
			}
			syncErr = p.reconcileIssue(ctx, connection.TenantID, project, repository, remote, deliveryID, remote.UpdatedAt)
		}
	}
	if syncErr != nil {
		return p.failSyncEvent(ctx, event.ID, syncErr)
	}
	return p.setSyncEvent(ctx, event.ID, "succeeded", &connection.TenantID, &connection.ID, "")
}

func (p Processor) setSyncEvent(ctx context.Context, eventID uuid.UUID, status string, tenantID, connectionID *uuid.UUID, message string) error {
	query := p.Store.DB.NewUpdate().Model((*db.SyncEvent)(nil)).Set("status = ?", status).Set("updated_at = ?", time.Now().UTC())
	if tenantID != nil {
		query = query.Set("tenant_id = ?", *tenantID)
	}
	if connectionID != nil {
		query = query.Set("connection_id = ?", *connectionID)
	}
	if message != "" {
		query = query.Set("error_message = ?", message)
	} else {
		query = query.Set("error_message = NULL")
	}
	if _, err := query.Where("id = ?", eventID).Exec(ctx); err != nil {
		return err
	}
	level := "info"
	phase := status
	statusMessage := "Sync run status changed to " + status
	if status == "failed" {
		level = "error"
		phase = "failed"
		statusMessage = "Sync run failed"
		if message != "" {
			statusMessage += ": " + message
		}
	} else if status == "succeeded" {
		phase = "completed"
		statusMessage = "Sync run completed successfully"
	} else if status == "processing" {
		phase = "started"
		statusMessage = "Sync run started"
	}
	p.appendSyncLog(ctx, eventID, tenantID, level, phase, statusMessage, nil)
	if status == "succeeded" || status == "failed" {
		if notifyErr := p.notifySyncEvent(ctx, eventID, status, message); notifyErr != nil {
			slog.Default().Warn("could not create sync notification", "sync_event_id", eventID, "status", status, "error", notifyErr)
		}
	}
	return nil
}

func (p Processor) appendSyncLog(ctx context.Context, eventID uuid.UUID, tenantID *uuid.UUID, level, phase, message string, metadata map[string]any) {
	if eventID == uuid.Nil {
		return
	}
	if tenantID == nil || *tenantID == uuid.Nil {
		var event db.SyncEvent
		if err := p.Store.DB.NewSelect().Model(&event).Column("tenant_id").Where("id = ?", eventID).Scan(ctx); err != nil || event.TenantID == nil {
			if err != nil {
				slog.Default().Warn("could not resolve sync log tenant", "sync_event_id", eventID, "error", err)
			}
			return
		}
		tenantID = event.TenantID
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	item := &db.SyncEventLog{
		RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()},
		TenantID:     *tenantID,
		SyncEventID:  eventID,
		Level:        level,
		Phase:        phase,
		Message:      message,
		Metadata:     metadata,
	}
	logAttrs := []any{"sync_event_id", eventID, "phase", phase, "message", message}
	if len(metadata) > 0 {
		logAttrs = append(logAttrs, "metadata", metadata)
	}
	switch level {
	case "debug":
		slog.Default().Debug("sync activity", logAttrs...)
	case "warn":
		slog.Default().Warn("sync activity", logAttrs...)
	case "error":
		slog.Default().Error("sync activity", logAttrs...)
	default:
		slog.Default().Info("sync activity", logAttrs...)
	}
	if _, err := p.Store.DB.NewInsert().Model(item).Exec(ctx); err != nil {
		slog.Default().Warn("could not append sync event log", "sync_event_id", eventID, "phase", phase, "error", err)
	}
}

func (p Processor) notifySyncEvent(ctx context.Context, eventID uuid.UUID, status, message string) error {
	var event db.SyncEvent
	if err := p.Store.DB.NewSelect().Model(&event).Where("id = ?", eventID).Scan(ctx); err != nil {
		return err
	}
	if event.TenantID == nil || *event.TenantID == uuid.Nil {
		return nil
	}
	// Successful webhook deliveries are intentionally quiet; a successful
	// manual import is useful feedback, while every failed run is actionable.
	if status == "succeeded" && event.EventName != "import" {
		return nil
	}
	provider := event.Provider
	if provider == "" {
		provider = "github"
	}
	providerName := provider
	switch provider {
	case "github":
		providerName = "GitHub"
	case "gitlab":
		providerName = "GitLab"
	}
	resource := strings.ReplaceAll(event.EventName, ".", " ")
	if resource == "" {
		resource = "sync"
	}
	projectName := "workspace"
	link := "/app?syncRun=" + event.ID.String()
	if raw, ok := stringPayload(event.Payload, "projectId"); ok {
		if projectID, parseErr := uuid.Parse(raw); parseErr == nil {
			var project db.Project
			if projectErr := p.Store.DB.NewSelect().Model(&project).Where("id = ? AND tenant_id = ?", projectID, *event.TenantID).Scan(ctx); projectErr == nil {
				projectName = project.Name
				link = "/app/projects/" + strings.ToLower(project.Key) + "/integrations?syncRun=" + event.ID.String()
			}
		}
	}
	typeAndTitle := "sync.completed"
	title := providerName + " sync completed"
	body := fmt.Sprintf("%s %s for %s completed.", providerName, resource, projectName)
	if status == "failed" {
		typeAndTitle = "sync.failed"
		title = providerName + " sync failed"
		body = fmt.Sprintf("%s %s for %s failed.", providerName, resource, projectName)
		if message != "" {
			body += " " + message
		}
	}
	var members []db.Membership
	if err := p.Store.DB.NewSelect().Model(&members).Where("tenant_id = ?", *event.TenantID).Scan(ctx); err != nil {
		return err
	}
	for _, member := range members {
		count, err := p.Store.DB.NewSelect().Model((*db.Notification)(nil)).Where("tenant_id = ? AND user_id = ? AND type = ? AND link = ?", *event.TenantID, member.UserID, typeAndTitle, link).Count(ctx)
		if err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		now := time.Now().UTC()
		notification := &db.Notification{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: *event.TenantID, UserID: member.UserID, Type: typeAndTitle, Title: title, Body: body, Link: link}
		if _, err := p.Store.DB.NewInsert().Model(notification).Exec(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (p Processor) failSyncEvent(ctx context.Context, eventID uuid.UUID, eventErr error) error {
	if updateErr := p.setSyncEvent(ctx, eventID, "failed", nil, nil, eventErr.Error()); updateErr != nil {
		return fmt.Errorf("%w; mark delivery failed: %v", eventErr, updateErr)
	}
	return eventErr
}

func (p Processor) resolveWebhookRepository(ctx context.Context, remote webhookRepository, installationID int64) (db.GitConnection, db.GitRepository, error) {
	var connection db.GitConnection
	if installationID > 0 {
		if err := p.Store.DB.NewSelect().Model(&connection).
			Where("active = true AND provider = 'github' AND auth_method = 'app' AND (installation_id = ? OR external_account_id = ?)", installationID, installationID).
			Limit(1).Scan(ctx); err != nil {
			return db.GitConnection{}, db.GitRepository{}, errUnmatchedWebhook
		}
	} else {
		var stored db.GitRepository
		if err := p.Store.DB.NewSelect().Model(&stored).Join("JOIN git_connections AS c ON c.id = gr.connection_id").Where("gr.external_id = ? AND c.provider = 'github' AND c.active = true", remote.ID).Order("gr.created_at ASC").Limit(1).Scan(ctx); err != nil {
			return db.GitConnection{}, db.GitRepository{}, errUnmatchedWebhook
		}
		if err := p.Store.DB.NewSelect().Model(&connection).Where("id = ? AND provider = 'github' AND active = true", stored.ConnectionID).Scan(ctx); err != nil {
			return db.GitConnection{}, db.GitRepository{}, errUnmatchedWebhook
		}
	}
	if remote.FullName == "" {
		remote.FullName = remote.Owner.Login + "/" + remote.Name
	}
	var repository db.GitRepository
	if err := p.Store.DB.NewSelect().Model(&repository).Where("connection_id = ? AND external_id = ?", connection.ID, remote.ID).Scan(ctx); err == nil {
		_, err = p.Store.DB.NewUpdate().Model((*db.GitRepository)(nil)).Set("owner = ?", remote.Owner.Login).Set("name = ?", remote.Name).Set("full_name = ?", remote.FullName).Set("private = ?", remote.Private).Set("updated_at = ?", time.Now().UTC()).Where("id = ?", repository.ID).Exec(ctx)
		return connection, repository, err
	} else if !errors.Is(err, sql.ErrNoRows) {
		return db.GitConnection{}, db.GitRepository{}, err
	}
	now := time.Now().UTC()
	repository = db.GitRepository{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, ConnectionID: connection.ID, ExternalID: remote.ID, Owner: remote.Owner.Login, Name: remote.Name, FullName: remote.FullName, Private: remote.Private}
	if _, err := p.Store.DB.NewInsert().Model(&repository).Exec(ctx); err != nil {
		// A concurrent delivery may have created the repository. Re-read it so
		// both deliveries converge on the same local identity.
		if readErr := p.Store.DB.NewSelect().Model(&repository).Where("connection_id = ? AND external_id = ?", connection.ID, remote.ID).Scan(ctx); readErr != nil {
			return db.GitConnection{}, db.GitRepository{}, err
		}
	}
	return connection, repository, nil
}

func stringPayload(payload map[string]any, key string) (string, bool) {
	value, ok := payload[key].(string)
	return value, ok && strings.TrimSpace(value) != ""
}

func (p Processor) reconcileIssue(ctx context.Context, tenantID uuid.UUID, project db.Project, repository db.GitRepository, remote gh.Issue, deliveryID string, remoteTime time.Time) error {
	if remoteTime.IsZero() {
		remoteTime = time.Now().UTC()
	}
	provider, err := p.repositoryProvider(ctx, repository.ID)
	if err != nil {
		return err
	}
	var statuses []db.ProjectStatus
	if err := p.Store.DB.NewSelect().Model(&statuses).Where("project_id = ?", project.ID).Order("position ASC").Scan(ctx); err != nil {
		return fmt.Errorf("load project statuses: %w", err)
	}
	statusID, ok, statusFromLabel, err := StatusForRemoteIssue(project.Key, statuses, remote.State, remote.Labels)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("project has no compatible status for provider issue")
	}
	var milestoneID *uuid.UUID
	if remote.Milestone != nil {
		resolved, err := p.reconcileMilestone(ctx, tenantID, project, repository, *remote.Milestone, deliveryID, remoteTime)
		if err != nil {
			return err
		}
		milestoneID = &resolved
	}
	ordinaryLabels := ordinaryProviderLabels(remote.Labels)
	remoteStatusLabels := WorkflowStatusLabels(project.Key, statuses, remote.Labels)
	labelIDs, err := p.ensureLabels(ctx, tenantID, project.ID, ordinaryLabels)
	if err != nil {
		return err
	}
	assigneeID, err := p.assigneeID(ctx, tenantID, provider, remote.Assignees)
	if err != nil {
		return err
	}
	var link db.ExternalLink
	linkErr := p.Store.DB.NewSelect().Model(&link).Where("repository_id = ? AND external_type = 'issue' AND external_id = ?", repository.ID, remote.ID).Scan(ctx)
	if errors.Is(linkErr, sql.ErrNoRows) {
		now := time.Now().UTC()
		task := db.Task{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, ProjectID: project.ID, MilestoneID: milestoneID, StatusID: statusID, Title: remote.Title, Description: remote.Body, Priority: "medium", AssigneeID: assigneeID, Visibility: "internal", Version: 1}
		if _, err = p.Store.DB.NewInsert().Model(&task).Exec(ctx); err != nil {
			return fmt.Errorf("create imported github issue: %w", err)
		}
		if err = p.replaceTaskLabels(ctx, task.ID, labelIDs); err != nil {
			return fmt.Errorf("save imported issue labels: %w", err)
		}
		link = db.ExternalLink{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, RepositoryID: repository.ID, LocalType: "task", LocalID: task.ID, ExternalType: "issue", ExternalID: remote.ID, ExternalNumber: remote.Number, RemoteUpdatedAt: timePtr(remoteTime), FieldSnapshot: issueSnapshot(project.Key, statuses, remote)}
		if _, err = p.Store.DB.NewInsert().Model(&link).Exec(ctx); err != nil {
			return fmt.Errorf("link imported github issue: %w", err)
		}
		return nil
	}
	if linkErr != nil {
		return fmt.Errorf("load github issue link: %w", linkErr)
	}
	if link.RemoteUpdatedAt != nil && !remoteTime.After(*link.RemoteUpdatedAt) {
		// GitHub can deliver events out of order. A delivery at or before the
		// snapshot already applied cannot safely move the local projection back.
		return nil
	}
	var task db.Task
	if err = p.Store.DB.NewSelect().Model(&task).Where("id = ? AND tenant_id = ? AND project_id = ?", link.LocalID, tenantID, project.ID).Scan(ctx); err != nil {
		return fmt.Errorf("load linked task: %w", err)
	}
	currentLabels, err := p.taskLabelNames(ctx, task.ID)
	if err != nil {
		return err
	}
	localMilestoneExternalID, err := p.localMilestoneExternalID(ctx, repository.ID, task.MilestoneID)
	if err != nil {
		return err
	}
	localValues := map[string]any{
		"title":          task.Title,
		"body":           task.Description,
		"state":          localTaskState(task, statuses),
		"labels":         currentLabels,
		"workflowStatus": []string{},
		"milestone":      localMilestoneExternalID,
	}
	if localStatusLabel, found := ProviderStatusLabelForStatus(project.Key, statuses, task.StatusID); found {
		localValues["workflowStatus"] = []string{localStatusLabel}
	}
	remoteValues := issueSnapshot(project.Key, statuses, remote)
	base := link.FieldSnapshot
	if base == nil {
		base = map[string]any{}
	}
	baseWorkflowStatus, hadBaseWorkflowStatus := stringSlice(base["workflowStatus"])
	workflowStatusRemoteChanged := !hadBaseWorkflowStatus || !valuesEqual(baseWorkflowStatus, remoteValues["workflowStatus"])
	if baseState, ok := stringValue(base["state"]); ok {
		// GitLab historically persisted "opened" while the normalized sync
		// snapshot uses "open". Normalize old snapshots before conflict checks.
		base["state"] = normalizedRemoteIssueState(baseState)
	}
	currentAssignees, err := p.taskAssigneeLogins(ctx, tenantID, provider, task.AssigneeID)
	if err != nil {
		return err
	}
	// A provider login without a local mapping is intentionally represented by
	// a nil local assignee. Treat the last remote snapshot as the local value
	// for conflict detection so importing an issue does not manufacture an
	// assignee conflict (or erase the remote assignment on the next update).
	if task.AssigneeID == nil || len(currentAssignees) == 0 {
		if snapshotAssignees, ok := stringSlice(base["assignees"]); ok {
			currentAssignees = canonicalStrings(snapshotAssignees)
		}
	}
	localValues["assignees"] = currentAssignees
	lastRemote := time.Time{}
	if link.RemoteUpdatedAt != nil {
		lastRemote = *link.RemoteUpdatedAt
	}
	blocked := make(map[string]bool)
	remoteChangedFields := make(map[string]bool)
	for _, field := range SynchronizedFields {
		baseValue, hasBase := base[field]
		remoteChanged := !hasBase || !valuesEqual(baseValue, remoteValues[field])
		remoteChangedFields[field] = remoteChanged
		localChanged := hasBase && !valuesEqual(baseValue, localValues[field])
		if hasBase && remoteChanged && localChanged && task.UpdatedAt.After(lastRemote) && remoteTime.After(lastRemote) {
			blocked[field] = true
			if err = p.upsertConflict(ctx, tenantID, link.ID, field, localValues[field], remoteValues[field], task.UpdatedAt, remoteTime, deliveryID); err != nil {
				return err
			}
			continue
		}
		if remoteChanged {
			base[field] = remoteValues[field]
		}
	}

	updates := make(map[string]any)
	if !blocked["title"] && !valuesEqual(localValues["title"], remoteValues["title"]) {
		updates["title"] = remote.Title
	}
	if !blocked["body"] && !valuesEqual(localValues["body"], remoteValues["body"]) {
		updates["description"] = remote.Body
	}
	remoteStatusChange := false
	if remoteChangedFields["state"] && !valuesEqual(localValues["state"], remoteValues["state"]) {
		remoteStatusChange = true
	}
	if workflowStatusRemoteChanged && !valuesEqual(localValues["workflowStatus"], remoteValues["workflowStatus"]) {
		// A valid managed label selects the exact custom workflow status. If a
		// previously managed label was removed upstream, the provider state
		// fallback (normally Todo) becomes the local status. Legacy links with
		// no workflow snapshot are left untouched and repaired to their current
		// local status instead.
		if statusFromLabel || (hadBaseWorkflowStatus && len(baseWorkflowStatus) > 0 && len(remoteStatusLabels) == 0) {
			remoteStatusChange = true
		}
	}
	if remoteStatusChange && !blocked["state"] && !blocked["workflowStatus"] {
		updates["status_id"] = statusID
	}
	if !blocked["milestone"] && !valuesEqual(localValues["milestone"], remoteValues["milestone"]) {
		updates["milestone_id"] = milestoneID
	}
	if !blocked["assignees"] && !valuesEqual(localValues["assignees"], remoteValues["assignees"]) && (len(remote.Assignees) == 0 || assigneeID != nil) {
		updates["assignee_id"] = assigneeID
	}
	if len(updates) > 0 {
		query := p.Store.DB.NewUpdate().Model((*db.Task)(nil)).Set("updated_at = ?", time.Now().UTC()).Set("version = version + 1")
		for field, value := range updates {
			query = query.Set(field+" = ?", value)
		}
		if _, err = query.Where("id = ? AND tenant_id = ?", task.ID, tenantID).Exec(ctx); err != nil {
			return fmt.Errorf("apply github issue update: %w", err)
		}
	}
	if !blocked["labels"] && !valuesEqual(localValues["labels"], remoteValues["labels"]) {
		if err = p.replaceTaskLabels(ctx, task.ID, labelIDs); err != nil {
			return fmt.Errorf("apply github issue labels: %w", err)
		}
	}
	return p.updateExternalLink(ctx, link, base, remoteTime)
}

func (p Processor) reconcileMilestone(ctx context.Context, tenantID uuid.UUID, project db.Project, repository db.GitRepository, remote gh.Milestone, deliveryID string, remoteTime time.Time) (uuid.UUID, error) {
	if remoteTime.IsZero() {
		remoteTime = time.Now().UTC()
	}
	var link db.ExternalLink
	linkErr := p.Store.DB.NewSelect().Model(&link).Where("repository_id = ? AND external_type = 'milestone' AND external_id = ?", repository.ID, remote.ID).Scan(ctx)
	if errors.Is(linkErr, sql.ErrNoRows) {
		now := time.Now().UTC()
		milestone := db.Milestone{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, ProjectID: project.ID, Name: remote.Title, Description: remote.Description, DueDate: datePtr(remote.DueOn), Status: milestoneState(remote.State), Visibility: "internal", Version: 1}
		if _, err := p.Store.DB.NewInsert().Model(&milestone).Exec(ctx); err != nil {
			return uuid.Nil, fmt.Errorf("create imported github milestone: %w", err)
		}
		link = db.ExternalLink{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, RepositoryID: repository.ID, LocalType: "milestone", LocalID: milestone.ID, ExternalType: "milestone", ExternalID: remote.ID, ExternalNumber: remote.Number, RemoteUpdatedAt: timePtr(remoteTime), FieldSnapshot: milestoneSnapshot(remote)}
		if _, err := p.Store.DB.NewInsert().Model(&link).Exec(ctx); err != nil {
			return uuid.Nil, fmt.Errorf("link imported github milestone: %w", err)
		}
		return milestone.ID, nil
	}
	if linkErr != nil {
		return uuid.Nil, fmt.Errorf("load github milestone link: %w", linkErr)
	}
	if link.RemoteUpdatedAt != nil && !remoteTime.After(*link.RemoteUpdatedAt) {
		return link.LocalID, nil
	}
	var milestone db.Milestone
	if err := p.Store.DB.NewSelect().Model(&milestone).Where("id = ? AND tenant_id = ? AND project_id = ?", link.LocalID, tenantID, project.ID).Scan(ctx); err != nil {
		return uuid.Nil, fmt.Errorf("load linked milestone: %w", err)
	}
	localValues := map[string]any{"title": milestone.Name, "body": milestone.Description, "state": milestone.Status, "dueDate": dateValue(milestone.DueDate)}
	remoteValues := milestoneSnapshot(remote)
	base := link.FieldSnapshot
	if base == nil {
		base = map[string]any{}
	}
	lastRemote := time.Time{}
	if link.RemoteUpdatedAt != nil {
		lastRemote = *link.RemoteUpdatedAt
	}
	blocked := make(map[string]bool)
	for _, field := range []string{"title", "body", "state", "dueDate"} {
		baseValue, hasBase := base[field]
		remoteChanged := !hasBase || !valuesEqual(baseValue, remoteValues[field])
		localChanged := hasBase && !valuesEqual(baseValue, localValues[field])
		if hasBase && remoteChanged && localChanged && milestone.UpdatedAt.After(lastRemote) && remoteTime.After(lastRemote) {
			blocked[field] = true
			if err := p.upsertConflict(ctx, tenantID, link.ID, field, localValues[field], remoteValues[field], milestone.UpdatedAt, remoteTime, deliveryID); err != nil {
				return uuid.Nil, err
			}
			continue
		}
		if remoteChanged {
			base[field] = remoteValues[field]
		}
	}
	updates := make(map[string]any)
	if !blocked["title"] && !valuesEqual(localValues["title"], remoteValues["title"]) {
		updates["name"] = remote.Title
	}
	if !blocked["body"] && !valuesEqual(localValues["body"], remoteValues["body"]) {
		updates["description"] = remote.Description
	}
	if !blocked["state"] && !valuesEqual(localValues["state"], remoteValues["state"]) {
		updates["status"] = milestoneState(remote.State)
	}
	if !blocked["dueDate"] && !valuesEqual(localValues["dueDate"], remoteValues["dueDate"]) {
		updates["due_date"] = datePtr(remote.DueOn)
	}
	if len(updates) > 0 {
		query := p.Store.DB.NewUpdate().Model((*db.Milestone)(nil)).Set("updated_at = ?", time.Now().UTC()).Set("version = version + 1")
		for field, value := range updates {
			query = query.Set(field+" = ?", value)
		}
		if _, err := query.Where("id = ? AND tenant_id = ?", milestone.ID, tenantID).Exec(ctx); err != nil {
			return uuid.Nil, fmt.Errorf("apply github milestone update: %w", err)
		}
	}
	if err := p.updateExternalLink(ctx, link, base, remoteTime); err != nil {
		return uuid.Nil, err
	}
	return milestone.ID, nil
}

func (p Processor) upsertConflict(ctx context.Context, tenantID, linkID uuid.UUID, field string, localValue, remoteValue any, localAt, remoteAt time.Time, deliveryID string) error {
	conflict := &db.SyncConflict{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}, TenantID: tenantID, ExternalLinkID: linkID, Field: field, LocalValue: localValue, RemoteValue: remoteValue, LocalChangedAt: localAt, RemoteChangedAt: remoteAt, DeliveryID: deliveryID, Status: "open"}
	_, err := p.Store.DB.NewInsert().Model(conflict).
		On("CONFLICT (external_link_id, field, status) DO UPDATE").
		Set("local_value = EXCLUDED.local_value").
		Set("remote_value = EXCLUDED.remote_value").
		Set("local_changed_at = EXCLUDED.local_changed_at").
		Set("remote_changed_at = EXCLUDED.remote_changed_at").
		Set("delivery_id = EXCLUDED.delivery_id").
		Set("updated_at = now()").Exec(ctx)
	if err != nil {
		return err
	}
	// The insert uses an upsert for repeated webhook deliveries. PostgreSQL
	// keeps the existing row's id on the conflict path, so reload the row before
	// creating a notification; otherwise every refresh would point at a UUID
	// that was never persisted and would create duplicate notifications.
	var stored db.SyncConflict
	if err := p.Store.DB.NewSelect().Model(&stored).
		Where("external_link_id = ? AND field = ? AND status = 'open'", linkID, field).
		Scan(ctx); err != nil {
		return err
	}
	if notifyErr := p.notifySyncConflict(ctx, stored); notifyErr != nil {
		slog.Default().Warn("could not create sync conflict notification", "conflict_id", stored.ID, "error", notifyErr)
	}
	return nil
}

func (p Processor) notifySyncConflict(ctx context.Context, conflict db.SyncConflict) error {
	var link db.ExternalLink
	if err := p.Store.DB.NewSelect().Model(&link).Where("id = ? AND tenant_id = ?", conflict.ExternalLinkID, conflict.TenantID).Scan(ctx); err != nil {
		return err
	}
	var projectID uuid.UUID
	var localTitle string
	switch link.LocalType {
	case "task":
		var task db.Task
		if err := p.Store.DB.NewSelect().Model(&task).Column("project_id", "title").Where("id = ? AND tenant_id = ?", link.LocalID, conflict.TenantID).Scan(ctx); err != nil {
			return err
		}
		projectID = task.ProjectID
		localTitle = task.Title
	case "milestone":
		var milestone db.Milestone
		if err := p.Store.DB.NewSelect().Model(&milestone).Column("project_id", "name").Where("id = ? AND tenant_id = ?", link.LocalID, conflict.TenantID).Scan(ctx); err != nil {
			return err
		}
		projectID = milestone.ProjectID
		localTitle = milestone.Name
	default:
		return errors.New("unsupported conflict link type")
	}
	var project db.Project
	if err := p.Store.DB.NewSelect().Model(&project).Column("key", "name").Where("id = ? AND tenant_id = ?", projectID, conflict.TenantID).Scan(ctx); err != nil {
		return err
	}
	var repository db.GitRepository
	if err := p.Store.DB.NewSelect().Model(&repository).Column("full_name").Where("id = ?", link.RepositoryID).Scan(ctx); err != nil {
		return err
	}
	notificationLink := "/app/projects/" + strings.ToLower(project.Key) + "/integrations?syncConflict=" + conflict.ID.String()
	var members []db.Membership
	if err := p.Store.DB.NewSelect().Model(&members).Where("tenant_id = ?", conflict.TenantID).Scan(ctx); err != nil {
		return err
	}
	for _, member := range members {
		count, err := p.Store.DB.NewSelect().Model((*db.Notification)(nil)).Where("tenant_id = ? AND user_id = ? AND type = ? AND link = ?", conflict.TenantID, member.UserID, "sync.conflict", notificationLink).Count(ctx)
		if err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		now := time.Now().UTC()
		notification := &db.Notification{
			RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now},
			TenantID:     conflict.TenantID,
			UserID:       member.UserID,
			Type:         "sync.conflict",
			Title:        "Sync conflict needs review",
			Body:         fmt.Sprintf("%s changed in JustProjects and %s for %s.", conflict.Field, repository.FullName, localTitle),
			Link:         notificationLink,
		}
		if _, err := p.Store.DB.NewInsert().Model(notification).Exec(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (p Processor) updateExternalLink(ctx context.Context, link db.ExternalLink, snapshot map[string]any, remoteTime time.Time) error {
	if remoteTime.IsZero() {
		remoteTime = time.Now().UTC()
	}
	_, err := p.Store.DB.NewUpdate().Model((*db.ExternalLink)(nil)).Set("field_snapshot = ?", snapshot).Set("remote_updated_at = ?", remoteTime).Set("updated_at = ?", time.Now().UTC()).Where("id = ?", link.ID).Exec(ctx)
	return err
}

func issueSnapshot(projectKey string, statuses []db.ProjectStatus, issue gh.Issue) map[string]any {
	milestone := any(nil)
	if issue.Milestone != nil {
		milestone = issue.Milestone.ID
	}
	ordinaryLabels := ordinaryProviderLabels(issue.Labels)
	managedLabels := WorkflowStatusLabels(projectKey, statuses, issue.Labels)
	return map[string]any{"title": issue.Title, "body": issue.Body, "state": normalizedRemoteIssueState(issue.State), "labels": canonicalStrings(ordinaryLabels), "workflowStatus": canonicalStrings(managedLabels), "assignees": canonicalStrings(issue.Assignees), "milestone": milestone}
}

func ordinaryProviderLabels(labels []string) []string {
	ordinary, _ := SplitProviderStatusLabels(labels)
	return ordinary
}

func normalizedRemoteIssueState(state string) string {
	if strings.EqualFold(strings.TrimSpace(state), "closed") {
		return "closed"
	}
	return "open"
}

func milestoneSnapshot(milestone gh.Milestone) map[string]any {
	return map[string]any{"title": milestone.Title, "body": milestone.Description, "state": milestoneState(milestone.State), "dueDate": dateValue(milestone.DueOn)}
}

func milestoneState(state string) string {
	if state == "closed" {
		return "closed"
	}
	return "open"
}

func localTaskState(task db.Task, statuses []db.ProjectStatus) string {
	for _, status := range statuses {
		if status.ID == task.StatusID && status.Category == "done" {
			return "closed"
		}
	}
	return "open"
}

func valuesEqual(left, right any) bool {
	leftJSON, leftErr := json.Marshal(left)
	rightJSON, rightErr := json.Marshal(right)
	if leftErr != nil || rightErr != nil {
		return reflect.DeepEqual(left, right)
	}
	var normalizedLeft, normalizedRight any
	if json.Unmarshal(leftJSON, &normalizedLeft) != nil || json.Unmarshal(rightJSON, &normalizedRight) != nil {
		return reflect.DeepEqual(left, right)
	}
	return reflect.DeepEqual(normalizedLeft, normalizedRight)
}

func canonicalStrings(values []string) []string {
	result := append([]string{}, values...)
	sort.Strings(result)
	return result
}

func timePtr(value time.Time) *time.Time {
	if value.IsZero() {
		return nil
	}
	return &value
}

func datePtr(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	date := time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
	return &date
}

func dateValue(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.UTC().Format("2006-01-02")
}

func (p Processor) ensureLabels(ctx context.Context, tenantID, projectID uuid.UUID, names []string) ([]uuid.UUID, error) {
	ids := make([]uuid.UUID, 0, len(names))
	seen := make(map[string]bool, len(names))
	for _, rawName := range names {
		name := strings.TrimSpace(rawName)
		if name == "" || seen[strings.ToLower(name)] {
			continue
		}
		seen[strings.ToLower(name)] = true
		var label db.Label
		err := p.Store.DB.NewSelect().Model(&label).Where("tenant_id = ? AND project_id = ? AND lower(name) = lower(?)", tenantID, projectID, name).Limit(1).Scan(ctx)
		if errors.Is(err, sql.ErrNoRows) {
			now := time.Now().UTC()
			label = db.Label{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, ProjectID: &projectID, Name: name, Color: "#64748b"}
			if _, err = p.Store.DB.NewInsert().Model(&label).Exec(ctx); err != nil {
				// Two deliveries can race while creating the same label.
				if readErr := p.Store.DB.NewSelect().Model(&label).Where("tenant_id = ? AND project_id = ? AND lower(name) = lower(?)", tenantID, projectID, name).Limit(1).Scan(ctx); readErr != nil {
					return nil, fmt.Errorf("create github label %q: %w", name, err)
				}
			}
		} else if err != nil {
			return nil, fmt.Errorf("load project label %q: %w", name, err)
		}
		ids = append(ids, label.ID)
	}
	return ids, nil
}

func (p Processor) replaceTaskLabels(ctx context.Context, taskID uuid.UUID, labelIDs []uuid.UUID) error {
	if _, err := p.Store.DB.NewDelete().Model((*db.TaskLabel)(nil)).Where("task_id = ?", taskID).Exec(ctx); err != nil {
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
	_, err := p.Store.DB.NewInsert().Model(&rows).On("CONFLICT (task_id, label_id) DO NOTHING").Exec(ctx)
	return err
}

func (p Processor) taskLabelNames(ctx context.Context, taskID uuid.UUID) ([]string, error) {
	var labels []db.Label
	if err := p.Store.DB.NewSelect().Model(&labels).
		Join("JOIN task_labels AS tl ON tl.label_id = l.id").
		Where("tl.task_id = ?", taskID).Order("l.name ASC").Scan(ctx); err != nil {
		return nil, err
	}
	names := make([]string, 0, len(labels))
	for _, label := range labels {
		if IsProviderStatusLabel(label.Name) {
			continue
		}
		names = append(names, label.Name)
	}
	return names, nil
}

// repairProviderStatusLabel makes the managed label bridge self-healing for
// issues imported before workflow labels existed, and for issues whose label
// was removed or changed directly at the provider. It is deliberately called
// by authenticated import/poll flows; webhook reconciliation remains
// credential-free and only applies the incoming projection locally.
func (p Processor) repairProviderStatusLabel(ctx context.Context, client integrations.Provider, tenantID uuid.UUID, project db.Project, repository db.GitRepository, remote gh.Issue) (bool, error) {
	var link db.ExternalLink
	if err := p.Store.DB.NewSelect().Model(&link).
		Where("tenant_id = ? AND repository_id = ? AND external_type = 'issue' AND external_id = ?", tenantID, repository.ID, remote.ID).
		Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("load provider issue link for status label repair: %w", err)
	}
	var task db.Task
	if err := p.Store.DB.NewSelect().Model(&task).
		Where("id = ? AND tenant_id = ? AND project_id = ?", link.LocalID, tenantID, project.ID).
		Scan(ctx); err != nil {
		return false, fmt.Errorf("load task for status label repair: %w", err)
	}
	var statuses []db.ProjectStatus
	if err := p.Store.DB.NewSelect().Model(&statuses).Where("project_id = ?", project.ID).Scan(ctx); err != nil {
		return false, fmt.Errorf("load project statuses for status label repair: %w", err)
	}
	desired, ok := ProviderStatusLabelForStatus(project.Key, statuses, task.StatusID)
	if !ok {
		return false, errors.New("task status is not part of the project workflow")
	}
	openConflicts, err := p.Store.DB.NewSelect().Model((*db.SyncConflict)(nil)).
		Where("external_link_id = ? AND field = 'workflowStatus' AND status = 'open'", link.ID).
		Count(ctx)
	if err != nil {
		return false, fmt.Errorf("check workflow status conflicts before repair: %w", err)
	}
	if openConflicts > 0 {
		return false, nil
	}
	managedLabels := WorkflowStatusLabels(project.Key, statuses, remote.Labels)
	if len(managedLabels) == 1 && strings.EqualFold(strings.TrimSpace(managedLabels[0]), desired) {
		return false, nil
	}

	var milestoneNumber *int
	if remote.Milestone != nil {
		number := remote.Milestone.Number
		milestoneNumber = &number
	}
	labels := WithProviderStatusLabel(project.Key, statuses, remote.Labels, desired)
	updated, err := client.UpdateIssue(ctx, repository.Owner, repository.Name, remote.Number, gh.IssuePatch{
		Title:     remote.Title,
		Body:      remote.Body,
		State:     normalizedRemoteIssueState(remote.State),
		Labels:    labels,
		Milestone: milestoneNumber,
	})
	if err != nil {
		return false, fmt.Errorf("repair provider workflow status label on issue #%d: %w", remote.Number, err)
	}
	if updated.UpdatedAt.IsZero() {
		updated.UpdatedAt = remote.UpdatedAt
	}
	if updated.UpdatedAt.IsZero() {
		updated.UpdatedAt = time.Now().UTC()
	}
	if len(updated.Labels) == 0 {
		// Some provider-compatible clients may omit labels in a mutation
		// response. Keep the persisted snapshot truthful to the patch we sent.
		updated.Labels = labels
	}
	return true, p.updateExternalLink(ctx, link, issueSnapshot(project.Key, statuses, updated), updated.UpdatedAt)
}

func (p Processor) assigneeID(ctx context.Context, tenantID uuid.UUID, provider string, logins []string) (*uuid.UUID, error) {
	for _, login := range logins {
		var mapping db.GitUserMapping
		if err := p.Store.DB.NewSelect().Model(&mapping).Where("tenant_id = ? AND provider = ? AND lower(remote_login) = lower(?)", tenantID, provider, login).Limit(1).Scan(ctx); err == nil {
			return &mapping.UserID, nil
		} else if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
	}
	return nil, nil
}

func (p Processor) taskAssigneeLogins(ctx context.Context, tenantID uuid.UUID, provider string, userID *uuid.UUID) ([]string, error) {
	if userID == nil {
		return []string{}, nil
	}
	var mapping db.GitUserMapping
	if err := p.Store.DB.NewSelect().Model(&mapping).Where("tenant_id = ? AND provider = ? AND user_id = ?", tenantID, provider, *userID).Limit(1).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return []string{}, nil
		}
		return nil, err
	}
	return []string{mapping.RemoteLogin}, nil
}

func (p Processor) repositoryProvider(ctx context.Context, repositoryID uuid.UUID) (string, error) {
	var connection db.GitConnection
	if err := p.Store.DB.NewSelect().Model(&connection).Join("JOIN git_repositories AS gr ON gr.connection_id = gc.id").Where("gr.id = ?", repositoryID).Scan(ctx); err != nil {
		return "", err
	}
	if connection.Provider == "" {
		return "github", nil
	}
	return connection.Provider, nil
}

func (p Processor) localMilestoneExternalID(ctx context.Context, repositoryID uuid.UUID, milestoneID *uuid.UUID) (any, error) {
	if milestoneID == nil {
		return nil, nil
	}
	var link db.ExternalLink
	if err := p.Store.DB.NewSelect().Model(&link).Where("repository_id = ? AND local_type = 'milestone' AND local_id = ?", repositoryID, *milestoneID).Limit(1).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return link.ExternalID, nil
}

func (p Processor) processGitHubImport(ctx context.Context, job *db.OutboxJob) (returnErr error) {
	tenantID, err := payloadUUID(job.Payload, "tenantId")
	if err != nil {
		return err
	}
	projectID, err := payloadUUID(job.Payload, "projectId")
	if err != nil {
		return err
	}
	repositoryID, err := payloadUUID(job.Payload, "repositoryId")
	if err != nil {
		return err
	}
	importStartedAt := time.Now().UTC()
	var syncEventID uuid.UUID
	if raw, ok := stringPayload(job.Payload, "syncEventId"); ok {
		syncEventID, _ = uuid.Parse(raw)
		if syncEventID != uuid.Nil {
			if err = p.setSyncEvent(ctx, syncEventID, "processing", nil, nil, ""); err != nil {
				return err
			}
			defer func() {
				if returnErr != nil {
					_ = p.setSyncEvent(ctx, syncEventID, "failed", nil, nil, returnErr.Error())
				} else {
					_ = p.setSyncEvent(ctx, syncEventID, "succeeded", nil, nil, "")
				}
			}()
		}
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "import", "Import worker started", map[string]any{"jobId": job.ID.String()})
	}
	var project db.Project
	if err = p.Store.DB.NewSelect().Model(&project).Where("id = ? AND tenant_id = ?", projectID, tenantID).Scan(ctx); err != nil {
		return err
	}
	var repository db.GitRepository
	if err = p.Store.DB.NewSelect().Model(&repository).Where("id = ?", repositoryID).Scan(ctx); err != nil {
		return err
	}
	var connection db.GitConnection
	if err = p.Store.DB.NewSelect().Model(&connection).Where("id = ? AND tenant_id = ? AND active = true", repository.ConnectionID, tenantID).Scan(ctx); err != nil {
		return err
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "repository", fmt.Sprintf("Connected repository %s", repository.FullName), map[string]any{"projectId": projectID.String(), "repositoryId": repositoryID.String()})
	}
	client, err := p.clientForConnection(ctx, connection)
	if err != nil {
		if syncEventID != uuid.Nil {
			p.appendSyncLog(ctx, syncEventID, &tenantID, "error", "connection", "Could not initialize provider client: "+err.Error(), nil)
		}
		return err
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "fetch", fmt.Sprintf("Loading %s milestones and issues", connection.Provider), nil)
	}
	milestones, err := client.ListMilestones(ctx, repository.Owner, repository.Name)
	if err != nil {
		if syncEventID != uuid.Nil {
			p.appendSyncLog(ctx, syncEventID, &tenantID, "error", "milestones", "Could not load milestones: "+err.Error(), nil)
		}
		return fmt.Errorf("list %s milestones: %w", connection.Provider, err)
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "milestones", fmt.Sprintf("Loaded %d milestones", len(milestones)), map[string]any{"count": len(milestones)})
	}
	milestoneFailures := make([]string, 0)
	milestoneCount := 0
	for _, milestone := range milestones {
		if _, reconcileErr := p.reconcileMilestone(ctx, tenantID, project, repository, milestone, job.ID.String(), milestone.UpdatedAt); reconcileErr != nil {
			failure := fmt.Sprintf("milestone #%d %q: %v", milestone.Number, milestone.Title, reconcileErr)
			milestoneFailures = append(milestoneFailures, failure)
			if syncEventID != uuid.Nil {
				p.appendSyncLog(ctx, syncEventID, &tenantID, "error", "milestone", "Could not reconcile "+failure, map[string]any{"number": milestone.Number})
			}
			continue
		}
		milestoneCount++
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "milestones", fmt.Sprintf("Reconciled %d of %d milestones", milestoneCount, len(milestones)), map[string]any{"count": milestoneCount, "failed": len(milestoneFailures)})
	}
	issues, err := client.ListIssues(ctx, repository.Owner, repository.Name)
	if err != nil {
		if syncEventID != uuid.Nil {
			p.appendSyncLog(ctx, syncEventID, &tenantID, "error", "issues", "Could not load issues: "+err.Error(), nil)
		}
		return fmt.Errorf("list %s issues: %w", connection.Provider, err)
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "issues", fmt.Sprintf("Loaded %d issues", len(issues)), map[string]any{"count": len(issues)})
	}
	issueFailures := make([]string, 0)
	issueCount := 0
	for _, issue := range issues {
		if reconcileErr := p.reconcileIssue(ctx, tenantID, project, repository, issue, job.ID.String(), issue.UpdatedAt); reconcileErr != nil {
			failure := fmt.Sprintf("issue #%d %q: %v", issue.Number, issue.Title, reconcileErr)
			issueFailures = append(issueFailures, failure)
			if syncEventID != uuid.Nil {
				p.appendSyncLog(ctx, syncEventID, &tenantID, "error", "issue", "Could not reconcile "+failure, map[string]any{"number": issue.Number})
			}
			continue
		}
		if repaired, repairErr := p.repairProviderStatusLabel(ctx, client, tenantID, project, repository, issue); repairErr != nil {
			failure := fmt.Sprintf("issue #%d %q status label: %v", issue.Number, issue.Title, repairErr)
			issueFailures = append(issueFailures, failure)
			if syncEventID != uuid.Nil {
				p.appendSyncLog(ctx, syncEventID, &tenantID, "error", "issue", "Could not repair "+failure, map[string]any{"number": issue.Number})
			}
			continue
		} else if repaired && syncEventID != uuid.Nil {
			p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "issue", fmt.Sprintf("Applied workflow status label to issue #%d", issue.Number), map[string]any{"number": issue.Number})
		}
		issueCount++
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "issues", fmt.Sprintf("Reconciled %d of %d issues", issueCount, len(issues)), map[string]any{"count": issueCount, "failed": len(issueFailures)})
	}
	failures := append(milestoneFailures, issueFailures...)
	if len(failures) > 0 {
		preview := failures
		if len(preview) > 3 {
			preview = preview[:3]
		}
		return fmt.Errorf("import completed with %d reconciliation errors: %s", len(failures), strings.Join(preview, "; "))
	}
	if err := p.seedGitSyncCursor(ctx, tenantID, projectID, repositoryID, importStartedAt); err != nil {
		return fmt.Errorf("save sync cursor after import: %w", err)
	}
	return nil
}

func payloadUUID(payload map[string]any, key string) (uuid.UUID, error) {
	raw, ok := payload[key].(string)
	if !ok || raw == "" {
		return uuid.Nil, fmt.Errorf("outbox payload has no %s", key)
	}
	parsed, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid %s: %w", key, err)
	}
	return parsed, nil
}

func payloadBool(payload map[string]any, key string) bool {
	value, ok := payload[key].(bool)
	return ok && value
}

func (p Processor) clientForConnection(ctx context.Context, connection db.GitConnection) (integrations.Provider, error) {
	provider := connection.Provider
	if provider == "" {
		provider = "github"
	}
	switch connection.AuthMethod {
	case "oauth", "pat":
		if connection.EncryptedAccessToken == "" {
			return nil, fmt.Errorf("%s connection has no access token", provider)
		}
		cipher := p.Cipher
		if cipher == nil {
			var err error
			cipher, err = auth.NewCipher(p.Config.AppEncryptionKey)
			if err != nil {
				return nil, err
			}
		}
		token, err := cipher.Decrypt(connection.EncryptedAccessToken)
		if err != nil {
			return nil, fmt.Errorf("decrypt %s access token: %w", provider, err)
		}
		if provider == "github" && connection.AuthMethod == "oauth" && !hasRepositoryScope(connection.Scopes) {
			return nil, errors.New("github connection is missing repository access scope")
		}
		switch provider {
		case "github":
			return gh.NewClient(token), nil
		case "gitlab":
			return gitlab.NewClient(connection.APIBaseURL, token)
		default:
			return nil, fmt.Errorf("unsupported git provider %q", provider)
		}
	case "app":
		if provider != "github" {
			return nil, fmt.Errorf("%s does not support app connections", provider)
		}
		if connection.InstallationID == nil {
			return nil, errors.New("github app connection has no installation id")
		}
		return gh.NewInstallationClient(ctx, p.Config.GitHubAppID, p.Config.GitHubAppPrivateKey, *connection.InstallationID)
	default:
		return nil, fmt.Errorf("unsupported github auth method %q", connection.AuthMethod)
	}
}

func hasRepositoryScope(scopes []string) bool {
	for _, scope := range scopes {
		switch strings.TrimSpace(scope) {
		case "repo", "public_repo", "issues", "issues:write":
			return true
		}
	}
	return false
}

func (p Processor) connectionAndRepository(ctx context.Context, tenantID, repositoryID uuid.UUID) (db.GitConnection, db.GitRepository, error) {
	var repository db.GitRepository
	if err := p.Store.DB.NewSelect().Model(&repository).Where("id = ?", repositoryID).Scan(ctx); err != nil {
		return db.GitConnection{}, db.GitRepository{}, err
	}
	var connection db.GitConnection
	if err := p.Store.DB.NewSelect().Model(&connection).Where("id = ? AND tenant_id = ? AND active = true", repository.ConnectionID, tenantID).Scan(ctx); err != nil {
		return db.GitConnection{}, db.GitRepository{}, err
	}
	return connection, repository, nil
}

func (p Processor) processIssueUpdate(ctx context.Context, job *db.OutboxJob) error {
	tenantID, err := payloadUUID(job.Payload, "tenantId")
	if err != nil {
		return err
	}
	taskID, err := payloadUUID(job.Payload, "taskId")
	if err != nil {
		return err
	}
	var task db.Task
	if err = p.Store.DB.NewSelect().Model(&task).Where("id = ? AND tenant_id = ?", taskID, tenantID).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	var link db.ExternalLink
	if err = p.Store.DB.NewSelect().Model(&link).Where("tenant_id = ? AND local_type = 'task' AND local_id = ? AND external_type = 'issue'", tenantID, taskID).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	connection, repository, err := p.connectionAndRepository(ctx, tenantID, link.RepositoryID)
	if err != nil {
		return err
	}
	client, err := p.clientForConnection(ctx, connection)
	if err != nil {
		return err
	}
	labels, err := p.taskLabelNames(ctx, task.ID)
	if err != nil {
		return err
	}
	provider := connection.Provider
	if provider == "" {
		provider = "github"
	}
	assigneeChanged := payloadBool(job.Payload, "assigneeChanged")
	var assignees *[]string
	if assigneeChanged {
		mappedAssignees, assigneeErr := p.taskAssigneeLogins(ctx, tenantID, provider, task.AssigneeID)
		if assigneeErr != nil {
			return assigneeErr
		}
		if task.AssigneeID != nil && len(mappedAssignees) == 0 {
			return fmt.Errorf("task assignee is not mapped to %s; map the provider user before syncing", provider)
		}
		assignees = &mappedAssignees
	}
	var statuses []db.ProjectStatus
	if err = p.Store.DB.NewSelect().Model(&statuses).Where("project_id = ?", task.ProjectID).Scan(ctx); err != nil {
		return err
	}
	var project db.Project
	if err = p.Store.DB.NewSelect().Model(&project).Where("id = ? AND tenant_id = ?", task.ProjectID, tenantID).Scan(ctx); err != nil {
		return err
	}
	statusLabel, found := ProviderStatusLabelForStatus(project.Key, statuses, task.StatusID)
	if !found {
		return errors.New("task status is not part of the project workflow")
	}
	labels = WithProviderStatusLabel(project.Key, statuses, labels, statusLabel)
	state := localTaskState(task, statuses)
	var milestoneNumber *int
	if task.MilestoneID != nil {
		var milestoneLink db.ExternalLink
		if milestoneErr := p.Store.DB.NewSelect().Model(&milestoneLink).Where("repository_id = ? AND local_type = 'milestone' AND local_id = ? AND external_type = 'milestone'", link.RepositoryID, *task.MilestoneID).Limit(1).Scan(ctx); milestoneErr == nil {
			number := milestoneLink.ExternalNumber
			milestoneNumber = &number
		}
	}
	remote, err := client.UpdateIssue(ctx, repository.Owner, repository.Name, link.ExternalNumber, gh.IssuePatch{Title: task.Title, Body: task.Description, State: state, Labels: labels, Assignees: assignees, Milestone: milestoneNumber})
	if err != nil {
		return fmt.Errorf("update github issue #%d: %w", link.ExternalNumber, err)
	}
	if remote.UpdatedAt.IsZero() {
		remote.UpdatedAt = time.Now().UTC()
	}
	return p.updateExternalLink(ctx, link, issueSnapshot(project.Key, statuses, remote), remote.UpdatedAt)
}

func (p Processor) processIssueCreate(ctx context.Context, job *db.OutboxJob) (returnErr error) {
	tenantID, err := payloadUUID(job.Payload, "tenantId")
	if err != nil {
		return err
	}
	taskID, err := payloadUUID(job.Payload, "taskId")
	if err != nil {
		return err
	}
	repositoryID, err := payloadUUID(job.Payload, "repositoryId")
	if err != nil {
		return err
	}
	var syncEventID uuid.UUID
	if raw, ok := stringPayload(job.Payload, "syncEventId"); ok {
		syncEventID, err = uuid.Parse(raw)
		if err != nil {
			return fmt.Errorf("invalid sync event id: %w", err)
		}
	}

	var connectionID *uuid.UUID
	if syncEventID != uuid.Nil {
		if err = p.setSyncEvent(ctx, syncEventID, "processing", &tenantID, nil, ""); err != nil {
			return err
		}
		defer func() {
			if returnErr != nil {
				if markErr := p.failSyncEvent(ctx, syncEventID, returnErr); markErr != nil {
					returnErr = fmt.Errorf("%w; mark task sync failed: %v", returnErr, markErr)
				}
				return
			}
			if markErr := p.setSyncEvent(ctx, syncEventID, "succeeded", &tenantID, connectionID, ""); markErr != nil {
				returnErr = markErr
			}
		}()
	}

	var task db.Task
	if err = p.Store.DB.NewSelect().Model(&task).Where("id = ? AND tenant_id = ?", taskID, tenantID).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("load task for provider issue creation: %w", err)
	}
	var link db.ExternalLink
	linkErr := p.Store.DB.NewSelect().Model(&link).
		Where("tenant_id = ? AND repository_id = ? AND local_type = 'task' AND local_id = ? AND external_type = 'issue'", tenantID, repositoryID, taskID).
		Scan(ctx)
	if linkErr == nil {
		// A retried job must not create a second provider issue after the first
		// attempt already persisted its external link.
		return nil
	}
	if !errors.Is(linkErr, sql.ErrNoRows) {
		return fmt.Errorf("load task provider link: %w", linkErr)
	}
	connection, repository, err := p.connectionAndRepository(ctx, tenantID, repositoryID)
	if err != nil {
		return fmt.Errorf("load task provider repository: %w", err)
	}
	connectionIDValue := connection.ID
	connectionID = &connectionIDValue
	client, err := p.clientForConnection(ctx, connection)
	if err != nil {
		return err
	}
	provider := connection.Provider
	if provider == "" {
		provider = "github"
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "task", fmt.Sprintf("Creating issue for task %q", task.Title), map[string]any{"taskId": task.ID.String(), "repositoryId": repository.ID.String()})
	}
	labels, err := p.taskLabelNames(ctx, task.ID)
	if err != nil {
		return fmt.Errorf("load task labels: %w", err)
	}
	var statuses []db.ProjectStatus
	if err = p.Store.DB.NewSelect().Model(&statuses).Where("project_id = ?", task.ProjectID).Scan(ctx); err != nil {
		return fmt.Errorf("load task statuses: %w", err)
	}
	var project db.Project
	if err = p.Store.DB.NewSelect().Model(&project).Where("id = ? AND tenant_id = ?", task.ProjectID, tenantID).Scan(ctx); err != nil {
		return fmt.Errorf("load task project: %w", err)
	}
	statusLabel, found := ProviderStatusLabelForStatus(project.Key, statuses, task.StatusID)
	if !found {
		return errors.New("task status is not part of the project workflow")
	}
	labels = WithProviderStatusLabel(project.Key, statuses, labels, statusLabel)
	var assignees *[]string
	if task.AssigneeID != nil {
		mappedAssignees, assigneeErr := p.taskAssigneeLogins(ctx, tenantID, provider, task.AssigneeID)
		if assigneeErr != nil {
			return assigneeErr
		}
		if len(mappedAssignees) == 0 {
			return fmt.Errorf("task assignee is not mapped to %s; map the provider user before syncing", provider)
		}
		assignees = &mappedAssignees
	}
	var milestoneNumber *int
	if task.MilestoneID != nil {
		var milestoneLink db.ExternalLink
		if milestoneErr := p.Store.DB.NewSelect().Model(&milestoneLink).
			Where("repository_id = ? AND local_type = 'milestone' AND local_id = ? AND external_type = 'milestone'", repository.ID, *task.MilestoneID).
			Limit(1).Scan(ctx); milestoneErr == nil && milestoneLink.ExternalNumber > 0 {
			number := milestoneLink.ExternalNumber
			milestoneNumber = &number
		}
	}
	state := localTaskState(task, statuses)
	remote, err := client.CreateIssue(ctx, repository.Owner, repository.Name, gh.IssuePatch{
		Title:     task.Title,
		Body:      task.Description,
		State:     state,
		Labels:    labels,
		Assignees: assignees,
		Milestone: milestoneNumber,
	})
	if err != nil {
		return fmt.Errorf("create provider issue in %s: %w", repository.FullName, err)
	}
	if remote.UpdatedAt.IsZero() {
		remote.UpdatedAt = time.Now().UTC()
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "issue", fmt.Sprintf("Created issue #%d in %s", remote.Number, repository.FullName), map[string]any{"externalId": remote.ID, "number": remote.Number, "repositoryId": repository.ID.String()})
	}
	link = db.ExternalLink{
		RecordFields:    db.RecordFields{ID: uuid.New(), CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()},
		TenantID:        tenantID,
		RepositoryID:    repository.ID,
		LocalType:       "task",
		LocalID:         task.ID,
		ExternalType:    "issue",
		ExternalID:      remote.ID,
		ExternalNumber:  remote.Number,
		RemoteUpdatedAt: timePtr(remote.UpdatedAt),
		FieldSnapshot:   issueSnapshot(project.Key, statuses, remote),
	}
	result, err := p.Store.DB.NewInsert().Model(&link).
		On("CONFLICT (repository_id, local_type, local_id) DO NOTHING").Exec(ctx)
	if err != nil {
		return fmt.Errorf("link created provider issue: %w", err)
	}
	if count, _ := result.RowsAffected(); count == 0 {
		// Another worker won a concurrent create race. The existing link is the
		// authoritative local mapping for subsequent updates.
		if err = p.Store.DB.NewSelect().Model(&link).
			Where("tenant_id = ? AND repository_id = ? AND local_type = 'task' AND local_id = ? AND external_type = 'issue'", tenantID, repository.ID, task.ID).
			Scan(ctx); err != nil {
			return fmt.Errorf("load existing provider issue link: %w", err)
		}
	}
	return nil
}

func (p Processor) processMilestoneCreate(ctx context.Context, job *db.OutboxJob) (returnErr error) {
	tenantID, err := payloadUUID(job.Payload, "tenantId")
	if err != nil {
		return err
	}
	milestoneID, err := payloadUUID(job.Payload, "milestoneId")
	if err != nil {
		return err
	}
	repositoryID, err := payloadUUID(job.Payload, "repositoryId")
	if err != nil {
		return err
	}
	var syncEventID uuid.UUID
	if raw, ok := stringPayload(job.Payload, "syncEventId"); ok {
		syncEventID, err = uuid.Parse(raw)
		if err != nil {
			return fmt.Errorf("invalid sync event id: %w", err)
		}
	}

	var connectionID *uuid.UUID
	if syncEventID != uuid.Nil {
		if err = p.setSyncEvent(ctx, syncEventID, "processing", &tenantID, nil, ""); err != nil {
			return err
		}
		defer func() {
			if returnErr != nil {
				if markErr := p.failSyncEvent(ctx, syncEventID, returnErr); markErr != nil {
					returnErr = fmt.Errorf("%w; mark milestone sync failed: %v", returnErr, markErr)
				}
				return
			}
			if markErr := p.setSyncEvent(ctx, syncEventID, "succeeded", &tenantID, connectionID, ""); markErr != nil {
				returnErr = markErr
			}
		}()
	}

	var milestone db.Milestone
	if err = p.Store.DB.NewSelect().Model(&milestone).Where("id = ? AND tenant_id = ?", milestoneID, tenantID).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("load milestone for provider creation: %w", err)
	}
	var link db.ExternalLink
	linkErr := p.Store.DB.NewSelect().Model(&link).
		Where("tenant_id = ? AND repository_id = ? AND local_type = 'milestone' AND local_id = ? AND external_type = 'milestone'", tenantID, repositoryID, milestoneID).
		Scan(ctx)
	if linkErr == nil {
		// A retried job must not create a second provider milestone after the
		// first attempt already persisted its external link.
		return nil
	}
	if !errors.Is(linkErr, sql.ErrNoRows) {
		return fmt.Errorf("load milestone provider link: %w", linkErr)
	}
	connection, repository, err := p.connectionAndRepository(ctx, tenantID, repositoryID)
	if err != nil {
		return fmt.Errorf("load milestone provider repository: %w", err)
	}
	connectionIDValue := connection.ID
	connectionID = &connectionIDValue
	client, err := p.clientForConnection(ctx, connection)
	if err != nil {
		return err
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "milestone", fmt.Sprintf("Creating milestone %q", milestone.Name), map[string]any{"milestoneId": milestone.ID.String(), "repositoryId": repository.ID.String()})
	}
	remote, err := client.CreateMilestone(ctx, repository.Owner, repository.Name, gh.MilestonePatch{
		Title:       milestone.Name,
		Description: milestone.Description,
		State:       milestone.Status,
		DueOn:       milestone.DueDate,
	})
	if err != nil {
		return fmt.Errorf("create provider milestone in %s: %w", repository.FullName, err)
	}
	if remote.UpdatedAt.IsZero() {
		remote.UpdatedAt = time.Now().UTC()
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "milestone", fmt.Sprintf("Created milestone #%d in %s", remote.Number, repository.FullName), map[string]any{"externalId": remote.ID, "number": remote.Number, "repositoryId": repository.ID.String()})
	}
	link = db.ExternalLink{
		RecordFields:    db.RecordFields{ID: uuid.New(), CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()},
		TenantID:        tenantID,
		RepositoryID:    repository.ID,
		LocalType:       "milestone",
		LocalID:         milestone.ID,
		ExternalType:    "milestone",
		ExternalID:      remote.ID,
		ExternalNumber:  remote.Number,
		RemoteUpdatedAt: timePtr(remote.UpdatedAt),
		FieldSnapshot:   milestoneSnapshot(remote),
	}
	result, err := p.Store.DB.NewInsert().Model(&link).
		On("CONFLICT (repository_id, local_type, local_id) DO NOTHING").Exec(ctx)
	if err != nil {
		return fmt.Errorf("link created provider milestone: %w", err)
	}
	if count, _ := result.RowsAffected(); count == 0 {
		// Another worker won a concurrent create race. The existing link is the
		// authoritative local mapping for subsequent updates.
		if err = p.Store.DB.NewSelect().Model(&link).
			Where("tenant_id = ? AND repository_id = ? AND local_type = 'milestone' AND local_id = ? AND external_type = 'milestone'", tenantID, repository.ID, milestone.ID).
			Scan(ctx); err != nil {
			return fmt.Errorf("load existing provider milestone link: %w", err)
		}
	}
	return nil
}

func (p Processor) processMilestoneUpdate(ctx context.Context, job *db.OutboxJob) error {
	tenantID, err := payloadUUID(job.Payload, "tenantId")
	if err != nil {
		return err
	}
	milestoneID, err := payloadUUID(job.Payload, "milestoneId")
	if err != nil {
		return err
	}
	var milestone db.Milestone
	if err = p.Store.DB.NewSelect().Model(&milestone).Where("id = ? AND tenant_id = ?", milestoneID, tenantID).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	var link db.ExternalLink
	if err = p.Store.DB.NewSelect().Model(&link).Where("tenant_id = ? AND local_type = 'milestone' AND local_id = ? AND external_type = 'milestone'", tenantID, milestoneID).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	connection, repository, err := p.connectionAndRepository(ctx, tenantID, link.RepositoryID)
	if err != nil {
		return err
	}
	client, err := p.clientForConnection(ctx, connection)
	if err != nil {
		return err
	}
	remote, err := client.UpdateMilestone(ctx, repository.Owner, repository.Name, link.ExternalNumber, gh.MilestonePatch{Title: milestone.Name, Description: milestone.Description, State: milestone.Status, DueOn: milestone.DueDate})
	if err != nil {
		return fmt.Errorf("update github milestone #%d: %w", link.ExternalNumber, err)
	}
	if remote.UpdatedAt.IsZero() {
		remote.UpdatedAt = time.Now().UTC()
	}
	return p.updateExternalLink(ctx, link, milestoneSnapshot(remote), remote.UpdatedAt)
}

func (p Processor) processConflictResolution(ctx context.Context, job *db.OutboxJob) error {
	conflictID, err := payloadUUID(job.Payload, "conflictId")
	if err != nil {
		return err
	}
	var conflict db.SyncConflict
	if err = p.Store.DB.NewSelect().Model(&conflict).Where("id = ?", conflictID).Scan(ctx); err != nil {
		return err
	}
	var link db.ExternalLink
	if err = p.Store.DB.NewSelect().Model(&link).Where("id = ? AND tenant_id = ?", conflict.ExternalLinkID, conflict.TenantID).Scan(ctx); err != nil {
		return err
	}
	if conflict.Resolution == "local" {
		jobs := queue.Queue{Store: p.Store}
		if link.LocalType == "task" {
			payload := map[string]any{"tenantId": conflict.TenantID.String(), "taskId": link.LocalID.String()}
			if conflict.Field == "assignees" {
				payload["assigneeChanged"] = true
			}
			return jobs.Enqueue(ctx, "git.issue.update", payload)
		}
		return jobs.Enqueue(ctx, "git.milestone.update", map[string]any{"tenantId": conflict.TenantID.String(), "milestoneId": link.LocalID.String()})
	}
	if conflict.Resolution == "remote" {
		if err = p.applyRemoteConflict(ctx, conflict, link); err != nil {
			return err
		}
	}
	if conflict.Resolution == "ignore" || conflict.Resolution == "remote" {
		snapshot := link.FieldSnapshot
		if snapshot == nil {
			snapshot = map[string]any{}
		}
		snapshot[conflict.Field] = conflict.RemoteValue
		return p.updateExternalLink(ctx, link, snapshot, conflict.RemoteChangedAt)
	}
	return nil
}

func (p Processor) applyRemoteConflict(ctx context.Context, conflict db.SyncConflict, link db.ExternalLink) error {
	provider, err := p.repositoryProvider(ctx, link.RepositoryID)
	if err != nil {
		return err
	}
	switch link.LocalType {
	case "task":
		var task db.Task
		if err := p.Store.DB.NewSelect().Model(&task).Where("id = ? AND tenant_id = ?", link.LocalID, conflict.TenantID).Scan(ctx); err != nil {
			return err
		}
		updates := map[string]any{}
		switch conflict.Field {
		case "title":
			if value, ok := stringValue(conflict.RemoteValue); ok {
				updates["title"] = value
			}
		case "body":
			if value, ok := stringValue(conflict.RemoteValue); ok {
				updates["description"] = value
			}
		case "state":
			var statuses []db.ProjectStatus
			if err := p.Store.DB.NewSelect().Model(&statuses).Where("project_id = ?", task.ProjectID).Scan(ctx); err != nil {
				return err
			}
			state, _ := stringValue(conflict.RemoteValue)
			if statusID, ok := StatusForRemoteState(statuses, strings.EqualFold(state, "closed")); ok {
				updates["status_id"] = statusID
			}
		case "workflowStatus":
			var project db.Project
			if err := p.Store.DB.NewSelect().Model(&project).Where("id = ? AND tenant_id = ?", task.ProjectID, conflict.TenantID).Scan(ctx); err != nil {
				return err
			}
			var statuses []db.ProjectStatus
			if err := p.Store.DB.NewSelect().Model(&statuses).Where("project_id = ?", task.ProjectID).Scan(ctx); err != nil {
				return err
			}
			labels, ok := stringSlice(conflict.RemoteValue)
			if !ok {
				break
			}
			remoteState, _ := stringValue(link.FieldSnapshot["state"])
			statusID, statusOK, _, statusErr := StatusForRemoteIssue(project.Key, statuses, remoteState, labels)
			if statusErr != nil {
				return statusErr
			}
			if statusOK {
				updates["status_id"] = statusID
			}
		case "milestone":
			externalID, ok := int64Value(conflict.RemoteValue)
			if !ok {
				updates["milestone_id"] = nil
			} else {
				var milestoneLink db.ExternalLink
				if err := p.Store.DB.NewSelect().Model(&milestoneLink).Where("repository_id = ? AND external_type = 'milestone' AND external_id = ?", link.RepositoryID, externalID).Limit(1).Scan(ctx); err == nil {
					updates["milestone_id"] = milestoneLink.LocalID
				}
			}
		case "labels":
			labels, ok := stringSlice(conflict.RemoteValue)
			if !ok {
				break
			}
			labels, _ = SplitProviderStatusLabels(labels)
			labelIDs, err := p.ensureLabels(ctx, conflict.TenantID, task.ProjectID, labels)
			if err != nil {
				return err
			}
			if err = p.replaceTaskLabels(ctx, task.ID, labelIDs); err != nil {
				return err
			}
		case "assignees":
			assignees, ok := stringSlice(conflict.RemoteValue)
			if ok {
				assigneeID, err := p.assigneeID(ctx, conflict.TenantID, provider, assignees)
				if err != nil {
					return err
				}
				updates["assignee_id"] = assigneeID
			}
		}
		if len(updates) == 0 {
			return nil
		}
		query := p.Store.DB.NewUpdate().Model((*db.Task)(nil)).Set("updated_at = ?", time.Now().UTC()).Set("version = version + 1")
		for field, value := range updates {
			query = query.Set(field+" = ?", value)
		}
		_, err := query.Where("id = ? AND tenant_id = ?", task.ID, conflict.TenantID).Exec(ctx)
		return err
	case "milestone":
		var milestone db.Milestone
		if err := p.Store.DB.NewSelect().Model(&milestone).Where("id = ? AND tenant_id = ?", link.LocalID, conflict.TenantID).Scan(ctx); err != nil {
			return err
		}
		updates := map[string]any{}
		switch conflict.Field {
		case "title":
			if value, ok := stringValue(conflict.RemoteValue); ok {
				updates["name"] = value
			}
		case "body":
			if value, ok := stringValue(conflict.RemoteValue); ok {
				updates["description"] = value
			}
		case "state":
			if value, ok := stringValue(conflict.RemoteValue); ok {
				updates["status"] = milestoneState(value)
			}
		case "dueDate":
			if value, ok := stringValue(conflict.RemoteValue); ok {
				parsed, parseErr := time.Parse("2006-01-02", value)
				if parseErr != nil {
					return parseErr
				}
				updates["due_date"] = &parsed
			} else {
				updates["due_date"] = nil
			}
		}
		if len(updates) == 0 {
			return nil
		}
		query := p.Store.DB.NewUpdate().Model((*db.Milestone)(nil)).Set("updated_at = ?", time.Now().UTC()).Set("version = version + 1")
		for field, value := range updates {
			query = query.Set(field+" = ?", value)
		}
		_, err := query.Where("id = ? AND tenant_id = ?", milestone.ID, conflict.TenantID).Exec(ctx)
		return err
	default:
		return fmt.Errorf("unsupported conflict local type %q", link.LocalType)
	}
}

func stringValue(value any) (string, bool) {
	result, ok := value.(string)
	return result, ok
}

func int64Value(value any) (int64, bool) {
	switch typed := value.(type) {
	case int:
		return int64(typed), true
	case int64:
		return typed, true
	case float64:
		return int64(typed), typed == float64(int64(typed))
	case json.Number:
		result, err := typed.Int64()
		return result, err == nil
	default:
		return 0, false
	}
}

func stringSlice(value any) ([]string, bool) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, false
	}
	var values []string
	if err = json.Unmarshal(encoded, &values); err != nil {
		return nil, false
	}
	return values, true
}
