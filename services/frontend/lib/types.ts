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
}

export interface Membership {
  id?: string
  role: "owner" | "admin" | "member" | "viewer" | string
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
  status: string
  version: number
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
  createdAt?: string
  updatedAt?: string
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
  eventName: string
  action?: string
  status: "queued" | "processing" | "succeeded" | "failed" | string
  createdAt: string
  errorMessage?: string
}

export interface GitHubConnection {
  id: string
  authMethod: "app" | "oauth" | string
  externalAccountLogin?: string
  scopes: string[]
  active: boolean
}

export interface GitHubRepository {
  id: string
  connectionId: string
  externalId: number
  owner: string
  name: string
  fullName: string
  private: boolean
}

export interface ProjectRepository {
  link: {
    id: string
    projectId: string
    repositoryId: string
  }
  repository: GitHubRepository
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
  tasks: Task[]
  milestones: Milestone[]
  labels: Label[]
  session?: Session
  syncEvents: SyncEvent[]
  githubConnections: GitHubConnection[]
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
}
