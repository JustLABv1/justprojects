package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/config"
	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

var ErrInvalidCredentials = errors.New("invalid credentials")
var ErrSessionExpired = errors.New("session expired")

type Service struct {
	Store  *db.Store
	Config config.Config
	Cipher *Cipher
}

type RegisterInput struct {
	Email      string
	Name       string
	Password   string
	TenantName string
}

type LoginInput struct {
	Email    string
	Password string
	TenantID *uuid.UUID
}

type Principal struct {
	User           db.User
	Tenant         db.Tenant
	Membership     db.Membership
	Session        db.Session
	CustomerPageID *uuid.UUID
}

func NewService(store *db.Store, cfg config.Config) (*Service, error) {
	cipher, err := NewCipher(cfg.AppEncryptionKey)
	if err != nil {
		return nil, err
	}
	return &Service{Store: store, Config: cfg, Cipher: cipher}, nil
}

func (s *Service) Register(ctx context.Context, input RegisterInput) (*Principal, string, error) {
	email, err := normalizeEmail(input.Email)
	if err != nil {
		return nil, "", err
	}
	if strings.TrimSpace(input.Name) == "" || strings.TrimSpace(input.TenantName) == "" {
		return nil, "", fmt.Errorf("name and tenant name are required")
	}
	passwordHash, err := HashPassword(input.Password)
	if err != nil {
		return nil, "", err
	}
	now := time.Now().UTC()
	user := db.User{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, Email: email, Name: strings.TrimSpace(input.Name), PasswordHash: passwordHash, EmailVerified: false}
	tenant := db.Tenant{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, Name: strings.TrimSpace(input.TenantName), Slug: uniqueSlug(input.TenantName)}
	membership := db.Membership{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: tenant.ID, UserID: user.ID, Role: "owner"}

	tx, err := s.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", fmt.Errorf("begin registration: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	tenant.RequestSlug, err = uniqueRequestSlug(ctx, tx, tenant.Name)
	if err != nil {
		return nil, "", fmt.Errorf("generate tenant request slug: %w", err)
	}
	if _, err = tx.NewInsert().Model(&user).Exec(ctx); err != nil {
		return nil, "", fmt.Errorf("insert user: %w", err)
	}
	if _, err = tx.NewInsert().Model(&tenant).Exec(ctx); err != nil {
		return nil, "", fmt.Errorf("insert tenant: %w", err)
	}
	if _, err = tx.NewInsert().Model(&membership).Exec(ctx); err != nil {
		return nil, "", fmt.Errorf("insert membership: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return nil, "", fmt.Errorf("commit registration: %w", err)
	}
	principal, token, err := s.createSession(ctx, user, tenant, membership)
	return principal, token, err
}

func (s *Service) Login(ctx context.Context, input LoginInput) (*Principal, string, error) {
	email, err := normalizeEmail(input.Email)
	if err != nil {
		return nil, "", ErrInvalidCredentials
	}
	var user db.User
	if err = s.Store.DB.NewSelect().Model(&user).Where("lower(email) = lower(?)", email).Limit(1).Scan(ctx); err != nil || !VerifyPassword(input.Password, user.PasswordHash) {
		return nil, "", ErrInvalidCredentials
	}
	var membership db.Membership
	query := s.Store.DB.NewSelect().Model(&membership).Where("user_id = ?", user.ID).Order("created_at ASC").Limit(1)
	if input.TenantID != nil {
		query = query.Where("tenant_id = ?", *input.TenantID)
	}
	if err = query.Scan(ctx); err != nil {
		return nil, "", ErrInvalidCredentials
	}
	var tenant db.Tenant
	if err = s.Store.DB.NewSelect().Model(&tenant).Where("id = ?", membership.TenantID).Scan(ctx); err != nil {
		return nil, "", ErrInvalidCredentials
	}
	return s.createSession(ctx, user, tenant, membership)
}

// LoginCustomer authenticates a read-only page viewer without requiring an
// internal tenant membership. The session is bound to the page and the
// principal is deliberately assigned a non-privileged customer role.
func (s *Service) LoginCustomer(ctx context.Context, slug, email, password string) (*Principal, string, error) {
	var page db.PublicPage
	if err := s.Store.DB.NewSelect().Model(&page).Where("slug = ? AND access_mode = 'login' AND revoked = false", slug).Scan(ctx); err != nil {
		return nil, "", ErrInvalidCredentials
	}
	normalizedEmail, err := normalizeEmail(email)
	if err != nil {
		return nil, "", ErrInvalidCredentials
	}
	var user db.User
	if err = s.Store.DB.NewSelect().Model(&user).Where("lower(email) = lower(?)", normalizedEmail).Limit(1).Scan(ctx); err != nil || !VerifyPassword(password, user.PasswordHash) {
		return nil, "", ErrInvalidCredentials
	}
	viewerCount, err := s.Store.DB.NewSelect().Model((*db.PublicPageViewer)(nil)).Where("public_page_id = ? AND user_id = ?", page.ID, user.ID).Count(ctx)
	if err != nil || viewerCount != 1 {
		return nil, "", ErrInvalidCredentials
	}
	var tenant db.Tenant
	if err = s.Store.DB.NewSelect().Model(&tenant).Where("id = ?", page.TenantID).Scan(ctx); err != nil {
		return nil, "", ErrInvalidCredentials
	}
	return s.createSessionForPage(ctx, user, tenant, page.ID)
}

func (s *Service) createSession(ctx context.Context, user db.User, tenant db.Tenant, membership db.Membership) (*Principal, string, error) {
	return s.createSessionWithPage(ctx, user, tenant, membership, nil)
}

func (s *Service) createSessionForPage(ctx context.Context, user db.User, tenant db.Tenant, pageID uuid.UUID) (*Principal, string, error) {
	return s.createSessionWithPage(ctx, user, tenant, db.Membership{Role: "customer"}, &pageID)
}

func (s *Service) createSessionWithPage(ctx context.Context, user db.User, tenant db.Tenant, membership db.Membership, pageID *uuid.UUID) (*Principal, string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, "", fmt.Errorf("generate session token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	hash := sha256.Sum256([]byte(token))
	now := time.Now().UTC()
	session := db.Session{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, UserID: user.ID, TenantID: tenant.ID, PublicPageID: pageID, TokenHash: base64.RawURLEncoding.EncodeToString(hash[:]), ExpiresAt: now.Add(s.Config.SessionTTL)}
	if _, err := s.Store.DB.NewInsert().Model(&session).Exec(ctx); err != nil {
		return nil, "", fmt.Errorf("persist session: %w", err)
	}
	return &Principal{User: user, Tenant: tenant, Membership: membership, Session: session, CustomerPageID: pageID}, token, nil
}

func (s *Service) PrincipalFromToken(ctx context.Context, token string) (*Principal, error) {
	if token == "" {
		return nil, ErrSessionExpired
	}
	hash := sha256.Sum256([]byte(token))
	tokenHash := base64.RawURLEncoding.EncodeToString(hash[:])
	var session db.Session
	if err := s.Store.DB.NewSelect().Model(&session).Where("token_hash = ?", tokenHash).Where("expires_at > now()").Scan(ctx); err != nil {
		return nil, ErrSessionExpired
	}
	var user db.User
	var tenant db.Tenant
	var membership db.Membership
	if err := s.Store.DB.NewSelect().Model(&user).Where("id = ?", session.UserID).Scan(ctx); err != nil {
		return nil, ErrSessionExpired
	}
	if err := s.Store.DB.NewSelect().Model(&tenant).Where("id = ?", session.TenantID).Scan(ctx); err != nil {
		return nil, ErrSessionExpired
	}
	if session.PublicPageID != nil {
		var page db.PublicPage
		if pageErr := s.Store.DB.NewSelect().Model(&page).Where("id = ? AND tenant_id = ? AND revoked = false AND access_mode = 'login'", *session.PublicPageID, session.TenantID).Scan(ctx); pageErr != nil {
			return nil, ErrSessionExpired
		}
		viewerCount, viewerErr := s.Store.DB.NewSelect().Model((*db.PublicPageViewer)(nil)).Where("public_page_id = ? AND user_id = ?", page.ID, session.UserID).Count(ctx)
		if viewerErr != nil || viewerCount != 1 {
			return nil, ErrSessionExpired
		}
		membership = db.Membership{Role: "customer"}
	} else if err := s.Store.DB.NewSelect().Model(&membership).Where("tenant_id = ? AND user_id = ?", session.TenantID, session.UserID).Scan(ctx); err != nil {
		return nil, ErrSessionExpired
	}
	return &Principal{User: user, Tenant: tenant, Membership: membership, Session: session, CustomerPageID: session.PublicPageID}, nil
}

func (s *Service) DeleteSession(ctx context.Context, token string) error {
	hash := sha256.Sum256([]byte(token))
	_, err := s.Store.DB.NewDelete().Model((*db.Session)(nil)).Where("token_hash = ?", base64.RawURLEncoding.EncodeToString(hash[:])).Exec(ctx)
	return err
}

func (s *Service) LoginIdentity(ctx context.Context, provider, subject, email, name string) (*Principal, string, error) {
	var identity db.Identity
	identityErr := s.Store.DB.NewSelect().Model(&identity).Where("provider = ? AND subject = ?", provider, subject).Scan(ctx)
	var user db.User
	if identityErr == nil {
		if err := s.Store.DB.NewSelect().Model(&user).Where("id = ?", identity.UserID).Scan(ctx); err != nil {
			return nil, "", err
		}
	} else {
		normalizedEmail, err := normalizeEmail(email)
		if err != nil {
			return nil, "", err
		}
		if err = s.Store.DB.NewSelect().Model(&user).Where("lower(email) = lower(?)", normalizedEmail).Limit(1).Scan(ctx); err != nil {
			now := time.Now().UTC()
			user = db.User{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, Email: normalizedEmail, Name: strings.TrimSpace(name), EmailVerified: true}
			if user.Name == "" {
				user.Name = normalizedEmail
			}
			if _, err = s.Store.DB.NewInsert().Model(&user).Exec(ctx); err != nil {
				return nil, "", err
			}
		}
		now := time.Now().UTC()
		newIdentity := db.Identity{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, UserID: user.ID, Provider: provider, Subject: subject, Email: normalizedEmail}
		if _, err := s.Store.DB.NewInsert().Model(&newIdentity).On("CONFLICT (provider, subject) DO NOTHING").Exec(ctx); err != nil {
			return nil, "", err
		}
	}
	var membership db.Membership
	if err := s.Store.DB.NewSelect().Model(&membership).Where("user_id = ?", user.ID).Order("created_at ASC").Limit(1).Scan(ctx); err != nil {
		now := time.Now().UTC()
		tenant := db.Tenant{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, Name: user.Name + " Workspace", Slug: uniqueSlug(user.Name)}
		membership = db.Membership{RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now}, TenantID: tenant.ID, UserID: user.ID, Role: "owner"}
		requestSlug, slugErr := uniqueRequestSlug(ctx, s.Store.DB, tenant.Name)
		if slugErr != nil {
			return nil, "", fmt.Errorf("generate tenant request slug: %w", slugErr)
		}
		tenant.RequestSlug = requestSlug
		if _, err = s.Store.DB.NewInsert().Model(&tenant).Exec(ctx); err != nil {
			return nil, "", err
		}
		if _, err = s.Store.DB.NewInsert().Model(&membership).Exec(ctx); err != nil {
			return nil, "", err
		}
	}
	var tenant db.Tenant
	if err := s.Store.DB.NewSelect().Model(&tenant).Where("id = ?", membership.TenantID).Scan(ctx); err != nil {
		return nil, "", err
	}
	return s.createSession(ctx, user, tenant, membership)
}

func normalizeEmail(value string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(value))
	if _, err := mail.ParseAddress(email); err != nil || !strings.Contains(email, "@") {
		return "", fmt.Errorf("valid email is required")
	}
	return email, nil
}

func uniqueSlug(name string) string {
	return publicRequestSlug(name) + "-" + uuid.NewString()[:8]
}

func publicRequestSlug(name string) string {
	var b strings.Builder
	lastWasSeparator := false
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastWasSeparator = false
		} else if b.Len() > 0 && !lastWasSeparator {
			b.WriteRune('-')
			lastWasSeparator = true
		}
	}
	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		slug = "workspace"
	}
	if len(slug) > 56 {
		slug = strings.Trim(slug[:56], "-")
	}
	return slug
}

func uniqueRequestSlug(ctx context.Context, database bun.IDB, name string) (string, error) {
	baseSlug := publicRequestSlug(name)
	for duplicateNumber := 1; ; duplicateNumber++ {
		candidate := baseSlug
		if duplicateNumber > 1 {
			candidate = fmt.Sprintf("%s-%d", baseSlug, duplicateNumber)
		}
		count, err := database.NewSelect().Model((*db.Tenant)(nil)).Where("lower(request_slug) = lower(?)", candidate).Count(ctx)
		if err != nil {
			return "", err
		}
		if count == 0 {
			return candidate, nil
		}
	}
}

var _ bun.IDB = (*bun.DB)(nil)
