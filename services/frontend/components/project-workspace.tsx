"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  RiArrowRightLine,
  RiArrowRightUpLine,
  RiCalendarLine,
  RiCheckboxMultipleLine,
  RiCloseLine,
  RiDraggable,
  RiEditLine,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiFilter3Line,
  RiGitRepositoryLine,
  RiGitlabLine,
  RiGithubLine as RiGitHubLine,
  RiInformationLine,
  RiLinkM,
  RiLoader4Line,
  RiLockLine,
  RiRefreshLine,
  RiSearchLine,
  RiSparkling2Line,
  RiTaskLine,
  RiTimeLine,
} from "@remixicon/react"

import {
  DateSelector,
  formatDateValue,
  type DateSelectorValue,
} from "@/components/reui/date-selector"
import {
  Filters,
  createFilterQuery,
  flattenFilterRules,
} from "@/components/reui/filters/filters"
import type { FilterField } from "@/components/reui/filters/filters-types"
import type { FilterLabels } from "@/components/reui/filters/filters-types"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { AppShell } from "@/components/app-shell"
import { FeedbackNotice } from "@/components/feedback-notice"
import { GitAssigneeMappings } from "@/components/git-assignee-mappings"
import { GitConnectionDialog } from "@/components/git-connection-dialog"
import { KanbanBoardView } from "@/components/kanban-board"
import { CustomerPageControls } from "@/components/customer-page-controls"
import { useToast } from "@/components/toast-provider"
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "@/components/reui/kanban"
import {
  MilestoneDialog,
  type NewMilestoneInput,
  type UpdateMilestoneInput,
} from "@/components/milestone-dialog"
import {
  ProjectDialog,
  type NewProjectInput,
} from "@/components/project-dialog"
import { RoadmapView } from "@/components/roadmap-view"
import { ProjectUpdatesPanel } from "@/components/project-updates-panel"
import { StatusPill } from "@/components/status-pill"
import { SyncActivity } from "@/components/sync-activity"
import { SyncConflictPanel } from "@/components/sync-conflict-panel"
import {
  TaskDialog,
  type NewTaskInput,
  type UpdateTaskInput,
} from "@/components/task-dialog"
import { TaskList } from "@/components/task-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  createPublicPage,
  createTask,
  createMilestone,
  createInvitation,
  createProject,
  createProjectStatus,
  attachProjectRepository,
  detachProjectRepository,
  ApiError,
  deleteGitConnection,
  getGitHubAppInstallUrl,
  getGitHubOAuthStartUrl,
  getProject,
  getSession,
  importGitProject,
  issuePublicPageAccessLink,
  isApiConfigured,
  listGitConnections,
  listInvitations,
  listGitRepositories,
  listLabels,
  listMilestones,
  listPermissionGrants,
  listPublicPages,
  listProjectRepositories,
  listProjectUpdates,
  listProjects,
  listSyncConflicts,
  listSyncRuns,
  listTasks,
  listTenantMembers,
  logout,
  revokePublicPage,
  updateProject,
  updateProjectStatus,
  updateTenantMemberRole,
  updateMilestone,
  updateTask,
  resolveSyncConflict,
} from "@/lib/api"
import type {
  GitConnection,
  GitRepository,
  Milestone,
  Project,
  ProjectRepository,
  ProjectStatus,
  PublicPageSummary,
  Session,
  SyncConflict,
  TenantMember,
  Invitation,
  PermissionGrant,
  Task,
  ProjectUpdate,
  WorkspaceData,
  WorkspaceView,
} from "@/lib/types"
import { useI18n } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const taskFilterQuery = createFilterQuery<string>()

const emptyWorkspace: WorkspaceData = {
  project: { id: "", name: "", key: "", status: "active", version: 0 },
  projects: [],
  statuses: [],
  members: [],
  tasks: [],
  milestones: [],
  labels: [],
  syncEvents: [],
  gitConnections: [],
  updates: [],
}

function normalizePublicPageSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

function defaultPublicPageSlug(projectKey: string) {
  const key = normalizePublicPageSlug(projectKey) || "project"
  return normalizePublicPageSlug(`${key}-status`)
}

function isValidPublicPageSlug(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/.test(value)
}

