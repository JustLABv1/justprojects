export type StatusCategory =
  "backlog" | "todo" | "in_progress" | "blocked" | "done"

export type WorkspaceView =
  "overview" | "tasks" | "roadmap" | "integrations" | "settings"

export interface User {
  id: string
  name: string
  email: string
  emailVerified?: boolean
}

export interface Tenant {
  id: string
  name: string
  slug: string
  requestSlug: string
}

export interface Membership {
  id?: string
  role: "owner" | "admin" | "member" | "viewer" | string
}

export interface TenantMember {
  membership: Membership & { tenantId: string; userId: string }
  user: User
}

export interface Invitation {
  id: string
  tenantId: string
  email: string
  role: "admin" | "member" | "viewer" | string
  expiresAt: string
  acceptedAt?: string | null
}

export interface PermissionGrant {
  id: string
  tenantId: string
  userId: string
  projectId?: string | null
  permission: string
  effect: "allow" | "deny" | string
}

export interface Session {
  user: User
  tenant: Tenant
  membership: Membership
}

export interface Project {
  id: string
  name: string
  key: string
  description?: string
  startDate?: string | null
  targetDate?: string | null
  connectionId?: string | null
  status: string
  version: number
}

export type ProjectRequestStatus =
  | "submitted"
  | "in_review"
  | "needs_info"
  | "approved"
  | "rejected"
  | "converted"
  | "cancelled"
  | string

export interface ProjectRequest {
  id: string
  tenantId?: string
  sourcePublicPageId?: string | null
  requesterUserId?: string | null
  requesterName: string
  requesterEmail: string
  title: string
  description: string
  requestedStartDate?: string | null
  requestedTargetDate?: string | null
  priority: "low" | "medium" | "high" | "urgent" | string
  status: ProjectRequestStatus
  assignedTo?: string | null
  assignedToName?: string
  internalNotes?: string | null
  convertedProjectId?: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectUpdate {
  id: string
  projectId: string
  authorId?: string | null
  authorName?: string
  title: string
  body: string
  visibility: "internal" | "customer" | string
  createdAt: string
  updatedAt?: string
}

export interface Notification {
  id: string
  type: string
  title: string
  body: string
  link?: string | null
  readAt?: string | null
  createdAt: string
}

export interface PublicPageViewer {
  userId: string
  name?: string
  email?: string
}

export interface PortfolioProject {
  project: Project
  taskTotal: number
  completedTasks: number
  blockedTasks: number
  nextMilestone?: {
    id: string
    name: string
    dueDate?: string | null
    status: string
  } | null
  activeCustomerPages: number
}

export interface ProjectStatus {
  id: string
  projectId?: string
  name: string
  category: StatusCategory
  position: number
  color?: string
}

export interface Label {
  id: string
  name: string
  color: string
}

export interface Task {
  id: string
  projectId: string
  parentId?: string | null
  milestoneId?: string | null
  statusId: string
  statusName?: string
  statusCategory?: StatusCategory
  title: string
  description?: string
  priority: "low" | "medium" | "high" | "urgent" | string
  startDate?: string | null
  dueDate?: string | null
  estimateMinutes?: number | null
  assigneeId?: string | null
  assigneeName?: string
  visibility: "internal" | "customer" | string
  position: number
  version: number
  labels?: Label[]
  remoteAssignees?: RemoteAssignee[]
  createdAt?: string
  updatedAt?: string
}

export interface RemoteAssignee {
  provider: string
  login: string
  mapped: boolean
}

export interface GitUserMapping {
  id: string
  tenantId: string
  provider: string
  remoteLogin: string
  remoteId?: number | null
  userId: string
}

export interface SyncConflict {
  id: string
  tenantId: string
  externalLinkId: string
  field: string
  localValue: unknown
  remoteValue: unknown
  localChangedAt: string
  remoteChangedAt: string
  deliveryId?: string
  status: "open" | "resolved" | "ignored" | string
  resolution?: string
  projectId?: string
  localType?: string
  localId?: string
  localTitle?: string
  repositoryName?: string
  provider?: string
  externalNumber?: number
}

export interface Milestone {
  id: string
  projectId?: string
  name: string
  description?: string
  startDate?: string | null
  dueDate?: string | null
  status: "open" | "closed" | string
  visibility: "internal" | "customer" | string
  version: number
}

export interface SyncEvent {
  id: string
  provider?: "github" | "gitlab" | string
  eventName: string
  action?: string
  status: "queued" | "processing" | "succeeded" | "failed" | string
  createdAt: string
  updatedAt?: string
  errorMessage?: string
  payload?: Record<string, unknown>
  logs?: SyncEventLog[]
}

export interface SyncEventLog {
  id: string
  syncEventId: string
  level: "debug" | "info" | "warn" | "error" | string
  phase?: string
  message: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt?: string
}

export type GitProvider = "github" | "gitlab"

export interface GitConnection {
  id: string
  provider: GitProvider | string
  name?: string
  apiBaseUrl?: string
  authMethod: "app" | "oauth" | "pat" | string
  externalAccountId?: number
  externalAccountLogin?: string
  installationId?: number | null
  scopes: string[]
  active: boolean
}

export interface GitRepository {
  id: string
  connectionId: string
  externalId: number
  owner: string
  name: string
  fullName: string
  private: boolean
}

export type GitHubConnection = GitConnection
export type GitHubRepository = GitRepository

export interface ProjectRepository {
  link: {
    id: string
    projectId: string
    repositoryId: string
  }
  repository: GitRepository
}

export interface PublicPageSummary {
  id: string
  projectId: string
  slug: string
  accessMode: "link" | "login" | string
  title?: string
  revoked: boolean
}

export interface WorkspaceData {
  project: Project
  projects: Project[]
  statuses: ProjectStatus[]
  members: TenantMember[]
  tasks: Task[]
  milestones: Milestone[]
  labels: Label[]
  session?: Session
  syncEvents: SyncEvent[]
  gitConnections: GitConnection[]
  updates: ProjectUpdate[]
}

export interface PublicProjectData {
  page: {
    title?: string
    accessMode: "link" | "login" | string
  }
  project: {
    name: string
    key: string
    description?: string
    targetDate?: string | null
  }
  tasks: Array<
    Pick<
      Task,
      | "id"
      | "parentId"
      | "milestoneId"
      | "title"
      | "description"
      | "priority"
      | "startDate"
      | "dueDate"
      | "statusName"
      | "statusCategory"
      | "estimateMinutes"
    >
  >
  milestones: Array<
    Pick<
      Milestone,
      "id" | "name" | "description" | "startDate" | "dueDate" | "status"
    >
  >
  updates: ProjectUpdate[]
}
