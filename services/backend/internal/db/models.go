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
	Name string `bun:",notnull" json:"name"`
	Slug string `bun:",notnull,unique" json:"slug"`
}

type User struct {
	bun.BaseModel `bun:"table:users,alias:u"`
	RecordFields
	Email         string `bun:",notnull,unique" json:"email"`
	Name          string `bun:",notnull" json:"name"`
	PasswordHash  string `bun:",nullzero" json:"-"`
	EmailVerified bool   `bun:",notnull,default:false" json:"emailVerified"`
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
	TenantID    uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	Name        string     `bun:",notnull" json:"name"`
	Key         string     `bun:",notnull" json:"key"`
	Description string     `bun:",nullzero" json:"description"`
	StartDate   *time.Time `bun:",nullzero" json:"startDate,omitempty"`
	TargetDate  *time.Time `bun:",nullzero" json:"targetDate,omitempty"`
	Status      string     `bun:",notnull,default:'active'" json:"status"`
	CreatedBy   uuid.UUID  `bun:",type:uuid,notnull" json:"createdBy"`
	Version     int64      `bun:",notnull,default:1" json:"version"`
}

type ProjectStatus struct {
	bun.BaseModel `bun:"table:project_statuses,alias:ps"`
	RecordFields
	ProjectID uuid.UUID `bun:",type:uuid,notnull" json:"projectId"`
	Name      string    `bun:",notnull" json:"name"`
	Category  string    `bun:",notnull" json:"category"`
	Position  int       `bun:",notnull,default:0" json:"position"`
	Color     string    `bun:",nullzero" json:"color"`
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
	EstimateMins *int       `bun:",nullzero" json:"estimateMinutes,omitempty"`
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

type GitHubConnection struct {
	bun.BaseModel `bun:"table:github_connections,alias:gc"`
	RecordFields
	TenantID              uuid.UUID  `bun:",type:uuid,notnull" json:"tenantId"`
	AuthMethod            string     `bun:",notnull" json:"authMethod"`
	InstallationID        *int64     `bun:",nullzero" json:"installationId,omitempty"`
	ExternalAccountID     int64      `bun:",notnull" json:"externalAccountId"`
	ExternalAccountLogin  string     `bun:",nullzero" json:"externalAccountLogin"`
	EncryptedAccessToken  string     `bun:",nullzero" json:"-"`
	EncryptedRefreshToken string     `bun:",nullzero" json:"-"`
	TokenExpiresAt        *time.Time `bun:",nullzero" json:"tokenExpiresAt,omitempty"`
	Scopes                []string   `bun:",type:jsonb,notnull,default:'[]'" json:"scopes"`
	Active                bool       `bun:",notnull,default:true" json:"active"`
}

type GitHubRepository struct {
	bun.BaseModel `bun:"table:github_repositories,alias:gr"`
	RecordFields
	ConnectionID uuid.UUID `bun:",type:uuid,notnull" json:"connectionId"`
	ExternalID   int64     `bun:",notnull" json:"externalId"`
	Owner        string    `bun:",notnull" json:"owner"`
	Name         string    `bun:",notnull" json:"name"`
	FullName     string    `bun:",notnull" json:"fullName"`
	Private      bool      `bun:",notnull,default:false" json:"private"`
}

type GitHubUserMapping struct {
	bun.BaseModel `bun:"table:github_user_mappings,alias:gum"`
	RecordFields
	TenantID    uuid.UUID `bun:",type:uuid,notnull" json:"tenantId"`
	GitHubLogin string    `bun:",notnull" json:"githubLogin"`
	UserID      uuid.UUID `bun:",type:uuid,notnull" json:"userId"`
}

type ProjectRepository struct {
	bun.BaseModel `bun:"table:project_repositories,alias:pr"`
	RecordFields
	ProjectID    uuid.UUID `bun:",type:uuid,notnull" json:"projectId"`
	RepositoryID uuid.UUID `bun:",type:uuid,notnull" json:"repositoryId"`
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

type SyncEvent struct {
	bun.BaseModel `bun:"table:sync_events,alias:se"`
	RecordFields
	TenantID     *uuid.UUID     `bun:",type:uuid,nullzero" json:"tenantId,omitempty"`
	ConnectionID *uuid.UUID     `bun:",type:uuid,nullzero" json:"connectionId,omitempty"`
	DeliveryID   string         `bun:",notnull,unique" json:"deliveryId"`
	EventName    string         `bun:",notnull" json:"eventName"`
	Action       string         `bun:",nullzero" json:"action"`
	Payload      map[string]any `bun:",type:jsonb,notnull" json:"payload"`
	Status       string         `bun:",notnull,default:'queued'" json:"status"`
	ErrorMessage string         `bun:",nullzero" json:"errorMessage"`
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
	TenantID            uuid.UUID   `bun:",type:uuid,notnull" json:"tenantId"`
	ProjectID           uuid.UUID   `bun:",type:uuid,notnull" json:"projectId"`
	Slug                string      `bun:",notnull,unique" json:"slug"`
	TokenHash           string      `bun:",notnull,unique" json:"-"`
	AccessMode          string      `bun:",notnull,default:'link'" json:"accessMode"`
	Title               string      `bun:",nullzero" json:"title"`
	VisibleTaskIDs      []uuid.UUID `bun:",type:jsonb,notnull,default:'[]'" json:"visibleTaskIds"`
	VisibleMilestoneIDs []uuid.UUID `bun:",type:jsonb,notnull,default:'[]'" json:"visibleMilestoneIds"`
	Revoked             bool        `bun:",notnull,default:false" json:"revoked"`
}

type PublicPageViewer struct {
	bun.BaseModel `bun:"table:public_page_viewers,alias:pv"`
	RecordFields
	PublicPageID uuid.UUID `bun:",type:uuid,notnull" json:"publicPageId"`
	UserID       uuid.UUID `bun:",type:uuid,notnull" json:"userId"`
}