export function ProjectWorkspace({
  projectRef,
  initialView = "overview",
}: {
  projectRef: string
  initialView?: WorkspaceView
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [data, setData] = useState<WorkspaceData>(emptyWorkspace)
  const { t } = useI18n()
  const pathnameView = pathname.split("/").at(-1) as WorkspaceView
  const activeView: WorkspaceView = [
    "overview",
    "tasks",
    "roadmap",
    "integrations",
    "settings",
  ].includes(pathnameView)
    ? pathnameView
    : initialView
  const [taskMode, setTaskMode] = useState<"board" | "list">("board")
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(
    null
  )
  const [query, setQuery] = useState("")
  const [taskFilters, setTaskFilters] = useState<{
    statusId?: string
    priority?: string
  }>({})
  const [dateFilter, setDateFilter] = useState<DateSelectorValue>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [resourceErrors, setResourceErrors] = useState<Record<string, string>>(
    {}
  )
  const [refreshingTasks, setRefreshingTasks] = useState(false)
  const { showToast } = useToast()

  const loadWorkspace = useCallback(
    async (projectId: string) => {
      if (!isApiConfigured) return
      setLoading(true)
      setError(undefined)
      setResourceErrors({})
      try {
        const session = await getSession()
        const projectsResponse = await listProjects()
        const projects = projectsResponse.items ?? []
        const projectFromList = projects.find(
          (item) =>
            item.id === projectId ||
            item.key.toLowerCase() === projectId.toLowerCase()
        )
        if (!projectFromList) throw new Error(t("workspace.projectNotFound"))
        const resolvedProjectId = projectFromList.id
        const canonicalKey = projectFromList.key.toLowerCase()
        if (projectId !== canonicalKey) {
          router.replace(`/app/projects/${canonicalKey}/${activeView}`)
        }
        const details = await getProject(resolvedProjectId)
        setData((current) => ({
          ...current,
          project: details.project ?? projectFromList,
          projects,
          statuses: details.statuses,
          session,
        }))
        window.localStorage.setItem(
          `justprojects.last-project.${session.tenant.id}`,
          resolvedProjectId
        )
        const resources = await Promise.allSettled([
          listTasks(resolvedProjectId),
          listMilestones(resolvedProjectId),
          listLabels(resolvedProjectId),
          listGitConnections(),
          listSyncRuns(),
          listTenantMembers(),
          listProjectUpdates(resolvedProjectId),
        ])
        const nextErrors: Record<string, string> = {}
        const failed = (key: string) => {
          nextErrors[key] = t("workspace.resourceLoadError")
        }
        const tasks =
          resources[0].status === "fulfilled"
            ? resources[0].value
            : (failed("tasks"), { items: [] })
        const milestones =
          resources[1].status === "fulfilled"
            ? resources[1].value
            : (failed("milestones"), { items: [] })
        const labels =
          resources[2].status === "fulfilled"
            ? resources[2].value
            : (failed("labels"), { items: [] })
        const connections =
          resources[3].status === "fulfilled"
            ? resources[3].value
            : (failed("connections"), { items: [] })
        const syncRuns =
          resources[4].status === "fulfilled"
            ? resources[4].value
            : (failed("sync"), { items: [] })
        const members =
          resources[5].status === "fulfilled"
            ? resources[5].value
            : (failed("members"), { members: [] })
        const updates =
          resources[6].status === "fulfilled"
            ? resources[6].value
            : (failed("updates"), { items: [] })
        setResourceErrors(nextErrors)
        setData((current) => ({
          ...current,
          members: members.members ?? [],
          tasks: tasks.items ?? [],
          milestones: milestones.items ?? [],
          labels: labels.items ?? [],
          gitConnections: connections.items ?? [],
          syncEvents: syncRuns.items ?? [],
          updates: updates.items ?? [],
        }))
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace(
            `/login?next=${encodeURIComponent(`/app/projects/${projectRef}/${activeView}`)}`
          )
          return
        }
        setError(t("workspace.loadError"))
      } finally {
        setLoading(false)
      }
    },
    [activeView, projectRef, router, t]
  )

  useEffect(() => {
    if (!isApiConfigured) {
      router.replace("/login")
      return
    }
    // This effect starts the external API synchronization for the selected
    // project; its async completion updates the workspace state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkspace(projectRef)
  }, [loadWorkspace, projectRef, router])

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const start = dateFilter?.startDate?.getTime()
    const end = dateFilter?.endDate?.getTime() ?? start
    return data.tasks.filter((task) => {
      if (
        normalizedQuery &&
        !`${task.title} ${task.description ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
        return false
      if (taskFilters.statusId && task.statusId !== taskFilters.statusId)
        return false
      if (taskFilters.priority && task.priority !== taskFilters.priority)
        return false
      if (start || end) {
        if (!task.dueDate) return false
        const due = new Date(task.dueDate).getTime()
        if (dateFilter?.operator === "before" && start && due >= start)
          return false
        if (dateFilter?.operator === "after" && start && due <= start)
          return false
        if (
          (dateFilter?.operator === "between" || dateFilter?.endDate) &&
          start &&
          end &&
          (due < start || due > end)
        )
          return false
        if (
          dateFilter?.operator === "is" &&
          start &&
          Math.abs(due - start) > 86_400_000
        )
          return false
      }
      return true
    })
  }, [data.tasks, dateFilter, query, taskFilters])

  const progress = useMemo(() => {
    if (!data.tasks.length) return 0
    return Math.round(
      (data.tasks.filter((task) => task.statusCategory === "done").length /
        data.tasks.length) *
        100
    )
  }, [data.tasks])

  const onProjectChange = (projectId: string) => {
    const nextProject = data.projects.find((item) => item.id === projectId)
    if (nextProject) {
      router.push(`/app/projects/${nextProject.key.toLowerCase()}/overview`)
    }
  }

  const openTaskEditor = (task: Task) => {
    setSelectedTask(null)
    setEditingTask(task)
  }

  const openMilestoneEditor = (milestone: Milestone) => {
    setEditingMilestone(milestone)
  }

  const refreshTasks = useCallback(
    async (projectId: string, quiet = false) => {
      if (!isApiConfigured || !projectId) return
      if (!quiet) setRefreshingTasks(true)
      try {
        const result = await listTasks(projectId)
        setData((current) =>
          current.project.id === projectId
            ? { ...current, tasks: result.items ?? [] }
            : current
        )
        setResourceErrors((current) => {
          if (!current.tasks) return current
          const next = { ...current }
          delete next.tasks
          return next
        })
      } catch {
        setResourceErrors((current) => ({
          ...current,
          tasks: t("workspace.resourceLoadError"),
        }))
      } finally {
        if (!quiet) setRefreshingTasks(false)
      }
    },
    [t]
  )

  const refreshSyncRuns = useCallback(
    async (quiet = false) => {
      if (!isApiConfigured) return
      try {
        const result = await listSyncRuns()
        setData((current) => ({
          ...current,
          syncEvents: result.items ?? [],
        }))
        setResourceErrors((current) => {
          if (!current.sync) return current
          const next = { ...current }
          delete next.sync
          return next
        })
      } catch {
        if (!quiet) {
          setResourceErrors((current) => ({
            ...current,
            sync: t("workspace.resourceLoadError"),
          }))
        }
      }
    },
    [t]
  )

  useEffect(() => {
    if (!isApiConfigured || activeView !== "integrations") return
    const interval = window.setInterval(() => {
      void refreshSyncRuns(true)
    }, 3000)
    return () => window.clearInterval(interval)
  }, [activeView, refreshSyncRuns])

  const refreshMilestones = useCallback(
    async (projectId: string) => {
      if (!isApiConfigured || !projectId) return
      try {
        const result = await listMilestones(projectId)
        setData((current) =>
          current.project.id === projectId
            ? { ...current, milestones: result.items ?? [] }
            : current
        )
        setResourceErrors((current) => {
          if (!current.milestones) return current
          const next = { ...current }
          delete next.milestones
          return next
        })
      } catch {
        setResourceErrors((current) => ({
          ...current,
          milestones: t("workspace.resourceLoadError"),
        }))
      }
    },
    [t]
  )

  const onViewChange = (view: WorkspaceView) => {
    router.push(`/app/projects/${data.project.key.toLowerCase()}/${view}`)
  }

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      router.replace("/login")
    }
  }

  const handleProjectConnectionChange = async (connectionId: string | null) => {
    const previous = data.project
    setData((current) => ({
      ...current,
      project: { ...current.project, connectionId },
    }))
    try {
      const updated = await updateProject(data.project.id, {
        connectionId,
        version: previous.version,
      })
      setData((current) => ({ ...current, project: updated }))
      showToast({
        kind: "success",
        message: t("integrations.connectionSaved"),
      })
    } catch {
      setData((current) => ({ ...current, project: previous }))
      setError(t("integrations.connectionError"))
    }
  }

  const handleGitConnectionsChange = (connections: GitConnection[]) => {
    setData((current) => ({ ...current, gitConnections: connections }))
  }

  const handleCreateTask = async (input: NewTaskInput) => {
    const projectId = data.project.id
    const status =
      data.statuses.find((item) => item.id === input.statusId) ??
      data.statuses[0]
    const created = await createTask(projectId, input)
    setData((current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        {
          ...created,
          statusName: created.statusName ?? status?.name,
          statusCategory: created.statusCategory ?? status?.category,
        },
      ],
    }))
    showToast({ kind: "success", message: t("workspace.taskCreated") })
    // Keep the immediate optimistic result responsive, then reconcile it with
    // the server so derived fields and other views receive authoritative data.
    void refreshTasks(projectId, true)
  }

  const handleUpdateTask = async (input: UpdateTaskInput) => {
    const task = editingTask
      ? (data.tasks.find((item) => item.id === editingTask.id) ?? editingTask)
      : undefined
    if (!task) return
    const projectId = data.project.id
    const previous = data.tasks
    const nextStatus = data.statuses.find(
      (status) => status.id === input.statusId
    )
    const optimistic: Task = {
      ...task,
      title: input.title,
      description: input.description,
      statusId: input.statusId,
      statusName: nextStatus?.name ?? task.statusName,
      statusCategory: nextStatus?.category ?? task.statusCategory,
      milestoneId: input.milestoneId ?? null,
      priority: input.priority,
      startDate: input.startDate || null,
      dueDate: input.dueDate || null,
      estimateMinutes: input.estimateMinutes ?? null,
      assigneeId: input.assigneeId ?? null,
      assigneeName: input.assigneeId
        ? data.members.find((member) => member.user.id === input.assigneeId)
            ?.user.name
        : undefined,
      visibility: input.visibility,
    }
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((item) =>
        item.id === task.id ? optimistic : item
      ),
    }))
    try {
      const assigneeChanged =
        (task.assigneeId ?? null) !== (input.assigneeId ?? null)
      const updated = await updateTask(projectId, task.id, {
        title: input.title,
        description: input.description,
        statusId: input.statusId,
        milestoneId: input.milestoneId ?? "",
        priority: input.priority,
        startDate: input.startDate,
        dueDate: input.dueDate,
        estimateMinutes: input.estimateMinutes ?? 0,
        // Only include this field when the user actually changed it. The
        // worker treats a missing assignee field as "preserve the provider's
        // assignment", which is important for unmapped provider logins.
        ...(assigneeChanged ? { assigneeId: input.assigneeId ?? "" } : {}),
        visibility: input.visibility,
        version: input.version,
      })
      setData((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === updated.id ? updated : item
        ),
      }))
      setSelectedTask((current) =>
        current?.id === updated.id ? updated : current
      )
      showToast({ kind: "success", message: t("workspace.taskUpdated") })
      void refreshTasks(projectId, true)
    } catch (caught) {
      setData((current) => ({ ...current, tasks: previous }))
      setError(t("workspace.saveTaskError"))
      throw caught
    }
  }

  const handleCreateProject = async (input: NewProjectInput) => {
    const created = await createProject({
      name: input.name,
      key: input.key || undefined,
      description: input.description,
      startDate: input.startDate || undefined,
      targetDate: input.targetDate || undefined,
    })
    setData((current) => ({
      ...current,
      projects: [created, ...current.projects],
    }))
    showToast({
      kind: "success",
      message: `${created.name} · ${t("workspace.projectCreated")}`,
    })
    router.push(`/app/projects/${created.key.toLowerCase()}/overview`)
  }

  const handleCreateMilestone = async (input: NewMilestoneInput) => {
    const projectId = data.project.id
    const created = await createMilestone(projectId, {
      name: input.name,
      description: input.description,
      startDate: input.startDate || undefined,
      dueDate: input.dueDate || undefined,
      status: input.status,
      visibility: input.visibility,
    })
    setData((current) => ({
      ...current,
      milestones: [...current.milestones, created],
    }))
    showToast({
      kind: "success",
      message: t("workspace.milestoneCreated"),
    })
    void refreshMilestones(projectId)
  }

  const handleUpdateMilestone = async (input: UpdateMilestoneInput) => {
    const milestone = editingMilestone
      ? (data.milestones.find((item) => item.id === editingMilestone.id) ??
        editingMilestone)
      : undefined
    if (!milestone) return
    const projectId = data.project.id
    const previous = data.milestones
    const optimistic: Milestone = {
      ...milestone,
      name: input.name,
      description: input.description,
      startDate: input.startDate || null,
      dueDate: input.dueDate || null,
      status: input.status,
      visibility: input.visibility,
    }
    setData((current) => ({
      ...current,
      milestones: current.milestones.map((item) =>
        item.id === milestone.id ? optimistic : item
      ),
    }))
    try {
      const updated = await updateMilestone(projectId, milestone.id, {
        name: input.name,
        description: input.description,
        startDate: input.startDate,
        dueDate: input.dueDate,
        status: input.status,
        visibility: input.visibility,
        version: input.version,
      })
      setData((current) => ({
        ...current,
        milestones: current.milestones.map((item) =>
          item.id === updated.id ? updated : item
        ),
      }))
      showToast({
        kind: "success",
        message: t("workspace.milestoneUpdated"),
      })
      void refreshMilestones(projectId)
    } catch (caught) {
      setData((current) => ({ ...current, milestones: previous }))
      setError(t("workspace.saveMilestoneError"))
      throw caught
    }
  }

  const handleTaskStatusChange = async (taskId: string, statusId: string) => {
    const projectId = data.project.id
    const previous = data.tasks
    const nextStatus = data.statuses.find((status) => status.id === statusId)
    if (!nextStatus) return
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              statusId,
              statusName: nextStatus.name,
              statusCategory: nextStatus.category,
            }
          : task
      ),
    }))
    const task = previous.find((item) => item.id === taskId)
    if (!task) return
    try {
      const updated = await updateTask(projectId, taskId, {
        statusId,
        version: task.version,
      })
      setData((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === taskId ? { ...item, ...updated } : item
        ),
      }))
      void refreshTasks(projectId, true)
    } catch {
      setData((current) => ({ ...current, tasks: previous }))
      setError(t("workspace.saveStatusError"))
    }
  }

  const filterFields = useMemo<FilterField<string>[]>(
    () => [
      {
        id: "status",
        label: t("dialog.status"),
        type: "select",
        options: data.statuses.map((status) => ({
          value: status.id,
          label: status.name,
        })),
      },
      {
        id: "priority",
        label: t("dialog.priority"),
        type: "select",
        options: ["urgent", "high", "medium", "low"].map((priority) => ({
          value: priority,
          label: capitalize(priority),
        })),
      },
    ],
    [data.statuses, t]
  )

  const setFiltersFromQuery = (
    nextQuery: Parameters<typeof flattenFilterRules>[0]
  ) => {
    const next: { statusId?: string; priority?: string } = {}
    for (const rule of flattenFilterRules(nextQuery)) {
      if (typeof rule.value !== "string") continue
      if (rule.path[0] === "status") next.statusId = rule.value
      if (rule.path[0] === "priority") next.priority = rule.value
    }
    setTaskFilters(next)
  }

  if (!loading && !data.project.id && error) {
    return (
      <main className="grid min-h-svh place-items-center bg-muted/30 p-6">
        <Card className="w-full max-w-lg rounded-3xl p-8 text-center shadow-xl shadow-slate-950/5">
          <RiErrorWarningLine
            className="mx-auto size-7 text-destructive"
            aria-hidden="true"
          />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            {t("workspace.projectNotFound")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-6" onClick={() => router.replace("/app")}>
            {t("nav.workspace")}
          </Button>
        </Card>
      </main>
    )
  }

  return (
    <AppShell
      project={data.project}
      projects={data.projects}
      user={data.session?.user}
      tenant={data.session?.tenant}
      activeView={activeView}
      apiConnected={isApiConfigured}
      onProjectChange={onProjectChange}
      onCreateTask={() => setTaskDialogOpen(true)}
      onCreateProject={() => setProjectDialogOpen(true)}
      onLogout={() => void handleLogout()}
    >
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Badge
                variant="secondary"
                className="gap-1.5 text-[10px] tracking-[0.12em] uppercase"
              >
                <RiSparkling2Line className="size-3" aria-hidden="true" />
                {t("status.liveWorkspace")}
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {viewTitle(activeView, data.project.name, t)}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {viewDescription(activeView, data.project.description, t)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TaskDialog
              open={taskDialogOpen}
              onOpenChange={setTaskDialogOpen}
              statuses={data.statuses}
              milestones={data.milestones}
              members={data.members}
              onCreate={handleCreateTask}
              trigger={false}
            />
            <TaskDialog
              open={Boolean(editingTask)}
              onOpenChange={(open) => !open && setEditingTask(null)}
              statuses={data.statuses}
              milestones={data.milestones}
              members={data.members}
              task={editingTask ?? undefined}
              onUpdate={handleUpdateTask}
              trigger={false}
            />
          </div>
        </div>

        {error && (
          <FeedbackNotice
            kind="error"
            message={error}
            retry={() => void loadWorkspace(data.project.id)}
          />
        )}
        {Object.entries(resourceErrors).map(([resource, message]) => (
          <FeedbackNotice
            key={resource}
            kind="error"
            message={t("workspace.resourceError", {
              resource: resourceLabel(resource, t),
            })}
            detail={message}
            retry={() => void loadWorkspace(data.project.id)}
          />
        ))}

        {loading ? (
          <WorkspaceLoading />
        ) : (
          <>
            {activeView === "overview" && (
              <OverviewView
                data={data}
                progress={progress}
                onOpenTasks={() => onViewChange("tasks")}
                onOpenIntegrations={() => onViewChange("integrations")}
                onSelectTask={setSelectedTask}
                onEditTask={openTaskEditor}
                onUpdateCreated={(update) =>
                  setData((current) => ({
                    ...current,
                    updates: [
                      update,
                      ...current.updates.filter(
                        (item) => item.id !== update.id
                      ),
                    ],
                  }))
                }
              />
            )}
            {activeView === "tasks" && (
              <div className="space-y-4">
                <TaskToolbar
                  query={query}
                  onQueryChange={setQuery}
                  filterFields={filterFields}
                  onFilterChange={setFiltersFromQuery}
                  dateFilter={dateFilter}
                  onDateFilterChange={setDateFilter}
                  taskMode={taskMode}
                  onTaskModeChange={setTaskMode}
                  refreshing={refreshingTasks}
                  onRefresh={() => void refreshTasks(data.project.id)}
                />
                {taskMode === "board" ? (
                  <KanbanBoardView
                    tasks={filteredTasks}
                    statuses={data.statuses}
                    milestones={data.milestones}
                    onTaskStatusChange={(taskId, statusId) =>
                      void handleTaskStatusChange(taskId, statusId)
                    }
                    onSelectTask={setSelectedTask}
                    onEditTask={openTaskEditor}
                  />
                ) : (
                  <TaskList
                    tasks={filteredTasks}
                    statuses={data.statuses}
                    milestones={data.milestones}
                    onSelectTask={setSelectedTask}
                    onEditTask={openTaskEditor}
                  />
                )}
              </div>
            )}
            {activeView === "roadmap" && (
              <RoadmapView
                project={data.project}
                tasks={data.tasks}
                milestones={data.milestones}
                onCreateMilestone={() => setMilestoneDialogOpen(true)}
                onEditMilestone={openMilestoneEditor}
              />
            )}
            {activeView === "integrations" && (
              <IntegrationsView
                project={data.project}
                connections={data.gitConnections}
                syncEvents={data.syncEvents}
                tasks={data.tasks}
                members={data.members}
                onProjectConnectionChange={handleProjectConnectionChange}
                onConnectionsChange={handleGitConnectionsChange}
                onRefreshSyncRuns={refreshSyncRuns}
                onRefreshTasks={refreshTasks}
              />
            )}
            {activeView === "settings" && (
              <ProjectSettings
                project={data.project}
                projectId={data.project.id}
                taskCount={data.tasks.length}
                milestoneCount={data.milestones.length}
                members={data.members}
                statuses={data.statuses}
                session={data.session}
                onStatusesChange={(statuses) =>
                  setData((current) => ({ ...current, statuses }))
                }
              />
            )}
          </>
        )}
      </div>
      <TaskDetailsSheet
        task={selectedTask}
        statuses={data.statuses}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onTaskStatusChange={(taskId, statusId) =>
          void handleTaskStatusChange(taskId, statusId)
        }
        onEditTask={openTaskEditor}
      />
      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        onCreate={handleCreateProject}
      />
      <MilestoneDialog
        open={milestoneDialogOpen}
        onOpenChange={setMilestoneDialogOpen}
        onCreate={handleCreateMilestone}
      />
      <MilestoneDialog
        open={Boolean(editingMilestone)}
        onOpenChange={(open) => !open && setEditingMilestone(null)}
        milestone={editingMilestone ?? undefined}
        onUpdate={handleUpdateMilestone}
      />
    </AppShell>
  )
}

function OverviewView({
  data,
  progress,
  onOpenTasks,
  onOpenIntegrations,
  onSelectTask,
  onEditTask,
  onUpdateCreated,
}: {
  data: WorkspaceData
  progress: number
  onOpenTasks: () => void
  onOpenIntegrations: () => void
  onSelectTask: (task: Task) => void
  onEditTask: (task: Task) => void
  onUpdateCreated: (update: ProjectUpdate) => void
}) {
  const { locale, t } = useI18n()
  const activeTasks = data.tasks.filter(
    (task) => task.statusCategory !== "done"
  ).length
  const blockedTasks = data.tasks.filter(
    (task) => task.statusCategory === "blocked"
  ).length
  const nextMilestone = data.milestones.find(
    (milestone) => milestone.status === "open"
  )
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("workspace.overallProgress")}
          value={`${progress}%`}
          detail={t("workspace.tasksComplete", {
            done: data.tasks.filter((task) => task.statusCategory === "done")
              .length,
            total: data.tasks.length,
          })}
          icon={
            <RiCheckboxMultipleLine className="size-4" aria-hidden="true" />
          }
          accent="indigo"
          progress={progress}
        />
        <MetricCard
          label={t("workspace.activeWork")}
          value={String(activeTasks)}
          detail={t("workspace.tasksInMotion")}
          icon={<RiTimeLine className="size-4" aria-hidden="true" />}
          accent="blue"
        />
        <MetricCard
          label={t("workspace.nextMilestone")}
          value={nextMilestone?.name ?? t("workspace.noneScheduled")}
          detail={
            nextMilestone?.dueDate
              ? t("workspace.due", {
                  date: formatDate(nextMilestone.dueDate, locale),
                })
              : t("workspace.keepPlanning")
          }
          icon={<RiCalendarLine className="size-4" aria-hidden="true" />}
          accent="teal"
        />
        <MetricCard
          label={t("workspace.needsAttention")}
          value={String(blockedTasks)}
          detail={
            blockedTasks
              ? t("workspace.blockedNeedDecision")
              : t("workspace.nothingBlocked")
          }
          icon={<RiErrorWarningLine className="size-4" aria-hidden="true" />}
          accent={blockedTasks ? "amber" : "green"}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <Frame variant="ghost" className="bg-transparent" spacing="xs">
          <FramePanel fit>
            <FrameHeader className="px-0 pt-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <FrameTitle>{t("workspace.currentDelivery")}</FrameTitle>
                  <FrameDescription className="mt-1">
                    {t("workspace.deliveryDescription")}
                  </FrameDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={onOpenTasks}
                >
                  {t("workspace.openTasks")}
                </Button>
              </div>
            </FrameHeader>
            <div className="overflow-hidden">
              <KanbanBoardView
                tasks={data.tasks.slice(0, 6)}
                statuses={data.statuses}
                milestones={data.milestones}
                compact
                onTaskStatusChange={() => undefined}
                onSelectTask={onSelectTask}
                onEditTask={onEditTask}
              />
            </div>
          </FramePanel>
        </Frame>
        <Frame variant="ghost" className="bg-transparent" spacing="xs">
          <FramePanel fit>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>{t("workspace.syncActivity")}</FrameTitle>
              <FrameDescription className="mt-1">
                {t("workspace.syncDescription", {
                  provider: data.syncEvents.some(
                    (event) => event.provider === "gitlab"
                  )
                    ? "GitHub / GitLab"
                    : "GitHub",
                })}
              </FrameDescription>
            </FrameHeader>
            <SyncActivity events={data.syncEvents} compact />
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full gap-1.5"
              onClick={onOpenIntegrations}
            >
              {t("workspace.viewSyncHistory")}{" "}
              <RiArrowRightUpLine className="size-3.5" aria-hidden="true" />
            </Button>
          </FramePanel>
        </Frame>
      </div>
      <ProjectUpdatesPanel
        projectId={data.project.id}
        updates={data.updates}
        onUpdateCreated={onUpdateCreated}
      />
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  accent,
  progress,
}: {
  label: string
  value: string
  detail: string
  icon: React.ReactNode
  accent: "indigo" | "blue" | "teal" | "amber" | "green"
  progress?: number
}) {
  const accentClasses = {
    indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
    teal: "bg-teal-500/10 text-teal-600 dark:text-teal-300",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  }
  return (
    <Card className="gap-4 rounded-2xl p-4 shadow-none">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={`flex size-7 items-center justify-center rounded-lg ${accentClasses[accent]}`}
        >
          {icon}
        </span>
      </div>
      <div>
        <p className="truncate text-xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {detail}
        </p>
      </div>
      {progress !== undefined && (
        <Progress
          value={progress}
          aria-label={`${progress}% complete`}
          className="h-1"
        />
      )}
    </Card>
  )
}

function TaskToolbar({
  query,
  onQueryChange,
  filterFields,
  onFilterChange,
  dateFilter,
  onDateFilterChange,
  taskMode,
  onTaskModeChange,
  refreshing,
  onRefresh,
}: {
  query: string
  onQueryChange: (value: string) => void
  filterFields: FilterField<string>[]
  onFilterChange: (query: Parameters<typeof flattenFilterRules>[0]) => void
  dateFilter?: DateSelectorValue
  onDateFilterChange: (value: DateSelectorValue | undefined) => void
  taskMode: "board" | "list"
  onTaskModeChange: (value: "board" | "list") => void
  refreshing: boolean
  onRefresh: () => void
}) {
  const { locale, t } = useI18n()
  const dateFormat = locale === "de" ? "dd.MM.yyyy" : "MMM d, yyyy"
  const dateSelectorI18n = useMemo(
    () => ({
      selectDate: t("date.selectDate"),
      apply: t("date.apply"),
      cancel: t("date.cancel"),
      clear: t("date.clear"),
      today: t("date.today"),
      filterTypes: {
        is: t("date.is"),
        before: t("date.before"),
        after: t("date.after"),
        between: t("date.between"),
      },
      periodTypes: {
        day: t("date.day"),
        month: t("date.month"),
        quarter: t("date.quarter"),
        halfYear: t("date.halfYear"),
        year: t("date.year"),
      },
      months:
        locale === "de"
          ? [
              "Januar",
              "Februar",
              "März",
              "April",
              "Mai",
              "Juni",
              "Juli",
              "August",
              "September",
              "Oktober",
              "November",
              "Dezember",
            ]
          : [
              "January",
              "February",
              "March",
              "April",
              "May",
              "June",
              "July",
              "August",
              "September",
              "October",
              "November",
              "December",
            ],
      monthsShort:
        locale === "de"
          ? [
              "Jan",
              "Feb",
              "Mär",
              "Apr",
              "Mai",
              "Jun",
              "Jul",
              "Aug",
              "Sep",
              "Okt",
              "Nov",
              "Dez",
            ]
          : [
              "Jan",
              "Feb",
              "Mar",
              "Apr",
              "May",
              "Jun",
              "Jul",
              "Aug",
              "Sep",
              "Oct",
              "Nov",
              "Dec",
            ],
      quarters: ["Q1", "Q2", "Q3", "Q4"],
      halfYears: ["H1", "H2"],
      weekdays:
        locale === "de"
          ? [
              "Sonntag",
              "Montag",
              "Dienstag",
              "Mittwoch",
              "Donnerstag",
              "Freitag",
              "Samstag",
            ]
          : [
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ],
      weekdaysShort:
        locale === "de"
          ? ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]
          : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
      placeholder: t("date.placeholder"),
      rangePlaceholder: t("date.rangePlaceholder"),
    }),
    [locale, t]
  )
  const filterLabels = useMemo(() => getFilterLabels(t), [t])
  const filterOperatorLabels = useMemo(
    () => (locale === "de" ? getGermanFilterOperatorLabels() : undefined),
    [locale]
  )
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <RiSearchLine
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("tasks.search")}
            aria-label={t("tasks.search")}
            className="h-9 ps-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filters
            fields={filterFields}
            defaultQuery={taskFilterQuery}
            onQueryChange={onFilterChange}
            labels={filterLabels}
            operatorLabels={filterOperatorLabels}
            trigger={
              <Button variant="outline" size="sm" className="gap-1.5">
                <RiFilter3Line className="size-3.5" aria-hidden="true" />
                {t("tasks.filters")}
              </Button>
            }
            showClear
            size="sm"
          />
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="outline" size="sm" className="gap-1.5">
                  <RiCalendarLine className="size-3.5" aria-hidden="true" />
                  {dateFilter
                    ? formatDateValue(dateFilter, dateSelectorI18n, dateFormat)
                    : t("tasks.dueDate")}
                </Button>
              }
            />
            <PopoverContent align="end" className="w-auto p-3">
              <DateSelector
                value={dateFilter}
                onChange={onDateFilterChange}
                allowRange
                showTwoMonths={false}
                label={t("tasks.filterByDueDate")}
                dayDateFormat={dateFormat}
                inputHint={dateFormat}
                i18n={dateSelectorI18n}
                weekStartsOn={locale === "de" ? 1 : 0}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={t("tasks.refresh")}
          >
            <RiRefreshLine
              className={cn("size-3.5", refreshing && "animate-spin")}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">
              {refreshing ? t("tasks.refreshing") : t("tasks.refresh")}
            </span>
          </Button>
          <Tabs
            value={taskMode}
            onValueChange={(value) =>
              onTaskModeChange(value as "board" | "list")
            }
          >
            <TabsList className="h-9">
              <TabsTrigger value="board" className="gap-1.5 px-3">
                <RiLayoutIcon view="board" />
                {t("tasks.board")}
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-1.5 px-3">
                <RiLayoutIcon view="list" />
                {t("tasks.list")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        <span>{t("tasks.optimisticMoves")}</span>
        <span aria-hidden="true">·</span>
        <span>{t("tasks.keyboardHandles")}</span>
      </div>
    </div>
  )
}

function RiLayoutIcon({ view }: { view: "board" | "list" }) {
  return view === "board" ? (
    <RiCheckboxMultipleLine className="size-3.5" aria-hidden="true" />
  ) : (
    <RiTaskLine className="size-3.5" aria-hidden="true" />
  )
}

function IntegrationsView({
  project,
  connections,
  syncEvents,
  tasks,
  members,
  onProjectConnectionChange,
  onConnectionsChange,
  onRefreshSyncRuns,
  onRefreshTasks,
}: {
  project: Project
  connections: WorkspaceData["gitConnections"]
  syncEvents: WorkspaceData["syncEvents"]
  tasks: Task[]
  members: TenantMember[]
  onProjectConnectionChange: (
    connectionId: string | null
  ) => Promise<void> | void
  onConnectionsChange: (connections: GitConnection[]) => void
  onRefreshSyncRuns: (quiet?: boolean) => Promise<void>
  onRefreshTasks: (projectId: string, quiet?: boolean) => Promise<void>
}) {
  const [connecting, setConnecting] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [loadingRepositories, setLoadingRepositories] = useState(false)
  const [importingRepositoryId, setImportingRepositoryId] = useState<string>()
  const [detachingRepositoryId, setDetachingRepositoryId] = useState<string>()
  const [repositories, setRepositories] = useState<GitRepository[]>([])
  const [attachedRepositories, setAttachedRepositories] = useState<
    ProjectRepository[]
  >([])
  const [availableConnections, setAvailableConnections] =
    useState<GitConnection[]>(connections)
  const [selectedConnectionId, setSelectedConnectionId] = useState(
    project.connectionId ?? ""
  )
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [resolvingConflictId, setResolvingConflictId] = useState<string>()
  const [conflictsUnavailable, setConflictsUnavailable] = useState(false)
  const [conflictError, setConflictError] = useState<string>()
  const [error, setError] = useState<string>()
  const { t } = useI18n()
  const { showToast } = useToast()

  useEffect(() => {
    // Keep the provider list and project selection in sync after a workspace refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvailableConnections(connections)
    setSelectedConnectionId(project.connectionId ?? "")
  }, [connections, project.connectionId])

  const loadRepositories = useCallback(async () => {
    if (!isApiConfigured) return
    setLoadingRepositories(true)
    try {
      const [available, attached] = await Promise.all([
        selectedConnectionId
          ? listGitRepositories(selectedConnectionId)
          : Promise.resolve({ items: [] as GitRepository[] }),
        listProjectRepositories(project.id),
      ])
      setRepositories(available.items)
      setAttachedRepositories(attached.items)
    } catch {
      setError(t("integrations.repositoryLoadError"))
    } finally {
      setLoadingRepositories(false)
    }
  }, [project.id, selectedConnectionId, t])

  useEffect(() => {
    if (!isApiConfigured) return
    // Loading this project-scoped integration state keeps repository selection
    // current after switching projects in the workspace shell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRepositories()
  }, [loadRepositories])

  const loadConflicts = useCallback(async () => {
    if (!isApiConfigured || conflictsUnavailable) return
    try {
      const result = await listSyncConflicts({ projectId: project.id })
      setConflicts(result.items ?? [])
      setConflictError(undefined)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) {
        setConflictsUnavailable(true)
        return
      }
      setConflictError(t("sync.conflictLoadError"))
    }
  }, [conflictsUnavailable, project.id, t])

  useEffect(() => {
    // Conflict data is intentionally polled with the sync activity so a
    // webhook-created conflict appears without a full page reload.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConflicts()
  }, [loadConflicts])

  useEffect(() => {
    if (!isApiConfigured || conflictsUnavailable) return
    const interval = window.setInterval(() => {
      void loadConflicts()
    }, 3000)
    return () => window.clearInterval(interval)
  }, [conflictsUnavailable, loadConflicts])

  const connectGitHub = async () => {
    setConnecting(true)
    setError(undefined)
    try {
      if (!isApiConfigured) {
        setError(t("integrations.connectThenRefresh"))
        return
      }
      const result = await getGitHubOAuthStartUrl()
      window.location.assign(result.url)
    } catch {
      setError(t("integrations.connectionError"))
    } finally {
      setConnecting(false)
    }
  }

  const installGitHubApp = async () => {
    setInstalling(true)
    setError(undefined)
    try {
      if (!isApiConfigured) {
        setError(t("integrations.backendRequired"))
        return
      }
      const result = await getGitHubAppInstallUrl()
      window.location.assign(result.url)
    } catch {
      setError(t("integrations.connectionError"))
    } finally {
      setInstalling(false)
    }
  }

  const attachAndImport = async (repository: GitRepository) => {
    setImportingRepositoryId(repository.id)
    setError(undefined)
    try {
      const isAttached = attachedRepositories.some(
        (item) => item.link.repositoryId === repository.id
      )
      if (!isAttached) {
        const linked = await attachProjectRepository(project.id, repository.id)
        setAttachedRepositories((current) => [
          ...current,
          { link: linked.link, repository: linked.repository },
        ])
      }
      const run = await importGitProject(project.id, repository.id)
      showToast({
        kind: "success",
        message: t("integrations.importQueued", {
          repository: repository.fullName,
          runId: run.runId.slice(0, 8),
        }),
      })
      void onRefreshSyncRuns(true)
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 409
          ? t("integrations.importAlreadyRunning")
          : t("integrations.repositoryLoadError")
      )
    } finally {
      setImportingRepositoryId(undefined)
    }
  }

  const detachRepository = async (repository: GitRepository) => {
    setDetachingRepositoryId(repository.id)
    setError(undefined)
    try {
      await detachProjectRepository(project.id, repository.id)
      setAttachedRepositories((current) =>
        current.filter((item) => item.link.repositoryId !== repository.id)
      )
      showToast({
        kind: "success",
        message: t("integrations.repositoryDetached", {
          repository: repository.fullName,
        }),
      })
    } catch {
      setError(t("integrations.repositoryDetachError"))
    } finally {
      setDetachingRepositoryId(undefined)
    }
  }

  const selectConnection = async (value: string | null) => {
    const nextID = value === "none" ? "" : (value ?? "")
    setSelectedConnectionId(nextID)
    setRepositories([])
    await onProjectConnectionChange(nextID || null)
  }

  const handleConnectionCreated = (connection: GitConnection) => {
    const nextConnections = [
      connection,
      ...availableConnections.filter((item) => item.id !== connection.id),
    ]
    setAvailableConnections(nextConnections)
    onConnectionsChange(nextConnections)
    if (!project.connectionId) {
      void selectConnection(connection.id)
    }
    setError(undefined)
    if (project.connectionId) {
      showToast({
        kind: "success",
        message: t("integrations.connectionSaved"),
      })
    }
  }

  const disconnect = async (connection: GitConnection) => {
    if (!isApiConfigured) return
    setError(undefined)
    try {
      await deleteGitConnection(connection.id)
      const nextConnections = availableConnections.filter(
        (item) => item.id !== connection.id
      )
      setAvailableConnections(nextConnections)
      onConnectionsChange(nextConnections)
      if (selectedConnectionId === connection.id) {
        setSelectedConnectionId("")
        await onProjectConnectionChange(null)
      }
      showToast({ kind: "success", message: t("integrations.disconnect") })
    } catch {
      setError(t("integrations.connectionError"))
    }
  }

  const resolveConflict = async (
    conflict: SyncConflict,
    resolution: "local" | "remote" | "ignore"
  ) => {
    setResolvingConflictId(conflict.id)
    try {
      await resolveSyncConflict(conflict.id, resolution)
      setConflicts((current) =>
        current.filter((item) => item.id !== conflict.id)
      )
      showToast({
        kind: "success",
        message: t("sync.conflictResolveQueued"),
      })
      void onRefreshSyncRuns(true)
      void onRefreshTasks(project.id, true)
      void loadConflicts()
    } catch (caught) {
      showToast({
        kind: "error",
        message:
          caught instanceof ApiError && caught.status === 409
            ? caught.message
            : t("sync.conflictResolveError"),
      })
    } finally {
      setResolvingConflictId(undefined)
    }
  }

  const selectedConnection = availableConnections.find(
    (connection) => connection.id === selectedConnectionId
  )
  const attachedIDs = useMemo(
    () => new Set(attachedRepositories.map((item) => item.link.repositoryId)),
    [attachedRepositories]
  )
  const activeImportRepositoryIDs = useMemo(
    () =>
      new Set(
        syncEvents
          .filter(
            (event) =>
              event.eventName === "import" &&
              (event.status === "queued" || event.status === "processing")
          )
          .map((event) =>
            typeof event.payload?.repositoryId === "string"
              ? event.payload.repositoryId
              : undefined
          )
          .filter((repositoryID): repositoryID is string =>
            Boolean(repositoryID)
          )
      ),
    [syncEvents]
  )
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <div className="space-y-5">
        <Frame variant="ghost" className="bg-transparent" spacing="xs">
          <FramePanel fit>
            <FrameHeader className="px-0 pt-0">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <FrameTitle>{t("integrations.connections")}</FrameTitle>
                  <FrameDescription className="mt-1">
                    {t("integrations.manageDescription")}
                  </FrameDescription>
                </div>
                <Button
                  size="sm"
                  className="w-fit gap-1.5"
                  onClick={() => setConnectionDialogOpen(true)}
                >
                  <RiLinkM className="size-3.5" aria-hidden="true" />
                  {t("integrations.addConnection")}
                </Button>
              </div>
            </FrameHeader>
            <div className="mt-4 space-y-3">
              {availableConnections.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 py-10 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl border bg-background text-primary shadow-xs">
                    <RiLinkM className="size-5" aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-sm font-semibold">
                    {t("integrations.noConnectionsTitle")}
                  </p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    {t("integrations.noConnectionsDescription")}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-5 gap-1.5"
                    onClick={() => setConnectionDialogOpen(true)}
                  >
                    <RiLinkM className="size-3.5" aria-hidden="true" />
                    {t("integrations.addConnection")}
                  </Button>
                </div>
              ) : (
                availableConnections.map((connection) => {
                  const isGitHub = connection.provider === "github"
                  const ProviderIcon = isGitHub ? RiGitHubLine : RiGitlabLine
                  const providerName = isGitHub
                    ? t("integrations.github")
                    : t("integrations.gitlab")
                  return (
                    <article
                      key={connection.id}
                      className={cn(
                        "rounded-2xl border bg-background p-5 transition-colors",
                        selectedConnectionId === connection.id &&
                          "border-primary/40 bg-primary/5 ring-2 ring-primary/10"
                      )}
                    >
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div className="flex min-w-0 items-start gap-3.5">
                          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-xs dark:bg-white dark:text-slate-950">
                            <ProviderIcon
                              className="size-5"
                              aria-hidden="true"
                            />
                          </span>
                          <div className="min-w-0 pt-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium">
                                {connection.name || providerName}
                              </p>
                              <Badge
                                variant="outline"
                                className="h-5 px-1.5 text-[10px]"
                              >
                                {providerName}
                              </Badge>
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {connection.externalAccountLogin
                                ? t("integrations.connectedAs", {
                                    account: connection.externalAccountLogin,
                                  })
                                : providerName}
                            </p>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground/75">
                              {connection.apiBaseUrl}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:pt-0.5">
                          <Badge variant="secondary" className="w-fit gap-1.5">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            {t("status.active")}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void disconnect(connection)}
                          >
                            {t("integrations.disconnect")}
                          </Button>
                        </div>
                      </div>
                      <div className="mt-5 grid gap-3 rounded-xl border bg-muted/25 p-3.5 sm:grid-cols-3">
                        <ConnectionStat
                          label={t("integrations.authMethod")}
                          value={
                            connection.authMethod === "app"
                              ? t("integrations.githubApp")
                              : connection.authMethod === "oauth"
                                ? t("integrations.oauth")
                                : t("integrations.patToken")
                          }
                        />
                        <ConnectionStat
                          label={t("integrations.scopePosture")}
                          value={
                            isGitHub
                              ? t("integrations.issuesMetadata")
                              : connection.scopes.join(", ") || "API"
                          }
                        />
                        <ConnectionStat
                          label={t("integrations.repositories")}
                          value={t("integrations.selectPerProject")}
                        />
                      </div>
                      {isGitHub && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => void connectGitHub()}
                            disabled={connecting}
                          >
                            {connecting && (
                              <RiLoader4Line
                                className="size-3.5 animate-spin"
                                aria-hidden="true"
                              />
                            )}
                            {t("integrations.connectAnotherOAuth")}
                            <RiArrowRightUpLine
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => void installGitHubApp()}
                            disabled={installing}
                          >
                            {installing && (
                              <RiLoader4Line
                                className="size-3.5 animate-spin"
                                aria-hidden="true"
                              />
                            )}
                            {t("integrations.installApp")}
                            <RiArrowRightUpLine
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          </Button>
                        </div>
                      )}
                    </article>
                  )
                })
              )}
            </div>
            <div className="mt-8 border-t pt-7">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-sm font-medium">
                    {t("integrations.projectConnection")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("integrations.projectConnectionDescription")}
                  </p>
                </div>
                <div className="w-full sm:max-w-xs">
                  <label htmlFor="project-connection" className="sr-only">
                    {t("integrations.projectConnection")}
                  </label>
                  <Select
                    value={selectedConnectionId || "none"}
                    onValueChange={(value) => void selectConnection(value)}
                  >
                    <SelectTrigger id="project-connection" className="w-full">
                      <SelectValue>
                        {selectedConnection
                          ? selectedConnection.name ||
                            selectedConnection.externalAccountLogin ||
                            selectedConnection.provider
                          : t("integrations.noProjectConnection")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {t("integrations.noProjectConnection")}
                      </SelectItem>
                      {availableConnections.map((connection) => (
                        <SelectItem key={connection.id} value={connection.id}>
                          {connection.name ||
                            connection.externalAccountLogin ||
                            connection.provider}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            {error && (
              <FeedbackNotice
                kind="error"
                message={error}
                retry={() => void loadRepositories()}
              />
            )}
            <div className="mt-6 border-t pt-8">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-sm font-medium">
                    {t("integrations.projectRepositories")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("integrations.repositoryDescription")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-fit gap-1.5"
                  onClick={() => void loadRepositories()}
                  disabled={loadingRepositories}
                >
                  <RiRefreshLine
                    className={
                      loadingRepositories ? "size-3.5 animate-spin" : "size-3.5"
                    }
                    aria-hidden="true"
                  />
                  {t("integrations.refresh")}
                </Button>
              </div>
              {!isApiConfigured ? (
                <div className="mt-5 rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
                  {t("integrations.backendRequired")}
                </div>
              ) : repositories.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
                  {loadingRepositories
                    ? t("integrations.loadingRepositories")
                    : t("integrations.connectThenRefresh")}
                </div>
              ) : (
                <ul
                  className="mt-5 grid max-h-80 gap-2.5 overflow-y-auto pr-1"
                  aria-label={t("integrations.repositories")}
                >
                  {repositories.map((repository) => {
                    const isAttached = attachedIDs.has(repository.id)
                    const isImporting = importingRepositoryId === repository.id
                    const importRunning =
                      isImporting ||
                      activeImportRepositoryIDs.has(repository.id)
                    const isDetaching = detachingRepositoryId === repository.id
                    return (
                      <li
                        key={repository.id}
                        className="group flex flex-col justify-between gap-4 rounded-xl border bg-background/70 p-4 transition-colors hover:border-primary/30 hover:bg-muted/20 sm:flex-row sm:items-center"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground transition-colors group-hover:border-primary/25 group-hover:text-primary">
                            <RiGitRepositoryLine
                              className="size-4"
                              aria-hidden="true"
                            />
                          </span>
                          <div className="min-w-0 pt-0.5">
                            <p className="truncate text-sm font-medium">
                              {repository.fullName}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant={
                                  repository.private ? "secondary" : "outline"
                                }
                                className="h-5 px-1.5 text-[10px]"
                              >
                                {repository.private
                                  ? t("integrations.privateRepository")
                                  : t("integrations.publicRepository")}
                              </Badge>
                              {isAttached && (
                                <Badge
                                  variant="outline"
                                  className="h-5 border-primary/25 bg-primary/5 px-1.5 text-[10px] text-primary"
                                >
                                  {t("integrations.attached")}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                          {isAttached && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full gap-1.5 text-muted-foreground hover:text-destructive sm:w-auto"
                              onClick={() => void detachRepository(repository)}
                              disabled={
                                Boolean(detachingRepositoryId) || importRunning
                              }
                            >
                              {isDetaching ? (
                                <RiLoader4Line
                                  className="size-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <RiCloseLine
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                              )}
                              {isDetaching
                                ? t("integrations.detachingRepository")
                                : t("integrations.detachRepository")}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full gap-1.5 sm:w-auto"
                            onClick={() => void attachAndImport(repository)}
                            disabled={
                              Boolean(importingRepositoryId) || importRunning
                            }
                          >
                            {importRunning && (
                              <RiLoader4Line
                                className="size-3.5 animate-spin"
                                aria-hidden="true"
                              />
                            )}
                            {importRunning
                              ? t("integrations.importRunning")
                              : isAttached
                                ? t("integrations.runImport")
                                : t("integrations.attachImport")}
                            <RiArrowRightLine
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2">
              <IntegrationFeature
                icon={<RiLinkM className="size-4" aria-hidden="true" />}
                title={t("integrations.bidirectional")}
                copy={t("integrations.localFields")}
              />
              <IntegrationFeature
                icon={<RiLockLine className="size-4" aria-hidden="true" />}
                title={t("integrations.conflictSafe")}
                copy={t("integrations.conflictDescription")}
              />
            </div>
          </FramePanel>
        </Frame>
        <GitAssigneeMappings
          tasks={tasks}
          members={members}
          onChanged={() => onRefreshTasks(project.id, true)}
        />
      </div>
      <div className="space-y-5">
        {conflictError && (
          <FeedbackNotice
            kind="error"
            message={conflictError}
            retry={() => void loadConflicts()}
          />
        )}
        {!conflictsUnavailable && conflicts.length > 0 && (
          <SyncConflictPanel
            conflicts={conflicts}
            resolvingId={resolvingConflictId}
            onResolve={(conflict, resolution) =>
              void resolveConflict(conflict, resolution)
            }
          />
        )}
        <Frame variant="ghost" className="bg-transparent" spacing="xs">
          <FramePanel
            fit
            className="flex min-h-0 flex-col overflow-hidden xl:sticky xl:top-5 xl:h-[calc(100vh-8rem)]"
          >
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>{t("integrations.latestDeliveries")}</FrameTitle>
              <FrameDescription className="mt-1">
                {t("integrations.webhookDescription")}
              </FrameDescription>
            </FrameHeader>
            <div className="min-h-0 flex-1 overflow-y-auto pe-1">
              <SyncActivity
                events={syncEvents}
                live
                onRefresh={async () => {
                  await onRefreshSyncRuns(false)
                  await loadConflicts()
                }}
              />
            </div>
          </FramePanel>
        </Frame>
      </div>
      <GitConnectionDialog
        key={connectionDialogOpen ? "open" : "closed"}
        open={connectionDialogOpen}
        onOpenChange={setConnectionDialogOpen}
        onCreated={handleConnectionCreated}
      />
    </div>
  )
}

function ConnectionStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}
function IntegrationFeature({
  icon,
  title,
  copy,
}: {
  icon: React.ReactNode
  title: string
  copy: string
}) {
  return (
    <div className="flex gap-3 py-1">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div>
        <p className="text-xs font-medium">{title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {copy}
        </p>
      </div>
    </div>
  )
}

function ProjectSettings({
  project,
  projectId,
  taskCount,
  milestoneCount,
  members,
  statuses,
  session,
  onStatusesChange,
}: {
  project: Project
  projectId: string
  taskCount: number
  milestoneCount: number
  members: TenantMember[]
  statuses: ProjectStatus[]
  session?: Session
  onStatusesChange: (statuses: ProjectStatus[]) => void
}) {
  const { locale, t } = useI18n()
  const [accessMode, setAccessMode] = useState("link")
  const [title, setTitle] = useState(() =>
    t("settings.defaultPageTitle", { project: project.name })
  )
  const [slug, setSlug] = useState(() => defaultPublicPageSlug(project.key))
  const [publicUrl, setPublicUrl] = useState<string>()
  const [pageUrls, setPageUrls] = useState<Record<string, string>>({})
  const [pages, setPages] = useState<PublicPageSummary[]>([])
  const [loadingPages, setLoadingPages] = useState(false)
  const [loadingPageLinkId, setLoadingPageLinkId] = useState<string>()
  const [revokingPageId, setRevokingPageId] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const [statusName, setStatusName] = useState("")
  const [statusCategory, setStatusCategory] =
    useState<ProjectStatus["category"]>("todo")
  const [savingStatus, setSavingStatus] = useState(false)
  const activePages = pages.filter((page) => !page.revoked)
  const activePage = activePages[0]
  const { showToast } = useToast()

  const loadPages = useCallback(async () => {
    if (!isApiConfigured) return
    setLoadingPages(true)
    setError(undefined)
    try {
      const result = await listPublicPages(projectId)
      setPages(result.items)
      const active = result.items.find((page) => !page.revoked)
      if (active) setSlug(active.slug)
    } catch {
      setError(t("settings.loadPagesError"))
    } finally {
      setLoadingPages(false)
    }
  }, [projectId, t])

  useEffect(() => {
    if (!isApiConfigured) return
    // Refresh page status whenever the selected project changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPages()
  }, [loadPages])

  useEffect(() => {
    // A generated access URL belongs to one project and must not appear when
    // the user switches to another project in the same settings view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPublicUrl(undefined)
    setPageUrls({})
  }, [projectId])

  const savePublicPage = async () => {
    setError(undefined)
    if (!isApiConfigured) {
      setError(t("settings.apiRequired"))
      return
    }
    if (!slug) {
      setError(t("settings.slugRequired"))
      return
    }
    if (!isValidPublicPageSlug(slug)) {
      setError(t("settings.slugInvalid"))
      return
    }
    setSaving(true)
    try {
      const created = await createPublicPage(projectId, {
        accessMode: accessMode as "link" | "login",
        title,
        slug,
      })
      setPublicUrl(created.url)
      setPageUrls((current) => ({
        ...current,
        [created.page.id]: created.url,
      }))
      setSlug(created.page.slug)
      setPages((current) => [created.page, ...current])
      showToast({ kind: "success", message: t("settings.pageCreated") })
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setError(t("settings.slugInUse"))
      } else {
        setError(t("settings.createError"))
      }
    } finally {
      setSaving(false)
    }
  }

  const revokePage = async (page: PublicPageSummary) => {
    setRevokingPageId(page.id)
    setError(undefined)
    try {
      await revokePublicPage(page.id)
      setPages((current) =>
        current.map((item) =>
          item.id === page.id ? { ...item, revoked: true } : item
        )
      )
      setPageUrls((current) => {
        const next = { ...current }
        delete next[page.id]
        return next
      })
      showToast({
        kind: "success",
        message: t("settings.revokeMessage", {
          mode:
            page.accessMode === "login"
              ? t("settings.authenticated")
              : t("settings.publicLinkLabel"),
        }),
      })
    } catch {
      setError(t("settings.revokeError"))
    } finally {
      setRevokingPageId(undefined)
    }
  }

  const generatePageLink = async (page: PublicPageSummary) => {
    setLoadingPageLinkId(page.id)
    setError(undefined)
    try {
      const result = await issuePublicPageAccessLink(page.id)
      setPageUrls((current) => ({ ...current, [page.id]: result.url }))
      setPublicUrl(result.url)
      showToast({
        kind: "success",
        message: t("settings.accessLinkGenerated"),
      })
    } catch {
      setError(t("settings.accessLinkError"))
    } finally {
      setLoadingPageLinkId(undefined)
    }
  }

  const saveStatus = async () => {
    const name = statusName.trim()
    if (!name || !isApiConfigured) return
    setSavingStatus(true)
    setError(undefined)
    try {
      const status = await createProjectStatus(projectId, {
        name,
        category: statusCategory,
        position: statuses.length,
      })
      onStatusesChange(
        [...statuses, status].sort((a, b) => a.position - b.position)
      )
      setStatusName("")
      showToast({ kind: "success", message: t("settings.statusCreated") })
    } catch {
      setError(t("settings.workflowError"))
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <>
      {error && (
        <div className="mb-5 space-y-3">
          <FeedbackNotice kind="error" message={error} />
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <CustomerPageControls pages={activePages} members={members} />
        <Frame variant="ghost" className="bg-transparent" spacing="xs">
          <FramePanel fit>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>{t("settings.customerPage")}</FrameTitle>
              <FrameDescription className="mt-1">
                {t("settings.customerPageDescription")}
              </FrameDescription>
            </FrameHeader>
            <div className="space-y-4">
              <div className="border-t pt-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <RiShareBoxIcon />
                  </span>
                  <div>
                    <p className="text-sm font-medium">
                      {t("settings.publicStatusPage")}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t("settings.publicStatusDescription")}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="page-title" className="text-xs font-medium">
                      {t("settings.pageTitle")}
                    </label>
                    <Input
                      id="page-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="page-slug" className="text-xs font-medium">
                      {t("settings.pageSlug")}
                    </label>
                    <Input
                      id="page-slug"
                      value={slug}
                      onChange={(event) =>
                        setSlug(normalizePublicPageSlug(event.target.value))
                      }
                      placeholder={defaultPublicPageSlug(project.key)}
                      maxLength={64}
                      spellCheck={false}
                      aria-describedby="page-slug-hint"
                    />
                    <p
                      id="page-slug-hint"
                      className="text-[11px] leading-relaxed text-muted-foreground"
                    >
                      {t("settings.pageSlugHint", { slug: slug || "..." })}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="page-access"
                      className="text-xs font-medium"
                    >
                      {t("settings.accessMode")}
                    </label>
                    <Select
                      value={accessMode}
                      onValueChange={(value) => setAccessMode(value ?? "link")}
                    >
                      <SelectTrigger id="page-access" className="w-full">
                        <SelectValue>
                          {accessMode === "login"
                            ? t("settings.authenticatedAccess")
                            : t("settings.publicLink")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="link">
                          {t("settings.publicLink")}
                        </SelectItem>
                        <SelectItem value="login">
                          {t("settings.authenticatedAccess")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1.5">
                    <RiLockLine className="size-3" aria-hidden="true" />
                    {t("settings.readOnly")}
                  </Badge>
                  {publicUrl ? (
                    <Badge
                      variant="outline"
                      className="max-w-full gap-1.5 break-all whitespace-normal"
                    >
                      <RiLinkM className="size-3 shrink-0" aria-hidden="true" />
                      {publicUrl}
                    </Badge>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <RiLinkM className="size-3.5" aria-hidden="true" />
                      {activePage
                        ? t("settings.activeLinkTokenHidden")
                        : t("settings.linkGeneratedOnCreate")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="gap-1.5"
                  onClick={() => void savePublicPage()}
                  disabled={saving}
                >
                  {saving && (
                    <RiLoader4Line
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {publicUrl
                    ? t("settings.createNewPublicLink")
                    : t("settings.createPublicPage")}{" "}
                  <RiArrowRightUpLine className="size-3.5" aria-hidden="true" />
                </Button>
                {publicUrl && (
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    render={
                      <a href={publicUrl} target="_blank" rel="noreferrer" />
                    }
                  >
                    {t("settings.openCustomerPage")}
                    <RiExternalLinkLine
                      className="size-3.5"
                      aria-hidden="true"
                    />
                  </Button>
                )}
              </div>
              {isApiConfigured && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium">
                        {t("settings.activePages")}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t("settings.tokensOnce")}
                      </p>
                    </div>
                    {loadingPages && (
                      <RiLoader4Line
                        className="size-4 animate-spin text-muted-foreground"
                        aria-label={t("settings.loadingPages")}
                      />
                    )}
                  </div>
                  {activePages.length === 0 && !loadingPages ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t("settings.noActivePages")}
                    </p>
                  ) : (
                    <ul
                      className="mt-3 grid gap-2"
                      aria-label={t("settings.activePages")}
                    >
                      {activePages.map((page) => (
                        <li
                          key={page.id}
                          className="flex flex-col justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-3 sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">
                              {page.title || t("settings.customerStatusPage")}
                            </p>
                            {pageUrls[page.id] ? (
                              <a
                                href={pageUrls[page.id]}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 block truncate text-xs text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                {pageUrls[page.id]}
                              </a>
                            ) : page.accessMode === "login" ? (
                              <a
                                href={`/p/${page.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 block truncate text-xs text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                /p/{page.slug}
                              </a>
                            ) : (
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="truncate text-xs text-muted-foreground">
                                  /p/{page.slug}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 rounded-lg px-2 text-[11px]"
                                  onClick={() => void generatePageLink(page)}
                                  disabled={Boolean(loadingPageLinkId)}
                                >
                                  {loadingPageLinkId === page.id && (
                                    <RiLoader4Line
                                      className="size-3 animate-spin"
                                      aria-hidden="true"
                                    />
                                  )}
                                  {t("settings.generateAccessLink")}
                                </Button>
                              </div>
                            )}
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {page.accessMode === "login"
                                ? t("settings.authenticated")
                                : t("settings.publicLinkLabel")}
                              {` · ${t("settings.active")}`}
                            </p>
                          </div>
                          {!page.revoked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-fit text-destructive hover:text-destructive"
                              onClick={() => void revokePage(page)}
                              disabled={Boolean(revokingPageId)}
                            >
                              {revokingPageId === page.id && (
                                <RiLoader4Line
                                  className="size-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              )}
                              {t("settings.revoke")}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </FramePanel>
        </Frame>
        <Frame variant="ghost" className="bg-transparent" spacing="xs">
          <FramePanel fit>
            <FrameHeader className="px-0 pt-1">
              <FrameTitle>{t("settings.projectControls")}</FrameTitle>
              <FrameDescription className="mt-1">
                {t("settings.projectControlsDescription")}
              </FrameDescription>
            </FrameHeader>
            <div className="space-y-3">
              <SettingRow
                label={t("settings.projectKey")}
                value={project.key}
              />
              <SettingRow
                label={t("settings.projectVersion")}
                value={`v${project.version}`}
              />
              <SettingRow
                label={t("settings.trackedTasks")}
                value={String(taskCount)}
              />
              <SettingRow
                label={t("settings.milestones")}
                value={String(milestoneCount)}
              />
              <SettingRow
                label={t("settings.targetDate")}
                value={
                  project.targetDate
                    ? formatDate(project.targetDate, locale)
                    : t("settings.notSet")
                }
              />
            </div>
            <div className="mt-5 border-t border-blue-500/20 pt-5 text-xs leading-relaxed text-blue-800 dark:text-blue-200">
              <RiInformationLine
                className="me-1 inline size-3.5"
                aria-hidden="true"
              />
              {t("settings.permissions")}
            </div>
          </FramePanel>
        </Frame>
        <Frame
          variant="ghost"
          className="bg-transparent xl:col-span-2"
          spacing="xs"
        >
          <FramePanel fit>
            <FrameHeader className="px-0 pt-1">
              <FrameTitle>{t("settings.workflow")}</FrameTitle>
              <FrameDescription className="mt-1">
                {t("settings.workflowDescription")}
              </FrameDescription>
            </FrameHeader>
            <WorkflowStatusList
              projectId={projectId}
              statuses={statuses}
              onStatusesChange={onStatusesChange}
              onError={(nextError) => {
                setError(nextError)
              }}
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
              <Input
                value={statusName}
                onChange={(event) => setStatusName(event.target.value)}
                placeholder={t("settings.statusName")}
                aria-label={t("settings.statusName")}
              />
              <Select
                value={statusCategory}
                onValueChange={(value) =>
                  setStatusCategory(
                    (value ?? "todo") as ProjectStatus["category"]
                  )
                }
              >
                <SelectTrigger aria-label={t("settings.statusCategory")}>
                  <SelectValue>
                    {t(`settings.category.${statusCategory}`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(
                    [
                      "backlog",
                      "todo",
                      "in_progress",
                      "blocked",
                      "done",
                    ] as const
                  ).map((category) => (
                    <SelectItem key={category} value={category}>
                      {t(`settings.category.${category}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => void saveStatus()}
                disabled={
                  !statusName.trim() || savingStatus || !isApiConfigured
                }
              >
                {savingStatus ? (
                  <RiLoader4Line
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {t("settings.addStatus")}
              </Button>
            </div>
          </FramePanel>
        </Frame>
        <WorkspaceAccessPanel projectId={projectId} session={session} />
      </div>
    </>
  )
}

const workflowColumnId = "workflow-statuses"

function WorkflowStatusList({
  projectId,
  statuses,
  onStatusesChange,
  onError,
}: {
  projectId: string
  statuses: ProjectStatus[]
  onStatusesChange: (statuses: ProjectStatus[]) => void
  onError: (message: string) => void
}) {
  const { t } = useI18n()
  const orderedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.position - b.position),
    [statuses]
  )
  const [columns, setColumns] = useState<Record<string, ProjectStatus[]>>({
    [workflowColumnId]: orderedStatuses,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Keep the drag surface aligned with server-confirmed status changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColumns({ [workflowColumnId]: orderedStatuses })
  }, [orderedStatuses])

  const statusForId = (id: string) =>
    columns[workflowColumnId]?.find((status) => status.id === id)

  const commitOrder = async (
    nextValue: Record<string, ProjectStatus[]>,
    meta: {
      kind: "item" | "column"
      previousValue: Record<string, ProjectStatus[]>
    }
  ) => {
    if (meta.kind !== "item") return
    const nextStatuses = (nextValue[workflowColumnId] ?? []).map(
      (status, position) => ({ ...status, position })
    )
    const previousStatuses = (meta.previousValue[workflowColumnId] ?? []).map(
      (status, position) => ({ ...status, position })
    )
    if (!nextStatuses.length || !isApiConfigured) {
      setColumns({ [workflowColumnId]: previousStatuses })
      onStatusesChange(previousStatuses)
      if (!isApiConfigured) onError(t("settings.apiRequired"))
      return
    }

    setSaving(true)
    onStatusesChange(nextStatuses)
    try {
      await Promise.all(
        nextStatuses.map((status) =>
          updateProjectStatus(projectId, status.id, {
            position: status.position,
          })
        )
      )
    } catch {
      setColumns({ [workflowColumnId]: previousStatuses })
      onStatusesChange(previousStatuses)
      onError(t("settings.workflowError"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Kanban
      value={columns}
      onValueChange={setColumns}
      getItemValue={(status) => status.id}
      restoreOnCancel
      onValueCommit={(nextValue, meta) => {
        void commitOrder(nextValue, meta)
      }}
      accessibility={{
        announcements: {
          onDragStart({ active }) {
            return t("settings.statusPickedUp", {
              name:
                statusForId(String(active.id))?.name ?? t("settings.workflow"),
            })
          },
          onDragOver({ active }) {
            return t("settings.statusMoving", {
              name:
                statusForId(String(active.id))?.name ?? t("settings.workflow"),
            })
          },
          onDragEnd({ active, over }) {
            return over
              ? t("settings.statusPlaced", {
                  name:
                    statusForId(String(active.id))?.name ??
                    t("settings.workflow"),
                })
              : t("settings.statusReturned")
          },
          onDragCancel() {
            return t("settings.statusReturned")
          },
        },
      }}
      className="mt-5 min-w-0"
    >
      <KanbanBoard className="grid-cols-1!">
        <KanbanColumn
          value={workflowColumnId}
          disabled
          className="min-w-0 opacity-100!"
        >
          <KanbanColumnContent
            value={workflowColumnId}
            className="gap-0 divide-y border-y"
          >
            {(columns[workflowColumnId] ?? []).map((status) => (
              <KanbanItem
                key={status.id}
                value={status.id}
                className="group flex items-center gap-3 py-3 first:pt-4 last:pb-4"
              >
                <KanbanItemHandle
                  aria-label={t("settings.statusDragLabel", {
                    name: status.name,
                  })}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:bg-muted"
                >
                  <RiDraggable className="size-4" aria-hidden="true" />
                </KanbanItemHandle>
                <StatusPill
                  status={status.name}
                  category={status.category}
                  color={status.color}
                  compact
                />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {t(`settings.category.${status.category}`)}
                </span>
                {saving && (
                  <RiLoader4Line
                    className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                    aria-label={t("settings.workflow")}
                  />
                )}
              </KanbanItem>
            ))}
          </KanbanColumnContent>
        </KanbanColumn>
      </KanbanBoard>
      <KanbanOverlay>
        {({ value }) => {
          const status = statusForId(String(value))
          return status ? (
            <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 shadow-lg">
              <RiDraggable
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <StatusPill
                status={status.name}
                category={status.category}
                color={status.color}
                compact
              />
            </div>
          ) : null
        }}
      </KanbanOverlay>
    </Kanban>
  )
}

function WorkspaceAccessPanel({
  projectId,
  session,
}: {
  projectId: string
  session?: Session
}) {
  const { t } = useI18n()
  const canManage =
    session?.membership.role === "owner" || session?.membership.role === "admin"
  const [members, setMembers] = useState<TenantMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [grants, setGrants] = useState<PermissionGrant[]>([])
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member")
  const [loading, setLoading] = useState(Boolean(isApiConfigured))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [inviteUrl, setInviteUrl] = useState<string>()
  const { showToast } = useToast()

  const roleLabel = (memberRole: string) => {
    switch (memberRole) {
      case "owner":
        return t("settings.role.owner")
      case "admin":
        return t("settings.role.admin")
      case "member":
        return t("settings.role.member")
      default:
        return t("settings.role.viewer")
    }
  }

  const load = useCallback(async () => {
    if (!isApiConfigured || !session) return
    setLoading(true)
    setError(undefined)
    try {
      const [memberResult, invitationResult, grantResult] = await Promise.all([
        listTenantMembers(),
        listInvitations(),
        canManage
          ? listPermissionGrants(projectId)
          : Promise.resolve({ items: [] as PermissionGrant[] }),
      ])
      setMembers(memberResult.members ?? [])
      setInvitations(invitationResult.items ?? [])
      setGrants(grantResult.items ?? [])
    } catch {
      setError(t("settings.accessLoadError"))
    } finally {
      setLoading(false)
    }
  }, [canManage, projectId, session, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const invite = async () => {
    if (!email.trim()) return
    setSaving(true)
    setError(undefined)
    setInviteUrl(undefined)
    try {
      const result = await createInvitation({ email: email.trim(), role })
      setInvitations((current) => [result.invitation, ...current])
      setEmail("")
      setInviteUrl(result.acceptUrl)
      showToast({ kind: "success", message: t("settings.inviteCreated") })
    } catch {
      setError(t("settings.inviteError"))
    } finally {
      setSaving(false)
    }
  }

  const updateRole = async (
    member: TenantMember,
    nextRole: "admin" | "member" | "viewer"
  ) => {
    setError(undefined)
    try {
      await updateTenantMemberRole(member.user.id, nextRole)
      setMembers((current) =>
        current.map((item) =>
          item.user.id === member.user.id
            ? { ...item, membership: { ...item.membership, role: nextRole } }
            : item
        )
      )
      showToast({ kind: "success", message: t("settings.memberUpdated") })
    } catch {
      setError(t("settings.memberError"))
    }
  }

  return (
    <Frame
      variant="ghost"
      className="bg-transparent xl:col-span-2"
      spacing="xs"
    >
      <FramePanel fit>
        <FrameHeader className="px-0 pt-0">
          <FrameTitle>{t("settings.workspaceAccess")}</FrameTitle>
          <FrameDescription className="mt-1">
            {t("settings.workspaceAccessDescription")}
          </FrameDescription>
        </FrameHeader>
        {error && (
          <div className="mb-5">
            <FeedbackNotice
              kind="error"
              message={error}
              retry={() => void load()}
            />
          </div>
        )}
        {loading ? (
          <div
            className="flex items-center gap-2 border-y py-4 text-sm text-muted-foreground"
            role="status"
          >
            <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
            {t("settings.loadingAccess")}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="text-xs font-medium">{t("settings.members")}</p>
              <div className="mt-3 divide-y border-y">
                {members.map((member) => (
                  <div
                    key={member.user.id}
                    className="flex min-h-16 items-center gap-4 px-3 py-4 first:pt-4 last:pb-4"
                  >
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                      aria-hidden="true"
                    >
                      {member.user.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {member.user.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {member.user.email}
                      </p>
                    </div>
                    {canManage && member.membership.role !== "owner" ? (
                      <Select
                        value={member.membership.role}
                        onValueChange={(value) => {
                          if (value)
                            void updateRole(
                              member,
                              value as "admin" | "member" | "viewer"
                            )
                        }}
                      >
                        <SelectTrigger className="h-9 w-32 text-xs">
                          <SelectValue>
                            {roleLabel(member.membership.role)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">
                            {t("settings.role.admin")}
                          </SelectItem>
                          <SelectItem value="member">
                            {t("settings.role.member")}
                          </SelectItem>
                          <SelectItem value="viewer">
                            {t("settings.role.viewer")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className="px-2.5 py-1 text-xs">
                        {roleLabel(member.membership.role)}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium">
                {t("settings.inviteMember")}
              </p>
              {canManage ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                  <Input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    placeholder={t("settings.emailAddress")}
                    aria-label={t("settings.emailAddress")}
                  />
                  <Select
                    value={role}
                    onValueChange={(value) =>
                      setRole(
                        (value ?? "member") as "admin" | "member" | "viewer"
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>{roleLabel(role)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        {t("settings.role.admin")}
                      </SelectItem>
                      <SelectItem value="member">
                        {t("settings.role.member")}
                      </SelectItem>
                      <SelectItem value="viewer">
                        {t("settings.role.viewer")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => void invite()}
                    disabled={!email.trim() || saving}
                  >
                    {saving ? (
                      <RiLoader4Line
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                    {t("settings.invite")}
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("settings.manageAccessHint")}
                </p>
              )}
              {invitations.length > 0 && (
                <ul
                  className="mt-5 divide-y border-y"
                  aria-label={t("settings.pendingInvitations")}
                >
                  {invitations.map((invitation) => (
                    <li
                      key={invitation.id}
                      className="flex min-h-12 items-center justify-between gap-3 px-3 py-3.5 text-sm first:pt-3.5 last:pb-3.5"
                    >
                      <span className="truncate">{invitation.email}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {roleLabel(invitation.role)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-6 border-t pt-5">
                <p className="text-xs font-medium">
                  {t("settings.projectOverrides")}
                </p>
                {canManage ? (
                  grants.length ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("settings.overrideCount", { count: grants.length })}
                    </p>
                  ) : (
                    <div className="mt-3 flex items-start gap-3 border border-dashed px-3 py-3.5 text-xs">
                      <RiInformationLine
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-medium">
                          {t("settings.noOverrides")}
                        </p>
                        <p className="mt-1 leading-relaxed text-muted-foreground">
                          {t("settings.inheritedAccess")}{" "}
                          {t("settings.noOverridesHint")}
                        </p>
                      </div>
                    </div>
                  )
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("settings.manageOverridesHint")}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        {inviteUrl && (
          <a
            className="mt-2 block truncate text-xs text-primary hover:underline"
            href={inviteUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t("settings.openInviteLink")}
          </a>
        )}
      </FramePanel>
    </Frame>
  )
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2.5 text-xs last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
function RiShareBoxIcon() {
  return <RiArrowRightUpLine className="size-4" aria-hidden="true" />
}

function TaskDetailsSheet({
  task,
  statuses,
  onOpenChange,
  onTaskStatusChange,
  onEditTask,
}: {
  task: Task | null
  statuses: ProjectStatus[]
  onOpenChange: (open: boolean) => void
  onTaskStatusChange: (taskId: string, statusId: string) => void
  onEditTask: (task: Task) => void
}) {
  const { locale, t } = useI18n()
  const status = statuses.find((item) => item.id === task?.statusId)
  return (
    <Sheet open={Boolean(task)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                {task?.id.slice(0, 8)}
              </Badge>
              {task?.visibility === "customer" && (
                <Badge variant="secondary" className="text-[10px]">
                  {t("dialog.customerVisible")}
                </Badge>
              )}
            </div>
            {task && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => onEditTask(task)}
              >
                <RiEditLine className="size-3.5" aria-hidden="true" />
                {t("details.edit")}
              </Button>
            )}
          </div>
          <SheetTitle>{task?.title ?? t("details.task")}</SheetTitle>
          <SheetDescription>
            {task?.description ?? t("details.noDescription")}
          </SheetDescription>
        </SheetHeader>
        {task && (
          <div className="space-y-6 px-4 pb-6">
            <div className="space-y-2">
              <label className="text-xs font-medium" htmlFor="detail-status">
                {t("dialog.status")}
              </label>
              <Select
                value={task.statusId}
                onValueChange={(value) =>
                  value && onTaskStatusChange(task.id, value)
                }
              >
                <SelectTrigger id="detail-status" className="w-full">
                  <SelectValue>
                    {statuses.find((status) => status.id === task.statusId)
                      ?.name ??
                      task.statusName ??
                      t("dialog.chooseStatus")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DetailField
                label={t("dialog.priority")}
                value={localizedPriority(task.priority, t)}
              />
              <DetailField
                label={t("dialog.startDate")}
                value={
                  task.startDate
                    ? formatDate(task.startDate, locale)
                    : t("settings.notSet")
                }
              />
              <DetailField
                label={t("dialog.dueDate")}
                value={
                  task.dueDate
                    ? formatDate(task.dueDate, locale)
                    : t("settings.notSet")
                }
              />
              <DetailField
                label={t("dialog.estimate")}
                value={
                  task.estimateMinutes
                    ? `${Math.round(task.estimateMinutes / 60)}h`
                    : t("settings.notSet")
                }
              />
              <DetailField
                label={t("details.assignee")}
                value={task.assigneeName ?? t("details.unassigned")}
              />
            </div>
            {task.remoteAssignees?.some((assignee) => !assignee.mapped) && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-[10px] tracking-[0.12em] text-amber-700 uppercase dark:text-amber-400">
                  {t("tasks.remoteAssignee")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {task.remoteAssignees
                    .filter((assignee) => !assignee.mapped)
                    .map((assignee) => (
                      <Badge
                        key={`${assignee.provider}-${assignee.login}`}
                        variant="outline"
                        className="border-amber-500/30 bg-background text-xs"
                      >
                        {assignee.provider} · @{assignee.login}
                      </Badge>
                    ))}
                </div>
              </div>
            )}
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">
                    {t("details.workflowState")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("details.optimisticDescription")}
                  </p>
                </div>
                <StatusPill
                  status={status?.name ?? task.statusName}
                  category={status?.category ?? task.statusCategory}
                  color={status?.color}
                  compact
                />
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

function WorkspaceLoading() {
  return (
    <div className="space-y-5" aria-label="Loading workspace" aria-busy="true">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="h-32 animate-pulse rounded-2xl border bg-card"
          />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <div className="h-[430px] animate-pulse rounded-2xl border bg-card" />
        <div className="h-[430px] animate-pulse rounded-2xl border bg-card" />
      </div>
      <p className="sr-only" role="status">
        Loading workspace data
      </p>
    </div>
  )
}

type Translator = (
  key: TranslationKey,
  values?: Record<string, string | number>
) => string

function resourceLabel(resource: string, t: Translator) {
  const resourceKeys = {
    tasks: "workspace.resource.tasks",
    milestones: "workspace.resource.milestones",
    labels: "workspace.resource.labels",
    connections: "workspace.resource.connections",
    sync: "workspace.resource.sync",
    members: "workspace.resource.members",
  } as const
  const key = resourceKeys[resource as keyof typeof resourceKeys]
  return key ? t(key) : resource
}

function viewTitle(view: WorkspaceView, projectName: string, t: Translator) {
  if (view === "overview") return projectName
  if (view === "tasks") return t("nav.tasks")
  if (view === "roadmap") return t("nav.roadmap")
  if (view === "integrations") return t("nav.integrations")
  return t("nav.settings")
}
function viewDescription(
  view: WorkspaceView,
  description: string | undefined,
  t: Translator
) {
  if (view === "overview")
    return description ?? t("workspace.overviewDescription")
  if (view === "tasks") return t("workspace.tasksDescription")
  if (view === "roadmap") return t("roadmap.description")
  if (view === "integrations") return t("integrations.description")
  return t("settings.description")
}
function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
function localizedPriority(value: string, t: Translator) {
  if (value === "low") return t("priority.low")
  if (value === "medium") return t("priority.medium")
  if (value === "high") return t("priority.high")
  if (value === "urgent") return t("priority.urgent")
  return capitalize(value)
}

function getFilterLabels(t: Translator): Partial<FilterLabels> {
  return {
    addFilter: t("filters.addFilter"),
    advancedFilter: t("filters.advanced"),
    showRecords: t("filters.where"),
    builderEmpty: t("filters.empty"),
    builderEmptyHint: t("filters.addFilter"),
    addCondition: t("filters.addFilter"),
    addConditionGroup: t("filters.addGroup"),
    addToGroup: t("filters.addFilter"),
    removeGroup: t("filters.removeGroup"),
    wrapInGroup: t("filters.addGroup"),
    ungroup: t("filters.ungroup"),
    moveToTopLevel: t("filters.where"),
    moveToGroup: (position) => `${t("filters.addGroup")} ${position}`,
    reorder: t("filters.reorder"),
    reorderHint: t("filters.reorder"),
    groupAll: t("filters.groupAll"),
    groupAny: t("filters.groupAny"),
    groupPlaceholder: t("filters.groupPlaceholder"),
    clearAll: t("filters.clear"),
    groupMenu: t("filters.advanced"),
    searchFields: t("filters.searchFields"),
    searchOperators: t("filters.searchOperators"),
    searchOptions: t("filters.searchOptions"),
    back: t("filters.back"),
    clear: t("filters.clear"),
    apply: t("filters.apply"),
    discard: t("filters.clear"),
    empty: t("filters.empty"),
    loading: t("filters.loading"),
    loadingMore: t("filters.loading"),
    loadMore: t("filters.loading"),
    error: t("workspace.loadError"),
    retry: t("filters.retry"),
    where: t("filters.where"),
    and: t("filters.and"),
    or: t("filters.or"),
    combinator: t("filters.changeCombinator"),
    combinatorLabel: (word) => `${word}, ${t("filters.changeCombinator")}`,
    duplicate: t("filters.duplicate"),
    negate: t("filters.negate"),
    convertToAdvanced: t("filters.advanced"),
    remove: t("filters.remove"),
    chipMenu: (fieldLabel) => `${fieldLabel}, ${t("filters.advanced")}`,
    filtersLabel: t("tasks.filters"),
    filterLabel: (condition) => condition,
    readOnly: t("filters.readOnly"),
    pathSeparator: " > ",
    valuePlaceholder: t("filters.valuePlaceholder"),
    selectPlaceholder: t("filters.selectPlaceholder"),
    noValue: t("filters.noValue"),
    selectCondition: t("filters.selectCondition"),
    incomplete: t("filters.selectCondition"),
    branchAffordance: t("filters.searchOptions"),
    exclusiveHint: t("filters.readOnly"),
    fieldsLabel: t("filters.searchFields"),
    actionsLabel: t("filters.advanced"),
    rangeSeparator: "–",
    negated: (operatorLabel) => `${t("filters.negate")}: ${operatorLabel}`,
    issueOperator: t("filters.selectCondition"),
    issueValue: t("filters.valuePlaceholder"),
    issueRange: t("filters.valuePlaceholder"),
    issueRangeOrder: t("filters.valuePlaceholder"),
    issueEmptyGroup: t("filters.empty"),
  }
}

function getGermanFilterOperatorLabels() {
  return {
    contains: "enthält",
    not_contains: "enthält nicht",
    starts_with: "beginnt mit",
    ends_with: "endet mit",
    is: "ist",
    is_not: "ist nicht",
    is_any_of: "ist eines von",
    is_none_of: "ist keines von",
    has_any_of: "enthält eines von",
    has_all_of: "enthält alle",
    has_none_of: "enthält keines von",
    eq: "ist gleich",
    neq: "ist nicht gleich",
    gt: "ist größer als",
    gte: "ist größer oder gleich",
    lt: "ist kleiner als",
    lte: "ist kleiner oder gleich",
    between: "liegt zwischen",
    not_between: "liegt nicht zwischen",
    is_before: "ist vor",
    is_after: "ist nach",
    is_on_or_before: "ist am oder vor",
    is_on_or_after: "ist am oder nach",
    empty: "ist leer",
    not_empty: "ist nicht leer",
  }
}

function formatDate(value: string, locale: "en" | "de" = "en") {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}
