import type {
  GitConnection,
  GitRepository,
  GitHubConnection,
  GitHubRepository,
  Label,
  Milestone,
  Project,
  ProjectRequest,
  ProjectRequestStatus,
  ProjectUpdate,
  Notification,
  PortfolioProject,
  PublicPageViewer,
  ProjectRepository,
  ProjectStatus,
  PublicPageSummary,
  PublicProjectData,
  Invitation,
  PermissionGrant,
  Session,
  SyncEvent,
  SyncEventLog,
  SyncConflict,
  Task,
  TenantMember,
  GitUserMapping,
} from "@/lib/types"

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL
const API_URL = (
  configuredApiUrl ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8080" : "")
).replace(/\/$/, "")

// Production images use same-origin /api/v1 requests by default. A reverse
// proxy or ingress should route that path to the backend service. Local
// development keeps the direct localhost backend default unless overridden.
export const isApiConfigured =
  API_URL.length > 0 || process.env.NODE_ENV !== "development"

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isApiConfigured) {
    throw new ApiError("The backend API is not configured.", 0)
  }

  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the status-derived message when the server did not return JSON.
    }
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function getSession() {
  return request<Session>("/auth/session")
}

export function login(input: {
  email: string
  password: string
  tenantId?: string
}) {
  return request<Session>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function register(input: {
  email: string
  name: string
  password: string
  tenantName: string
}) {
  return request<Session>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function logout() {
  return request<void>("/auth/logout", { method: "POST" })
}

export function getOidcStartUrl() {
  return request<{ url: string }>("/auth/oidc/start")
}

export function listProjects() {
  return request<{ items: Project[] }>("/projects")
}

export function getPortfolio() {
  return request<{ items: PortfolioProject[] }>("/portfolio")
}

export function listProjectRequests(query?: {
  status?: ProjectRequestStatus
  q?: string
}) {
  const params = new URLSearchParams()
  if (query?.status) params.set("status", query.status)
  if (query?.q) params.set("search", query.q)
  const suffix = params.size ? `?${params.toString()}` : ""
  return request<{ items: ProjectRequest[] }>(`/project-requests${suffix}`)
}

export function updateProjectRequest(
  requestId: string,
  input: Partial<{
    status: ProjectRequestStatus
    assignedTo: string | null
    internalNotes: string
  }>
) {
  return request<{ request: ProjectRequest }>(
    `/project-requests/${requestId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    }
  )
}

export function convertProjectRequest(
  requestId: string,
  input?: Partial<{
    name: string
    key: string
    description: string
    targetDate: string | null
  }>
) {
  return request<{ request: ProjectRequest; project: Project }>(
    `/project-requests/${requestId}/convert`,
    {
      method: "POST",
      body: JSON.stringify(input ?? {}),
    }
  )
}

export function listTenantMembers() {
  return request<{ members: TenantMember[] }>("/tenant/members")
}

export function updateTenantMemberRole(
  userId: string,
  role: "admin" | "member" | "viewer"
) {
  return request(`/tenant/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  })
}

export function listInvitations() {
  return request<{ items: Invitation[] }>("/tenant/invitations")
}

export function createInvitation(input: {
  email: string
  role: "admin" | "member" | "viewer"
}) {
  return request<{ invitation: Invitation; acceptUrl: string }>(
    "/tenant/invitations",
    { method: "POST", body: JSON.stringify(input) }
  )
}

export function listPermissionGrants(projectId?: string) {
  const suffix = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""
  return request<{ items: PermissionGrant[] }>(`/tenant/permissions${suffix}`)
}

export function getProject(projectId: string) {
  return request<{ project: Project; statuses: ProjectStatus[] }>(
    `/projects/${projectId}`
  )
}

export function createProjectStatus(
  projectId: string,
  input: {
    name: string
    category: ProjectStatus["category"]
    color?: string
    position?: number
  }
) {
  return request<ProjectStatus>(`/projects/${projectId}/statuses`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateProjectStatus(
  projectId: string,
  statusId: string,
  input: Partial<{
    name: string
    category: ProjectStatus["category"]
    color: string
    position: number
  }>
) {
  return request<ProjectStatus>(`/projects/${projectId}/statuses/${statusId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function updateProject(
  projectId: string,
  input: Partial<{
    name: string
    description: string
    targetDate: string | null
    connectionId: string | null
    version: number
  }>
) {
  return request<Project>(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function createProject(input: {
  name: string
  key?: string
  description?: string
  startDate?: string
  targetDate?: string
  connectionId?: string
}) {
  return request<Project>("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function listTasks(
  projectId: string,
  query?: { q?: string; statusId?: string; milestoneId?: string }
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) params.set(key, value)
  }
  const suffix = params.size ? `?${params.toString()}` : ""
  return request<{ items: Task[] }>(`/projects/${projectId}/tasks${suffix}`)
}

export function createTask(
  projectId: string,
  input: {
    title: string
    description?: string
    statusId?: string
    parentId?: string
    milestoneId?: string
    priority?: string
    startDate?: string
    dueDate?: string
    estimateMinutes?: number
    assigneeId?: string | null
    visibility?: string
  }
) {
  return request<Task>(`/projects/${projectId}/tasks`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateTask(
  projectId: string,
  taskId: string,
  input: Partial<{
    title: string
    description: string
    statusId: string
    parentId: string | null
    milestoneId: string | null
    priority: string
    startDate: string
    dueDate: string
    estimateMinutes: number
    assigneeId: string | null
    labelIds: string[]
    visibility: string
    position: number
    version: number
  }>
) {
  return request<Task>(`/projects/${projectId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function updateMilestone(
  projectId: string,
  milestoneId: string,
  input: Partial<{
    name: string
    description: string
    startDate: string
    dueDate: string
    status: "open" | "closed"
    visibility: string
    version: number
  }>
) {
  return request<Milestone>(
    `/projects/${projectId}/milestones/${milestoneId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    }
  )
}

export function listMilestones(projectId: string) {
  return request<{ items: Milestone[] }>(`/projects/${projectId}/milestones`)
}

export function createMilestone(
  projectId: string,
  input: {
    name: string
    description?: string
    startDate?: string
    dueDate?: string
    status?: "open" | "closed"
    visibility?: string
  }
) {
  return request<Milestone>(`/projects/${projectId}/milestones`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function listLabels(projectId: string) {
  return request<{ items: Label[] }>(`/projects/${projectId}/labels`)
}

export function listGitHubConnections() {
  return request<{ items: GitHubConnection[] }>(
    "/integrations/github/connections"
  )
}

export function listGitConnections() {
  return request<{ items: GitConnection[]; count?: number }>(
    "/integrations/connections"
  )
}

export function createGitHubTokenConnection(input: {
  name?: string
  accessToken: string
  webhookSecret?: string
}) {
  return request<GitConnection>("/integrations/github/connections", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function createGitLabConnection(input: {
  name?: string
  baseUrl?: string
  accessToken: string
  webhookSecret?: string
}) {
  return request<GitConnection>("/integrations/gitlab/connections", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function deleteGitConnection(connectionId: string) {
  return request<void>(`/integrations/connections/${connectionId}`, {
    method: "DELETE",
  })
}

export function getGitHubOAuthStartUrl() {
  return request<{ url: string }>("/integrations/github/oauth/start")
}

export function getGitHubAppInstallUrl() {
  return request<{ url: string }>("/integrations/github/app/install")
}

export function listGitHubRepositories() {
  return request<{ items: GitHubRepository[] }>(
    "/integrations/github/repositories"
  )
}

export function listGitHubUserMappings() {
  return request<{ items: GitUserMapping[]; count?: number }>(
    "/integrations/github/user-mappings"
  )
}

export function createGitHubUserMapping(input: {
  githubLogin: string
  userId: string
}) {
  return request<GitUserMapping>("/integrations/github/user-mappings", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function deleteGitHubUserMapping(mappingId: string) {
  return request<void>(`/integrations/github/user-mappings/${mappingId}`, {
    method: "DELETE",
  })
}

export function listGitRepositories(connectionId?: string) {
  const suffix = connectionId
    ? `?connectionId=${encodeURIComponent(connectionId)}`
    : ""
  return request<{ items: GitRepository[]; count?: number }>(
    `/integrations/repositories${suffix}`
  )
}

export function listProjectRepositories(projectId: string) {
  return request<{ items: ProjectRepository[] }>(
    `/projects/${projectId}/repositories`
  )
}

export function attachProjectRepository(
  projectId: string,
  repositoryId: string
) {
  return request<{
    link: { id: string; projectId: string; repositoryId: string }
    repository: GitRepository
  }>(`/projects/${projectId}/repositories`, {
    method: "POST",
    body: JSON.stringify({ repositoryId }),
  })
}

export function detachProjectRepository(
  projectId: string,
  repositoryId: string
) {
  return request<void>(`/projects/${projectId}/repositories/${repositoryId}`, {
    method: "DELETE",
  })
}

export function importGitHubProject(projectId: string, repositoryId?: string) {
  return request<{ runId: string; status: string }>(
    `/projects/${projectId}/github/import`,
    {
      method: "POST",
      body: JSON.stringify(repositoryId ? { repositoryId } : {}),
    }
  )
}

export function importGitProject(projectId: string, repositoryId?: string) {
  return request<{ runId: string; status: string }>(
    `/projects/${projectId}/git/import`,
    {
      method: "POST",
      body: JSON.stringify(repositoryId ? { repositoryId } : {}),
    }
  )
}

export function createPublicPage(
  projectId: string,
  input: {
    accessMode?: "link" | "login"
    title?: string
    slug?: string
    viewerUserIds?: string[]
  }
) {
  return request<{
    page: PublicPageSummary
    token: string
    url: string
  }>(`/projects/${projectId}/public-pages`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function listPublicPages(projectId: string) {
  return request<{ items: PublicPageSummary[] }>(
    `/projects/${projectId}/public-pages`
  )
}

export function updatePublicPage(
  pageId: string,
  input: Partial<{
    title: string
    slug: string
  }>
) {
  return request<{ page: PublicPageSummary }>(`/public-pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function listPublicPageViewers(pageId: string) {
  return request<{ items: PublicPageViewer[] }>(
    `/public-pages/${pageId}/viewers`
  )
}

export function addPublicPageViewer(pageId: string, userId: string) {
  return request<PublicPageViewer>(`/public-pages/${pageId}/viewers`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  })
}

export function removePublicPageViewer(pageId: string, userId: string) {
  return request<void>(`/public-pages/${pageId}/viewers/${userId}`, {
    method: "DELETE",
  })
}

export function listProjectUpdates(projectId: string) {
  return request<{ items: ProjectUpdate[] }>(`/projects/${projectId}/updates`)
}

export function createProjectUpdate(
  projectId: string,
  input: { title: string; body: string; visibility?: "internal" | "customer" }
) {
  return request<{ update: ProjectUpdate }>(`/projects/${projectId}/updates`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function listNotifications() {
  return request<{ items: Notification[] }>("/notifications")
}

export function deleteNotification(notificationId: string) {
  return request<void>(`/notifications/${notificationId}`, {
    method: "DELETE",
  })
}

export function clearNotifications() {
  return request<void>("/notifications", { method: "DELETE" })
}

export function markNotificationRead(notificationId: string) {
  return request<{ notification: Notification }>(
    `/notifications/${notificationId}/read`,
    { method: "POST" }
  )
}

export function createPublicProjectRequest(
  slug: string,
  input: {
    token?: string
    requesterName: string
    requesterEmail: string
    title: string
    description: string
    requestedStartDate?: string
    requestedTargetDate?: string
    priority?: "low" | "medium" | "high" | "urgent"
  }
) {
  return request<{ request: ProjectRequest; requestToken?: string }>(
    `/public/pages/${slug}/requests`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  )
}

export function getPublicRequestWorkspace(requestSlug: string) {
  return request<{ tenant: { name: string; requestSlug: string } }>(
    `/public/workspaces/${requestSlug}/request`
  )
}

export function createWorkspaceProjectRequest(
  requestSlug: string,
  input: {
    requesterName: string
    requesterEmail: string
    title: string
    description: string
    requestedStartDate?: string
    requestedTargetDate?: string
    priority?: "low" | "medium" | "high" | "urgent"
  }
) {
  return request<{ request: ProjectRequest; requestToken?: string }>(
    `/public/workspaces/${requestSlug}/requests`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  )
}

export function revokePublicPage(pageId: string) {
  return request<void>(`/public-pages/${pageId}/revoke`, { method: "POST" })
}

export function issuePublicPageAccessLink(pageId: string) {
  return request<{ url: string }>(`/public-pages/${pageId}/access-link`, {
    method: "POST",
  })
}

export function listSyncRuns() {
  return request<{
    items: SyncEvent[]
    count?: number
  }>("/sync/runs")
}

export function listSyncConflicts(query?: {
  projectId?: string
  status?: "open" | "resolved" | "ignored"
}) {
  const params = new URLSearchParams()
  if (query?.projectId) params.set("projectId", query.projectId)
  if (query?.status) params.set("status", query.status)
  const suffix = params.size ? `?${params.toString()}` : ""
  return request<{ items: SyncConflict[]; count?: number }>(
    `/sync/conflicts${suffix}`
  )
}

export function resolveSyncConflict(
  conflictId: string,
  resolution: "local" | "remote" | "ignore"
) {
  return request<void>(`/sync/conflicts/${conflictId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolution }),
  })
}

export function listSyncRunLogs(runId: string) {
  return request<{ items: SyncEventLog[]; count?: number }>(
    `/sync/runs/${runId}/logs`
  )
}

export function getPublicPage(slug: string, token?: string) {
  const suffix = token ? `?token=${encodeURIComponent(token)}` : ""
  return request<PublicProjectData>(`/public/pages/${slug}${suffix}`)
}

export function customerLogin(
  slug: string,
  input: { email: string; password: string }
) {
  return request<Session>(`/auth/public/pages/${slug}/login`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}
