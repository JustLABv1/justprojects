package db

import (
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type RecordFields struct {
	ID        uuid.UUID `bun:",pk,type:uuid,default:gen_random_uuid()" json:"id"`
	CreatedAt time.Time `bun:",nullzero,default:current_timestamp" json:"createdAt"`
	UpdatedAt time.Time `bun:",nullzero,default:current_timestamp" json:"updatedAt"`
}

type Tenant struct {
	bun.BaseModel `bun:"table:tenants,alias:t"`
	RecordFields
	Name        string `bun:",notnull" json:"name"`
	Slug        string `bun:",notnull,unique" json:"slug"`
	RequestSlug string `bun:",notnull,unique" json:"requestSlug"`
}

type User struct {
	bun.BaseModel `bun:"table:users,alias:u"`
	RecordFields
	Email         string `bun:",notnull,unique" json:"email"`
	Name          string `bun:",notnull" json:"name"`
	PasswordHash  string `bun:",nullzero" json:"-"`
	EmailVerified bool   `bun:",notnull,default:false" json:"emailVerified"`
	PlatformAdmin bool   `bun:",notnull,default:false" json:"platformAdmin"`
	Suspended     bool   `bun:",notnull,default:false" json:"suspended"`
}

// PlatformSettings is a singleton row containing installation-wide controls.
// Keeping these values in the database makes them durable across restarts and
// lets a platform administrator change access without editing environment
// variables or redeploying the server.
type PlatformSettings struct {
	bun.BaseModel `bun:"table:platform_settings,alias:ps"`
	SingletonID   bool      `bun:"singleton_id,pk,notnull" json:"-"`
	LoginEnabled  bool      `bun:",notnull" json:"loginEnabled"`
	SignupEnabled bool      `bun:",notnull" json:"signupEnabled"`
	CreatedAt     time.Time `bun:",notnull,default:current_timestamp" json:"createdAt"`
	UpdatedAt     time.Time `bun:",notnull,default:current_timestamp" json:"updatedAt"`
}

type Identity struct {
	bun.BaseModel `bun:"table:identities,alias:i"`
	RecordFields
	UserID   uuid.UUID `bun:",type:uuid,notnull" json:"userId"`
	Provider string    `bun:",notnull" json:"provider"`
	Subject  string    `bun:",notnull" json:"subject"`
	Email    string    `bun:",nullzero" json:"email"`
}

type Session struct {
	bun.BaseModel `bun:"table:sessions,alias:s"`
	RecordFields
	UserID       uuid.UUID  `bun:",type:uuid,notnull" json:"userId"`
	TenantID     uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	PublicPageID *uuid.UUID `bun:",type:uuid,nullzero" json:"publicPageId,omitempty"`
	TokenHash    string     `bun:",notnull,unique" json:"-"`
	ExpiresAt    time.Time  `bun:",notnull" json:"expiresAt"`
}

type Membership struct {
	bun.BaseModel `bun:"table:memberships,alias:m"`
	RecordFields
	TenantID uuid.UUID `bun:",type:uuid,notnull" json:"tenantId"`
	UserID   uuid.UUID `bun:",type:uuid,notnull" json:"userId"`
	Role     string    `bun:",notnull" json:"role"`
}

type TenantInvitation struct {
	bun.BaseModel `bun:"table:tenant_invitations,alias:ti"`
	RecordFields
	TenantID   uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	Email      string     `bun:",notnull" json:"email"`
	Role       string     `bun:",notnull" json:"role"`
	TokenHash  string     `bun:",notnull,unique" json:"-"`
	ExpiresAt  time.Time  `bun:",notnull" json:"expiresAt"`
	InvitedBy  uuid.UUID  `bun:",type:uuid,notnull" json:"invitedBy"`
	AcceptedAt *time.Time `bun:",nullzero" json:"acceptedAt,omitempty"`
}

type PermissionGrant struct {
	bun.BaseModel `bun:"table:permission_grants,alias:pg"`
	RecordFields
	TenantID   uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	UserID     uuid.UUID  `bun:",type:uuid,notnull" json:"userId"`
	ProjectID  *uuid.UUID `bun:",type:uuid,nullzero" json:"projectId,omitempty"`
	Permission string     `bun:",notnull" json:"permission"`
	Effect     string     `bun:",notnull,default:'allow'" json:"effect"`
}

type Project struct {
	bun.BaseModel `bun:"table:projects,alias:p"`
	RecordFields
	TenantID     uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	Name         string     `bun:",notnull" json:"name"`
	Key          string     `bun:",notnull" json:"key"`
	Description  string     `bun:",nullzero" json:"description"`
	StartDate    *time.Time `bun:",nullzero" json:"startDate,omitempty"`
	TargetDate   *time.Time `bun:",nullzero" json:"targetDate,omitempty"`
	Status       string     `bun:",notnull,default:'active'" json:"status"`
	CreatedBy    uuid.UUID  `bun:",type:uuid,notnull" json:"createdBy"`
	ConnectionID *uuid.UUID `bun:",type:uuid,nullzero" json:"connectionId,omitempty"`
	Version      int64      `bun:",notnull,default:1" json:"version"`
}

type ProjectStatus struct {
	bun.BaseModel `bun:"table:project_statuses,alias:ps"`
	RecordFields
	ProjectID     uuid.UUID `bun:",type:uuid,notnull" json:"projectId"`
	Name          string    `bun:",notnull" json:"name"`
	Category      string    `bun:",notnull" json:"category"`
	Position      int       `bun:",notnull,default:0" json:"position"`
	Color         string    `bun:",nullzero" json:"color"`
	ProviderLabel string    `bun:"provider_label,notnull" json:"-"`
}

type Label struct {
	bun.BaseModel `bun:"table:labels,alias:l"`
	RecordFields
	TenantID  uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	ProjectID *uuid.UUID `bun:",type:uuid,nullzero" json:"projectId,omitempty"`
	Name      string     `bun:",notnull" json:"name"`
	Color     string     `bun:",notnull,default:'#64748b'" json:"color"`
	Position  int        `bun:",notnull,default:0" json:"position"`
}

type Milestone struct {
	bun.BaseModel `bun:"table:milestones,alias:mi"`
	RecordFields
	TenantID    uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	ProjectID   uuid.UUID  `bun:",type:uuid,notnull" json:"projectId"`
	Name        string     `bun:",notnull" json:"name"`
	Description string     `bun:",nullzero" json:"description"`
	StartDate   *time.Time `bun:",nullzero" json:"startDate,omitempty"`
	DueDate     *time.Time `bun:",nullzero" json:"dueDate,omitempty"`
	Status      string     `bun:",notnull,default:'open'" json:"status"`
	Visibility  string     `bun:",notnull,default:'internal'" json:"visibility"`
	Version     int64      `bun:",notnull,default:1" json:"version"`
}

type Task struct {
	bun.BaseModel `bun:"table:tasks,alias:ta"`
	RecordFields
	TenantID     uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	ProjectID    uuid.UUID  `bun:",type:uuid,notnull" json:"projectId"`
	ParentID     *uuid.UUID `bun:",type:uuid,nullzero" json:"parentId,omitempty"`
	MilestoneID  *uuid.UUID `bun:",type:uuid,nullzero" json:"milestoneId,omitempty"`
	StatusID     uuid.UUID  `bun:",type:uuid,notnull" json:"statusId"`
	Title        string     `bun:",notnull" json:"title"`
	Description  string     `bun:",nullzero" json:"description"`
	Priority     string     `bun:",notnull,default:'medium'" json:"priority"`
	StartDate    *time.Time `bun:",nullzero" json:"startDate,omitempty"`
	DueDate      *time.Time `bun:",nullzero" json:"dueDate,omitempty"`
	EstimateMins *int       `bun:"estimate_minutes,nullzero" json:"estimateMinutes,omitempty"`
	AssigneeID   *uuid.UUID `bun:",type:uuid,nullzero" json:"assigneeId,omitempty"`
	Visibility   string     `bun:",notnull,default:'internal'" json:"visibility"`
	Position     int        `bun:",notnull,default:0" json:"position"`
	Version      int64      `bun:",notnull,default:1" json:"version"`
}

type TaskLabel struct {
	bun.BaseModel `bun:"table:task_labels,alias:tl"`
	RecordFields
	TaskID  uuid.UUID `bun:",type:uuid,notnull" json:"taskId"`
	LabelID uuid.UUID `bun:",type:uuid,notnull" json:"labelId"`
}

type GitConnection struct {
	bun.BaseModel `bun:"table:git_connections,alias:gc"`
	RecordFields
	Provider               string     `bun:",notnull" json:"provider"`
	TenantID               uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	Name                   string     `bun:",nullzero" json:"name"`
	APIBaseURL             string     `bun:",notnull" json:"apiBaseUrl"`
	AuthMethod             string     `bun:",notnull" json:"authMethod"`
	InstallationID         *int64     `bun:",nullzero" json:"installationId,omitempty"`
	ExternalAccountID      int64      `bun:",notnull" json:"externalAccountId"`
	ExternalAccountLogin   string     `bun:",nullzero" json:"externalAccountLogin"`
	EncryptedAccessToken   string     `bun:",nullzero" json:"-"`
	EncryptedRefreshToken  string     `bun:",nullzero" json:"-"`
	EncryptedWebhookSecret string     `bun:",nullzero" json:"-"`
	TokenExpiresAt         *time.Time `bun:",nullzero" json:"tokenExpiresAt,omitempty"`
	Scopes                 []string   `bun:",type:jsonb,notnull,default:'[]'" json:"scopes"`
	Active                 bool       `bun:",notnull,default:true" json:"active"`
}

type GitRepository struct {
	bun.BaseModel `bun:"table:git_repositories,alias:gr"`
	RecordFields
	ConnectionID uuid.UUID `bun:",type:uuid,notnull" json:"connectionId"`
	ExternalID   int64     `bun:",notnull" json:"externalId"`
	Owner        string    `bun:",notnull" json:"owner"`
	Name         string    `bun:",notnull" json:"name"`
	FullName     string    `bun:",notnull" json:"fullName"`
	Private      bool      `bun:",notnull,default:false" json:"private"`
}

type GitUserMapping struct {
	bun.BaseModel `bun:"table:git_user_mappings,alias:gum"`
	RecordFields
	TenantID    uuid.UUID `bun:",type:uuid,notnull" json:"tenantId"`
	Provider    string    `bun:",notnull,default:'github'" json:"provider"`
	RemoteLogin string    `bun:",notnull" json:"remoteLogin"`
	RemoteID    *int64    `bun:",nullzero" json:"remoteId,omitempty"`
	UserID      uuid.UUID `bun:",type:uuid,notnull" json:"userId"`
}

type ProjectRepository struct {
	bun.BaseModel `bun:"table:project_repositories,alias:pr"`
	RecordFields
	ProjectID    uuid.UUID `bun:",type:uuid,notnull" json:"projectId"`
	RepositoryID uuid.UUID `bun:",type:uuid,notnull" json:"repositoryId"`
}

// GitSyncState is the durable polling checkpoint for one project/repository
// attachment. Keeping the cursor at this scope means one repository can be
// attached to multiple projects without one project's successful poll moving
// another project's checkpoint forward.
type GitSyncState struct {
	bun.BaseModel `bun:"table:git_sync_states,alias:gss"`
	RecordFields
	TenantID          uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	ProjectID         uuid.UUID  `bun:",type:uuid,notnull" json:"projectId"`
	RepositoryID      uuid.UUID  `bun:",type:uuid,notnull" json:"repositoryId"`
	IssueCursorAt     *time.Time `bun:",nullzero" json:"issueCursorAt,omitempty"`
	MilestoneCursorAt *time.Time `bun:",nullzero" json:"milestoneCursorAt,omitempty"`
	// WorkflowLabelBackfilledAt records the one-time full provider issue scan
	// that adds managed workflow labels to existing linked issues. It is kept
	// separate from the incremental cursors because an issue can be unchanged
	// since the cursor while still missing its JustProjects status label.
	WorkflowLabelBackfilledAt *time.Time `bun:",nullzero" json:"workflowLabelBackfilledAt,omitempty"`
	LastStartedAt             *time.Time `bun:",nullzero" json:"lastStartedAt,omitempty"`
	LastCompletedAt           *time.Time `bun:",nullzero" json:"lastCompletedAt,omitempty"`
	NextRunAt                 time.Time  `bun:",notnull" json:"nextRunAt"`
	Status                    string     `bun:",notnull" json:"status"`
	LastError                 string     `bun:",nullzero" json:"lastError,omitempty"`
}

type ExternalLink struct {
	bun.BaseModel `bun:"table:external_links,alias:el"`
	RecordFields
	TenantID        uuid.UUID      `bun:",type:uuid,notnull" json:"tenantId"`
	RepositoryID    uuid.UUID      `bun:",type:uuid,notnull" json:"repositoryId"`
	LocalType       string         `bun:",notnull" json:"localType"`
	LocalID         uuid.UUID      `bun:",type:uuid,notnull" json:"localId"`
	ExternalType    string         `bun:",notnull" json:"externalType"`
	ExternalID      int64          `bun:",notnull" json:"externalId"`
	ExternalNumber  int            `bun:",nullzero" json:"externalNumber"`
	RemoteUpdatedAt *time.Time     `bun:",nullzero" json:"remoteUpdatedAt,omitempty"`
	FieldSnapshot   map[string]any `bun:",type:jsonb,notnull,default:'{}'" json:"fieldSnapshot"`
}

// The aliases keep the current internal GitHub call sites source-compatible
// while the persisted connection/repository model is now provider-agnostic.
type GitHubConnection = GitConnection
type GitHubRepository = GitRepository
type GitHubUserMapping = GitUserMapping

type SyncEvent struct {
	bun.BaseModel `bun:"table:sync_events,alias:se"`
	RecordFields
	TenantID     *uuid.UUID     `bun:",type:uuid,nullzero" json:"tenantId,omitempty"`
	ConnectionID *uuid.UUID     `bun:",type:uuid,nullzero" json:"connectionId,omitempty"`
	Provider     string         `bun:",notnull" json:"provider"`
	DeliveryID   string         `bun:",notnull,unique" json:"deliveryId"`
	EventName    string         `bun:",notnull" json:"eventName"`
	Action       string         `bun:",nullzero" json:"action"`
	Payload      map[string]any `bun:",type:jsonb,notnull" json:"payload"`
	Status       string         `bun:",notnull,default:'queued'" json:"status"`
	ErrorMessage string         `bun:",nullzero" json:"errorMessage"`
}

// SyncEventLog stores a safe, user-facing activity trail for an asynchronous
// sync run. Provider payloads and credentials must never be written here;
// metadata is reserved for small identifiers and counters that help explain
// what the worker did.
type SyncEventLog struct {
	bun.BaseModel `bun:"table:sync_event_logs,alias:sel"`
	RecordFields
	TenantID    uuid.UUID      `bun:",type:uuid,notnull" json:"-"`
	SyncEventID uuid.UUID      `bun:",type:uuid,notnull" json:"syncEventId"`
	Level       string         `bun:",notnull" json:"level"`
	Phase       string         `bun:",nullzero" json:"phase,omitempty"`
	Message     string         `bun:",notnull" json:"message"`
	Metadata    map[string]any `bun:",type:jsonb,notnull,default:'{}'" json:"metadata"`
}

type SyncConflict struct {
	bun.BaseModel `bun:"table:sync_conflicts,alias:sc"`
	RecordFields
	TenantID        uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	ExternalLinkID  uuid.UUID  `bun:",type:uuid,notnull" json:"externalLinkId"`
	Field           string     `bun:",notnull" json:"field"`
	LocalValue      any        `bun:",type:jsonb,notnull" json:"localValue"`
	RemoteValue     any        `bun:",type:jsonb,notnull" json:"remoteValue"`
	LocalChangedAt  time.Time  `bun:",notnull" json:"localChangedAt"`
	RemoteChangedAt time.Time  `bun:",notnull" json:"remoteChangedAt"`
	DeliveryID      string     `bun:",nullzero" json:"deliveryId"`
	Status          string     `bun:",notnull,default:'open'" json:"status"`
	Resolution      string     `bun:",nullzero" json:"resolution"`
	ResolvedBy      *uuid.UUID `bun:",type:uuid,nullzero" json:"resolvedBy,omitempty"`
}

type OutboxJob struct {
	bun.BaseModel `bun:"table:outbox_jobs,alias:oj"`
	RecordFields
	Kind      string         `bun:",notnull" json:"kind"`
	Payload   map[string]any `bun:",type:jsonb,notnull" json:"payload"`
	Status    string         `bun:",notnull,default:'pending'" json:"status"`
	Attempts  int            `bun:",notnull,default:0" json:"attempts"`
	RunAt     time.Time      `bun:",notnull,default:current_timestamp" json:"runAt"`
	LockedAt  *time.Time     `bun:",nullzero" json:"lockedAt,omitempty"`
	LastError string         `bun:",nullzero" json:"lastError"`
}

type AuditEvent struct {
	bun.BaseModel `bun:"table:audit_events,alias:ae"`
	RecordFields
	TenantID   uuid.UUID      `bun:",type:uuid,notnull" json:"tenantId"`
	ActorID    *uuid.UUID     `bun:",type:uuid,nullzero" json:"actorId,omitempty"`
	Action     string         `bun:",notnull" json:"action"`
	EntityType string         `bun:",notnull" json:"entityType"`
	EntityID   uuid.UUID      `bun:",type:uuid,notnull" json:"entityId"`
	Metadata   map[string]any `bun:",type:jsonb,notnull,default:'{}'" json:"metadata"`
}

type PublicPage struct {
	bun.BaseModel `bun:"table:public_pages,alias:pp"`
	RecordFields
	TenantID   uuid.UUID `bun:",type:uuid,notnull" json:"tenantId"`
	ProjectID  uuid.UUID `bun:",type:uuid,notnull" json:"projectId"`
	Slug       string    `bun:",notnull" json:"slug"`
	TokenHash  string    `bun:",notnull,unique" json:"-"`
	AccessMode string    `bun:",notnull,default:'link'" json:"accessMode"`
	Title      string    `bun:",nullzero" json:"title"`
	// Legacy columns retained for backwards-compatible database reads. Customer
	// visibility is controlled by Task.Visibility and Milestone.Visibility.
	VisibleTaskIDs      []uuid.UUID `bun:"visible_task_ids,type:jsonb,notnull,default:'[]'" json:"-"`
	VisibleMilestoneIDs []uuid.UUID `bun:"visible_milestone_ids,type:jsonb,notnull,default:'[]'" json:"-"`
	Revoked             bool        `bun:",notnull,default:false" json:"revoked"`
}

type PublicPageViewer struct {
	bun.BaseModel `bun:"table:public_page_viewers,alias:pv"`
	RecordFields
	PublicPageID uuid.UUID `bun:",type:uuid,notnull" json:"publicPageId"`
	UserID       uuid.UUID `bun:",type:uuid,notnull" json:"userId"`
}

type ProjectRequest struct {
	bun.BaseModel `bun:"table:project_requests,alias:prq"`
	RecordFields
	TenantID            uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	SourcePublicPageID  *uuid.UUID `bun:",type:uuid,nullzero" json:"sourcePublicPageId,omitempty"`
	RequesterUserID     *uuid.UUID `bun:",type:uuid,nullzero" json:"requesterUserId,omitempty"`
	RequesterName       string     `bun:",notnull" json:"requesterName"`
	RequesterEmail      string     `bun:",notnull" json:"requesterEmail"`
	Title               string     `bun:",notnull" json:"title"`
	Description         string     `bun:",notnull" json:"description"`
	RequestedStartDate  *time.Time `bun:",nullzero" json:"requestedStartDate,omitempty"`
	RequestedTargetDate *time.Time `bun:",nullzero" json:"requestedTargetDate,omitempty"`
	Priority            string     `bun:",notnull,default:'medium'" json:"priority"`
	Status              string     `bun:",notnull,default:'submitted'" json:"status"`
	AssignedTo          *uuid.UUID `bun:",type:uuid,nullzero" json:"assignedTo,omitempty"`
	InternalNotes       string     `bun:",nullzero" json:"internalNotes,omitempty"`
	ConvertedProjectID  *uuid.UUID `bun:",type:uuid,nullzero" json:"convertedProjectId,omitempty"`
	RequestTokenHash    *string    `bun:",nullzero" json:"-"`
}

type ProjectUpdate struct {
	bun.BaseModel `bun:"table:project_updates,alias:pu"`
	RecordFields
	TenantID   uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	ProjectID  uuid.UUID  `bun:",type:uuid,notnull" json:"projectId"`
	AuthorID   *uuid.UUID `bun:",type:uuid,nullzero" json:"authorId,omitempty"`
	Title      string     `bun:",notnull" json:"title"`
	Body       string     `bun:",notnull" json:"body"`
	Visibility string     `bun:",notnull,default:'customer'" json:"visibility"`
}

type Notification struct {
	bun.BaseModel `bun:"table:notifications,alias:n"`
	RecordFields
	TenantID uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	UserID   uuid.UUID  `bun:",type:uuid,notnull" json:"userId"`
	Type     string     `bun:",notnull" json:"type"`
	Title    string     `bun:",notnull" json:"title"`
	Body     string     `bun:",notnull" json:"body"`
	Link     string     `bun:",nullzero" json:"link,omitempty"`
	ReadAt   *time.Time `bun:",nullzero" json:"readAt,omitempty"`
}
