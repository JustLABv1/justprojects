# Graph Report - /Volumes/Storage/projects/justlab/justprojects  (2026-09-02)

## Corpus Check
- 150 files · ~202,937 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2047 nodes · 5729 edges · 84 communities (69 shown, 15 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 202 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- API Request Models
- Project Frontend Views
- GitHub Client
- Background Job Processing
- Shared UI Primitives
- Generated API Server
- Advanced Filter State
- Gantt Configuration
- Advanced Filter Rendering
- Cascader Core
- Filter State Management
- Application Route Pages
- Filter Chips
- Cascader Content
- OpenAPI Data Models
- Async Cascader Loading
- Dialogs and App Shell
- Date Filter Controls
- Filter Builder
- Gantt Columns
- Kanban Board
- Cascader Selection
- TypeScript Runtime Types
- Gantt Bars
- Backend Data Models
- Gantt Data Processing
- Cascader Footer
- Filter Drag and Drop
- API Input Types
- Gantt Drag and Drop
- Roadmap Timeline
- Frontend Tooling
- Gantt Metrics
- Timeline Component
- Authentication Service
- Frontend Dependencies
- Filter Editors
- Gantt Store
- Application Layout
- Cascader Utilities
- Worker Runtime
- Component Aliases
- Date Filter Logic
- Gantt API
- Runtime Configuration
- Integration API Models
- Project Tooling Config
- Gantt Navigation
- Invitation API Models
- OIDC Authentication
- Status API Models
- Tenant API Models
- Permission Service
- Frontend Scripts
- MCP UI Integration
- Password Authentication
- Encryption Service
- HTTP Server Adapter
- Frontend API Types
- GitHub OAuth Flow
- Sync API Queries
- Sync Worker Helpers
- Frontend Package Metadata
- Audit and Sync Queries
- Repository API Models
- Milestone API Models
- Frontend Utility Dependencies
- Repository Query Parameters
- Timezone Utilities
- MCP Integration
- Theme Management
- Conflict API Models
- Public Page API
- React DOM Runtime
- ESLint Configuration
- Next Configuration
- Tailwind Utilities
- Virtualized Lists
- Animation Styles
- PostCSS Configuration
- Go Module Metadata

## God Nodes (most connected - your core abstractions)
1. `cn()` - 224 edges
2. `Server` - 103 edges
3. `react` - 76 edges
4. `ServerInterfaceWrapper` - 71 edges
5. `writeError()` - 65 edges
6. `useI18n()` - 50 edges
7. `request()` - 44 edges
8. `Filters()` - 40 edges
9. `badRequest()` - 37 edges
10. `notFound()` - 36 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `Load()`  [INFERRED]
  services/backend/cmd/worker/main.go → services/backend/internal/config/config.go
- `NewService()` --calls--> `NewCipher()`  [INFERRED]
  services/backend/internal/auth/service.go → services/backend/internal/auth/crypto.go
- `NewProcessor()` --calls--> `NewCipher()`  [INFERRED]
  services/backend/internal/sync/processor.go → services/backend/internal/auth/crypto.go
- `main()` --calls--> `Load()`  [INFERRED]
  services/backend/main.go → services/backend/internal/config/config.go
- `main()` --calls--> `NewServer()`  [INFERRED]
  services/backend/main.go → services/backend/internal/httpapi/server.go

## Import Cycles
- None detected.

## Communities (84 total, 15 thin omitted)

### Community 0 - "API Request Models"
Cohesion: 0.05
Nodes (63): OAuthToken, apiError, githubUserMappingRequest, invitationRequest, labelRequest, loginRequest, memberRoleRequest, milestoneRequest (+55 more)

### Community 1 - "Project Frontend Views"
Cohesion: 0.05
Nodes (83): views, LoginPage(), GitConnectionDialog(), NewMilestoneInput, UpdateMilestoneInput, capitalize(), defaultPublicPageSlug(), emptyWorkspace (+75 more)

### Community 2 - "GitHub Client"
Cohesion: 0.05
Nodes (57): Engine, Client, roundTripFunc, Client, rawIssue, rawMilestone, rawProject, HandlerFunc (+49 more)

### Community 3 - "Background Job Processing"
Cohesion: 0.06
Nodes (57): OutboxJob, Queue, Context, UUID, canonicalStrings(), datePtr(), dateValue(), decodeNested() (+49 more)

### Community 4 - "Shared UI Primitives"
Cohesion: 0.04
Nodes (58): SearchGroupLabel(), RowIssueHint(), Frame(), FrameDescription(), FrameFooter(), FrameHeader(), FramePanel(), FrameTitle() (+50 more)

### Community 5 - "Generated API Server"
Cohesion: 0.06
Nodes (6): MilestoneQuery, ListTasksParams, ServerInterfaceWrapper, Query, Context, StatusQuery

### Community 6 - "Advanced Filter State"
Cohesion: 0.05
Nodes (61): FiltersAdvancedPanelProps, RowPosition, FALLBACK_FOCUS_STORE, FALLBACK_ROW_STATE_STORE, FILTER_CONTROL_SIZES, FilterActionsContext, FilterActionsContextValue, FilterFocus (+53 more)

### Community 7 - "Gantt Configuration"
Cohesion: 0.05
Nodes (53): DEFAULT_INTERACTIONS, DEFAULT_VIEW_CONFIG, EMPTY_SELECTION, Gantt(), GanttActivationConfig, GanttBaselineProps, GanttCallbacks, GanttClassNames (+45 more)

### Community 8 - "Advanced Filter Rendering"
Cohesion: 0.10
Nodes (60): ACTION_BAND_CLASS, ACTION_COLUMNS, ACTION_CONTROL_CLASS, addFilterRow(), canFilterNodeMove(), CELL_CLASS, cellProps(), COMBINATOR_CLASS (+52 more)

### Community 9 - "Cascader Core"
Cohesion: 0.08
Nodes (53): Cascader(), CascaderChipKeyEvent, CascaderChipRemoveClickEvent, CascaderChips(), CascaderChipsProps, CascaderContentProps, CascaderEmptyProps, CascaderListProps (+45 more)

### Community 10 - "Filter State Management"
Cohesion: 0.11
Nodes (52): createFilterFocusStore(), createFilterResolutionStore(), createFilterRowStateStore(), isFilterDraftCommittable(), resolveFilterEditor(), Filters(), FiltersRowProps, resolveFilterLabels() (+44 more)

### Community 11 - "Application Route Pages"
Cohesion: 0.06
Nodes (33): metadata, RegisterPage(), AppHome(), AppShell(), ThemeSwitcher(), WorkspaceSearchDialog(), FeedbackNotice(), useI18n() (+25 more)

### Community 12 - "Filter Chips"
Cohesion: 0.07
Nodes (43): FilterAdvancedRowProps, usesInlineTextEditor(), ChipSegment, defaultValueDisplay(), FilterChip, FilterChipProps, FilterOperatorPopoverProps, FilterRuleDisplay (+35 more)

### Community 13 - "Cascader Content"
Cohesion: 0.09
Nodes (46): react, useCascaderLoadState(), CascaderContent(), CascaderEmpty(), CascaderList(), CascaderColumnPanel(), CascaderColumnPanelProps, CascaderColumns() (+38 more)

### Community 14 - "OpenAPI Data Models"
Cohesion: 0.06
Nodes (41): AddPublicPageViewerJSONRequestBody, AttachProjectRepositoryJSONRequestBody, Error, GitHubUserMapping, GitHubUserMappingList, GitTokenConnectionRequest, Health, ImportGitHubProjectJSONRequestBody (+33 more)

### Community 15 - "Async Cascader Loading"
Cohesion: 0.09
Nodes (38): CascaderGetChildren, CascaderLoader, CascaderLoaderLatest, CascaderLoaderStore, CascaderOnSearch, CascaderResolveValue, createStore(), NO_RESULTS (+30 more)

### Community 16 - "Dialogs and App Shell"
Cohesion: 0.21
Nodes (20): navigation, LanguageSwitcher(), Button(), Dialog(), DialogContent(), DialogDescription(), DialogFooter(), DialogHeader() (+12 more)

### Community 17 - "Date Filter Controls"
Cohesion: 0.07
Nodes (35): getFilterLabels(), getGermanFilterOperatorLabels(), TaskToolbar(), DateSelector(), DateSelectorContext, DateSelectorContextValue, DateSelectorDateSelectorPeriodGridProps, DateSelectorDateSelectorPeriodTabsProps (+27 more)

### Community 18 - "Filter Builder"
Cohesion: 0.09
Nodes (35): CascaderStatus(), CascaderNav(), FilterAdvancedNode(), FilterFieldPicker(), FiltersBuilderProps, toCascaderNodes(), filterFieldKey(), useFilterOptions() (+27 more)

### Community 19 - "Gantt Columns"
Cohesion: 0.08
Nodes (38): GanttColumn, getDayKey(), getLaneKey(), packTimedSegments(), resolveOffDay(), resolveTimelineLines(), DEFAULT_TREE_PANEL, DEFAULT_ZOOM_RANGE (+30 more)

### Community 20 - "Kanban Board"
Cohesion: 0.07
Nodes (35): formatShortDate(), KanbanBoardView(), KanbanTaskCard(), animateLayoutChanges(), ColumnContext, dropAnimationConfig, getIsMounted(), getIsMountedOnServer() (+27 more)

### Community 21 - "Cascader Selection"
Cohesion: 0.07
Nodes (34): CascaderSearchSlice, CascaderChipProps, CascaderContextValue, CascaderSelection, CascaderActionsContext, CascaderActionsContextValue, CascaderHighlight, CascaderHighlightContext (+26 more)

### Community 22 - "TypeScript Runtime Types"
Cohesion: 0.07
Nodes (29): dom, dom.iterable, esnext, **/*.mts, next.config.ts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts (+21 more)

### Community 23 - "Gantt Bars"
Cohesion: 0.09
Nodes (21): GANTT_COLORS, GanttBar(), GanttBarContext, GanttBarContextValue, GanttBarProps, wasRecentDrag(), GanttRenderEventProps, getBaselineVariance() (+13 more)

### Community 24 - "Backend Data Models"
Cohesion: 0.27
Nodes (27): BaseModel, AuditEvent, ExternalLink, GitConnection, GitRepository, GitUserMapping, Identity, Label (+19 more)

### Community 25 - "Gantt Data Processing"
Cohesion: 0.11
Nodes (21): RFC-5545, buildDependencyPath(), buildEventIndex(), DEFAULT_WEEKEND_DAYS, flattenResources(), GanttDependencyGeometry, GanttLaneMemo, occurrenceIntersects() (+13 more)

### Community 26 - "Cascader Footer"
Cohesion: 0.12
Nodes (25): actionKey(), CascaderAction(), CascaderActionList(), CascaderActionProps, CascaderFooter(), CascaderFooterActions(), CascaderFooterProps, CascaderMenuContext (+17 more)

### Community 27 - "Filter Drag and Drop"
Cohesion: 0.11
Nodes (24): activeCancels, collectSurface(), contains(), FILTER_DND_ACTIVATION, FILTER_DROP_ZONE_SELECTOR, FILTER_GROUP_SELECTOR, FILTER_ROW_SEAM_PX, FILTER_ROW_SELECTOR (+16 more)

### Community 28 - "API Input Types"
Cohesion: 0.11
Nodes (25): Date, AddPublicPageViewerJSONBody, AttachProjectRepositoryJSONBody, GitHubUserMappingRequest, ImportGitHubProjectJSONBody, ImportGitProjectJSONBody, Project, ProjectList (+17 more)

### Community 29 - "Gantt Drag and Drop"
Cohesion: 0.12
Nodes (22): activeGestureCancels, beginGesture(), BeginGestureConfig, cancelActiveGanttGestures(), collectSurface(), GANTT_ACTIVATION, GanttSurface, GestureKind (+14 more)

### Community 30 - "Roadmap Timeline"
Cohesion: 0.14
Nodes (19): buildGanttData(), formatDate(), parseDate(), RoadmapView(), categoryLabels, PriorityPill(), statusColor(), StatusPill() (+11 more)

### Community 31 - "Frontend Tooling"
Cohesion: 0.09
Nodes (23): eslint, eslint-config-next, openapi-typescript, prettier, prettier-plugin-tailwindcss, devDependencies, eslint, eslint-config-next (+15 more)

### Community 32 - "Gantt Metrics"
Cohesion: 0.13
Nodes (19): GanttMetrics, GanttProps, GanttSettings, DEFAULT_FORMATS, DEFAULT_GANTT_I18N, DEFAULT_LABELS, GanttI18nConfig, GanttI18nOverrides (+11 more)

### Community 33 - "Timeline Component"
Cohesion: 0.13
Nodes (21): Timeline(), TimelineContent(), TimelineContext, TimelineContextValue, TimelineDate(), TimelineDateProps, TimelineHeader(), TimelineIndicator() (+13 more)

### Community 34 - "Authentication Service"
Cohesion: 0.27
Nodes (12): LoginInput, Principal, RegisterInput, Service, Context, Membership, Tenant, User (+4 more)

### Community 35 - "Frontend Dependencies"
Cohesion: 0.10
Nodes (21): @base-ui/react, class-variance-authority, date-fns, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, next, react-day-picker (+13 more)

### Community 36 - "Filter Editors"
Cohesion: 0.11
Nodes (15): CascaderProps, BOOLEAN_ITEMS, DEFAULT_FILTER_EDITORS, EditorPanel(), FilterBooleanEditor(), FilterListItem, FilterMenuMeta, FilterNumberEditor() (+7 more)

### Community 37 - "Gantt Store"
Cohesion: 0.18
Nodes (18): createGanttStore(), GanttStore, getDayTotalMinutes(), getGanttDateRange(), getRangeKey(), stepGanttDate(), toZoned(), zonedStartOfDay() (+10 more)

### Community 38 - "Application Layout"
Cohesion: 0.15
Nodes (15): metadata, RootLayout(), LanguageContext, LanguageContextValue, LanguageProvider(), ThemeHotkey(), ThemeProvider(), ToastProvider() (+7 more)

### Community 39 - "Cascader Utilities"
Cohesion: 0.17
Nodes (17): CascaderChip(), resolveCascaderSearchLabel(), collapseCascaderPath(), getCascaderFooterStops(), getCascaderPath(), isCascaderRtl(), CascaderBackProps, CascaderBreadcrumb() (+9 more)

### Community 40 - "Worker Runtime"
Cohesion: 0.15
Nodes (11): Store, main(), NewService(), Context, DB, Open(), Context, DB (+3 more)

### Community 41 - "Component Aliases"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+8 more)

### Community 42 - "Date Filter Logic"
Cohesion: 0.15
Nodes (14): applyFilterRelative(), EXPLICIT_FORMATS, FILTER_DATE_FORMAT, FilterDateValue, FilterRelativeDate, formatFilterDate(), parseFilterDate(), RELATIVE_NEXT_WEEK (+6 more)

### Community 43 - "Gantt API"
Cohesion: 0.17
Nodes (3): GanttApi, GanttBarId, GanttEvent

### Community 44 - "Runtime Configuration"
Cohesion: 0.26
Nodes (12): Config, DatabaseConfig, Duration, getenv(), getenvBool(), getenvDuration(), getenvInt(), Load() (+4 more)

### Community 45 - "Integration API Models"
Cohesion: 0.15
Nodes (13): GitProvider, AuditEvent, AuditEventList, GitConnection, GitConnectionAuthMethod, GitConnectionList, GitProvider, SyncConflict (+5 more)

### Community 46 - "Project Tooling Config"
Cohesion: 0.15
Nodes (12): config:recommended, dependencies, eslint, extends, ignoreDeps, labels, packageRules, prConcurrentLimit (+4 more)

### Community 47 - "Gantt Navigation"
Cohesion: 0.21
Nodes (9): GanttScaleSwitcher(), GanttState, useGantt(), useGanttInteractions(), useGanttOccurrences(), useGanttScale(), useGanttSelection(), useGanttSelector() (+1 more)

### Community 48 - "Invitation API Models"
Cohesion: 0.20
Nodes (10): Email, Invitation, InvitationCreated, InvitationList, InvitationRequest, InvitationRequestRole, InvitationRole, LoginRequest (+2 more)

### Community 49 - "OIDC Authentication"
Cohesion: 0.39
Nodes (4): OIDCService, Context, Service, issuerHost()

### Community 50 - "Status API Models"
Cohesion: 0.25
Nodes (8): Label, LabelList, StatusCategory, StatusRequest, Task, TaskList, TaskPriority, TaskVisibility

### Community 51 - "Tenant API Models"
Cohesion: 0.29
Nodes (8): Membership, MembershipRole, Session, Tenant, TenantMember, TenantWithMembers, Tenant, User

### Community 52 - "Permission Service"
Cohesion: 0.36
Nodes (6): PermissionGrant, Service, Context, UUID, grantMatches(), permissionNames()

### Community 53 - "Frontend Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, format, generate:api-types, lint, start, typecheck

### Community 54 - "MCP UI Integration"
Cohesion: 0.29
Nodes (6): mcp, reui, enabled, type, url, $schema

### Community 55 - "Password Authentication"
Cohesion: 0.43
Nodes (5): HashPassword(), T, TestPasswordHashAndVerify(), TestVerifyPasswordRejectsMalformedHash(), VerifyPassword()

### Community 56 - "Encryption Service"
Cohesion: 0.40
Nodes (3): AEAD, Cipher, NewCipher()

### Community 57 - "HTTP Server Adapter"
Cohesion: 0.47
Nodes (6): IRouter, GinServerOptions, MiddlewareFunc, ServerInterface, RegisterHandlers(), RegisterHandlersWithOptions()

### Community 58 - "Frontend API Types"
Cohesion: 0.33
Nodes (5): components, $defs, operations, paths, webhooks

### Community 59 - "GitHub OAuth Flow"
Cohesion: 0.50
Nodes (5): OIDCCode, OIDCState, CompleteGitHubAppInstallParams, CompleteGitHubOAuthParams, CompleteOIDCParams

### Community 60 - "Sync API Queries"
Cohesion: 0.40
Nodes (5): ListPermissionGrantsParams, ListSyncConflictsParams, ListSyncConflictsParamsStatus, ProjectQuery, UserQuery

### Community 61 - "Sync Worker Helpers"
Cohesion: 0.40
Nodes (4): Context, UUID, ParseUUID(), ProcessJob()

### Community 62 - "Frontend Package Metadata"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 63 - "Audit and Sync Queries"
Cohesion: 0.50
Nodes (4): Limit, ListAuditEventsParams, ListSyncRunsParams, ListSyncRunsParamsStatus

### Community 64 - "Repository API Models"
Cohesion: 0.50
Nodes (4): GitRepository, GitRepositoryList, ProjectRepository, ProjectRepositoryList

### Community 65 - "Milestone API Models"
Cohesion: 0.50
Nodes (4): Milestone, MilestoneList, MilestoneStatus, MilestoneVisibility

## Knowledge Gaps
- **354 isolated node(s):** `reui`, `$schema`, `type`, `url`, `enabled` (+349 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Shared UI Primitives` to `Project Frontend Views`, `Gantt Configuration`, `Advanced Filter Rendering`, `Cascader Core`, `Filter State Management`, `Application Route Pages`, `Filter Chips`, `Cascader Content`, `Dialogs and App Shell`, `Date Filter Controls`, `Filter Builder`, `Gantt Columns`, `Kanban Board`, `Cascader Selection`, `Gantt Bars`, `Cascader Footer`, `Gantt Drag and Drop`, `Roadmap Timeline`, `Timeline Component`, `Filter Editors`, `Gantt Store`, `Application Layout`, `Cascader Utilities`, `Gantt Navigation`?**
  _High betweenness centrality (0.161) - this node is a cross-community bridge._
- **Why does `react` connect `Cascader Content` to `Frontend Dependencies`, `Filter Editors`, `Advanced Filter State`, `Cascader Utilities`, `Advanced Filter Rendering`, `Cascader Core`, `Filter State Management`, `Application Layout`, `Filter Chips`, `Async Cascader Loading`, `Date Filter Controls`, `Filter Builder`, `Cascader Selection`, `Cascader Footer`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Frontend Dependencies` to `Frontend Utility Dependencies`, `Timezone Utilities`, `Theme Management`, `React DOM Runtime`, `Cascader Content`, `Tailwind Utilities`, `Virtualized Lists`, `Animation Styles`, `Frontend Package Metadata`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `reui`, `$schema`, `type` to the rest of the system?**
  _354 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API Request Models` be split into smaller, more focused modules?**
  _Cohesion score 0.05482544545674434 - nodes in this community are weakly interconnected._
- **Should `Project Frontend Views` be split into smaller, more focused modules?**
  _Cohesion score 0.052192982456140354 - nodes in this community are weakly interconnected._
- **Should `GitHub Client` be split into smaller, more focused modules?**
  _Cohesion score 0.05347985347985348 - nodes in this community are weakly interconnected._