"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  RiArrowDownLine,
  RiArrowRightUpLine,
  RiArrowUpLine,
  RiCalendarLine,
  RiCheckboxMultipleLine,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiFilter3Line,
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
import { GitConnectionDialog } from "@/components/git-connection-dialog"
import { KanbanBoardView } from "@/components/kanban-board"
import {
  MilestoneDialog,
  type NewMilestoneInput,
} from "@/components/milestone-dialog"
import {
  ProjectDialog,
  type NewProjectInput,
} from "@/components/project-dialog"
import { RoadmapView } from "@/components/roadmap-view"
import { StatusPill } from "@/components/status-pill"
import { SyncActivity } from "@/components/sync-activity"
import { TaskDialog, type NewTaskInput } from "@/components/task-dialog"
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
  ApiError,
  deleteGitConnection,
  getGitHubAppInstallUrl,
  getGitHubOAuthStartUrl,
  getProject,
  getSession,
  importGitProject,
  isApiConfigured,
  listGitConnections,
  listInvitations,
  listGitRepositories,
  listLabels,
  listMilestones,
  listPermissionGrants,
  listPublicPages,
  listProjectRepositories,
  listProjects,
  listSyncRuns,
  listTasks,
  listTenantMembers,
  logout,
  revokePublicPage,
  updateProject,
  updateProjectStatus,
  updateTenantMemberRole,
  updateTask,
} from "@/lib/api"
import type {
  GitConnection,
  GitRepository,
  Project,
  ProjectRepository,
  ProjectStatus,
  PublicPageSummary,
  Session,
  TenantMember,
  Invitation,
  PermissionGrant,
  Task,
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
  tasks: [],
  milestones: [],
  labels: [],
  syncEvents: [],
  gitConnections: [],
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
  const [notice, setNotice] = useState<string>()

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
        ])
        const nextErrors: Record<string, string> = {}
        const failed = (key: string, reason: unknown) => {
          nextErrors[key] =
            reason instanceof Error ? reason.message : t("workspace.loadError")
        }
        const tasks =
          resources[0].status === "fulfilled"
            ? resources[0].value
            : (failed("tasks", resources[0].reason), { items: [] })
        const milestones =
          resources[1].status === "fulfilled"
            ? resources[1].value
            : (failed("milestones", resources[1].reason), { items: [] })
        const labels =
          resources[2].status === "fulfilled"
            ? resources[2].value
            : (failed("labels", resources[2].reason), { items: [] })
        const connections =
          resources[3].status === "fulfilled"
            ? resources[3].value
            : (failed("connections", resources[3].reason), { items: [] })
        const syncRuns =
          resources[4].status === "fulfilled"
            ? resources[4].value
            : (failed("sync", resources[4].reason), { items: [] })
        setResourceErrors(nextErrors)
        setData((current) => ({
          ...current,
          tasks: tasks.items ?? [],
          milestones: milestones.items ?? [],
          labels: labels.items ?? [],
          gitConnections: connections.items ?? [],
          syncEvents: syncRuns.items ?? [],
        }))
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace(`/login?next=/app/projects/${projectId}/overview`)
          return
        }
        setError(
          caught instanceof Error ? caught.message : t("workspace.loadError")
        )
      } finally {
        setLoading(false)
      }
    },
    [activeView, router, t]
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
      setNotice(t("integrations.connectionSaved"))
    } catch (caught) {
      setData((current) => ({ ...current, project: previous }))
      setError(
        caught instanceof Error
          ? caught.message
          : t("integrations.connectionError")
      )
    }
  }

  const handleGitConnectionsChange = (connections: GitConnection[]) => {
    setData((current) => ({ ...current, gitConnections: connections }))
  }

  const handleCreateTask = async (input: NewTaskInput) => {
    const status =
      data.statuses.find((item) => item.id === input.statusId) ??
      data.statuses[0]
    const created = await createTask(data.project.id, input)
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
    setNotice(t("dialog.createTask"))
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
    setNotice(`${created.name} · ${t("workspace.loading")}`)
    router.push(`/app/projects/${created.key.toLowerCase()}/overview`)
  }

  const handleCreateMilestone = async (input: NewMilestoneInput) => {
    const created = await createMilestone(data.project.id, {
      name: input.name,
      description: input.description,
      startDate: input.startDate || undefined,
      dueDate: input.dueDate || undefined,
      visibility: input.visibility,
    })
    setData((current) => ({
      ...current,
      milestones: [...current.milestones, created],
    }))
    setNotice(t("dialog.createMilestone"))
  }

  const handleTaskStatusChange = async (taskId: string, statusId: string) => {
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
      const updated = await updateTask(data.project.id, taskId, {
        statusId,
        version: task.version,
      })
      setData((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === taskId ? { ...item, ...updated } : item
        ),
      }))
    } catch (caught) {
      setData((current) => ({ ...current, tasks: previous }))
      setError(
        caught instanceof Error
          ? caught.message
          : t("workspace.saveStatusError")
      )
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
      onProjectChange={onProjectChange}
      onCreateTask={() => setTaskDialogOpen(true)}
      onCreateProject={() => setProjectDialogOpen(true)}
      onOpenPublicPage={() => onViewChange("settings")}
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
              <Badge variant="outline" className="gap-1.5 text-[10px]">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {t("status.apiConnected")}
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
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onViewChange("settings")}
            >
              <RiExternalLinkLine className="size-4" aria-hidden="true" />
              {t("workspace.customerPage")}
            </Button>
            <TaskDialog
              open={taskDialogOpen}
              onOpenChange={setTaskDialogOpen}
              statuses={data.statuses}
              milestones={data.milestones}
              onCreate={handleCreateTask}
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
          >
            <RiErrorWarningLine
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t("workspace.refreshError")}</p>
              <p className="mt-0.5 text-xs opacity-80">{error}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => void loadWorkspace(data.project.id)}
            >
              <RiRefreshLine className="size-3.5" aria-hidden="true" />
              {t("workspace.retry")}
            </Button>
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs text-primary"
          >
            {notice}
          </div>
        )}
        {Object.entries(resourceErrors).map(([resource, message]) => (
          <div
            key={resource}
            role="status"
            className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-amber-900 dark:text-amber-100"
          >
            {resource}: {message}
          </div>
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
                onSelectTask={setSelectedTask}
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
                />
                {taskMode === "board" ? (
                  <KanbanBoardView
                    tasks={filteredTasks}
                    statuses={data.statuses}
                    onTaskStatusChange={(taskId, statusId) =>
                      void handleTaskStatusChange(taskId, statusId)
                    }
                    onSelectTask={setSelectedTask}
                  />
                ) : (
                  <TaskList
                    tasks={filteredTasks}
                    statuses={data.statuses}
                    onSelectTask={setSelectedTask}
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
              />
            )}
            {activeView === "integrations" && (
              <IntegrationsView
                project={data.project}
                connections={data.gitConnections}
                syncEvents={data.syncEvents}
                onProjectConnectionChange={handleProjectConnectionChange}
                onConnectionsChange={handleGitConnectionsChange}
              />
            )}
            {activeView === "settings" && (
              <ProjectSettings
                project={data.project}
                projectId={data.project.id}
                taskCount={data.tasks.length}
                milestoneCount={data.milestones.length}
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
    </AppShell>
  )
}

function OverviewView({
  data,
  progress,
  onOpenTasks,
  onSelectTask,
}: {
  data: WorkspaceData
  progress: number
  onOpenTasks: () => void
  onSelectTask: (task: Task) => void
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <Frame className="bg-card" spacing="xs">
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
            <div className="overflow-hidden rounded-xl border bg-muted/20">
              <KanbanBoardView
                tasks={data.tasks.slice(0, 6)}
                statuses={data.statuses}
                onTaskStatusChange={() => undefined}
                onSelectTask={onSelectTask}
              />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="bg-card" spacing="xs">
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
            <SyncActivity events={data.syncEvents} />
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full gap-1.5"
              onClick={() => undefined}
            >
              {t("workspace.viewSyncHistory")}{" "}
              <RiArrowRightUpLine className="size-3.5" aria-hidden="true" />
            </Button>
          </FramePanel>
        </Frame>
      </div>
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
}: {
  query: string
  onQueryChange: (value: string) => void
  filterFields: FilterField<string>[]
  onFilterChange: (query: Parameters<typeof flattenFilterRules>[0]) => void
  dateFilter?: DateSelectorValue
  onDateFilterChange: (value: DateSelectorValue | undefined) => void
  taskMode: "board" | "list"
  onTaskModeChange: (value: "board" | "list") => void
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
  onProjectConnectionChange,
  onConnectionsChange,
}: {
  project: Project
  connections: WorkspaceData["gitConnections"]
  syncEvents: WorkspaceData["syncEvents"]
  onProjectConnectionChange: (
    connectionId: string | null
  ) => Promise<void> | void
  onConnectionsChange: (connections: GitConnection[]) => void
}) {
  const [connecting, setConnecting] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [loadingRepositories, setLoadingRepositories] = useState(false)
  const [importingRepositoryId, setImportingRepositoryId] = useState<string>()
  const [repositories, setRepositories] = useState<GitRepository[]>([])
  const [attachedRepositories, setAttachedRepositories] = useState<
    ProjectRepository[]
  >([])
  const [availableConnections, setAvailableConnections] =
    useState<GitConnection[]>(connections)
  const [selectedConnectionId, setSelectedConnectionId] = useState(
    project.connectionId ?? ""
  )
  const [message, setMessage] = useState<string>()
  const { t } = useI18n()

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
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : t("integrations.repositoryLoadError")
      )
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

  const connectGitHub = async () => {
    setConnecting(true)
    setMessage(undefined)
    try {
      if (!isApiConfigured) {
        setMessage(t("integrations.connectThenRefresh"))
        return
      }
      const result = await getGitHubOAuthStartUrl()
      window.location.assign(result.url)
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : t("integrations.connectionError")
      )
    } finally {
      setConnecting(false)
    }
  }

  const installGitHubApp = async () => {
    setInstalling(true)
    setMessage(undefined)
    try {
      if (!isApiConfigured) {
        setMessage(t("integrations.backendRequired"))
        return
      }
      const result = await getGitHubAppInstallUrl()
      window.location.assign(result.url)
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : t("integrations.connectionError")
      )
    } finally {
      setInstalling(false)
    }
  }

  const attachAndImport = async (repository: GitRepository) => {
    setImportingRepositoryId(repository.id)
    setMessage(undefined)
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
      setMessage(
        t("integrations.importQueued", {
          repository: repository.fullName,
          runId: run.runId.slice(0, 8),
        })
      )
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : t("integrations.repositoryLoadError")
      )
    } finally {
      setImportingRepositoryId(undefined)
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
    setMessage(t("integrations.connectionSaved"))
  }

  const disconnect = async (connection: GitConnection) => {
    if (!isApiConfigured) return
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
      setMessage(t("integrations.disconnect"))
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : t("integrations.connectionError")
      )
    }
  }

  const selectedConnection = availableConnections.find(
    (connection) => connection.id === selectedConnectionId
  )
  const attachedIDs = useMemo(
    () => new Set(attachedRepositories.map((item) => item.link.repositoryId)),
    [attachedRepositories]
  )
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <Frame className="bg-card" spacing="xs">
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
          <div className="space-y-3">
            {availableConnections.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 p-5 text-sm">
                <p className="font-medium">
                  {t("integrations.noConnection", {
                    provider: "GitHub / GitLab",
                  })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("integrations.connectAppOrToken")}
                </p>
              </div>
            ) : (
              availableConnections.map((connection) => {
                const isGitHub = connection.provider === "github"
                const ProviderIcon = isGitHub ? RiGitHubLine : RiGitlabLine
                const providerName = isGitHub
                  ? t("integrations.github")
                  : t("integrations.gitlab")
                return (
                  <div
                    key={connection.id}
                    className={cn(
                      "rounded-2xl border bg-muted/20 p-4 sm:p-5",
                      selectedConnectionId === connection.id &&
                        "border-primary/40 ring-1 ring-primary/15"
                    )}
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div className="flex items-start gap-3">
                        <span className="flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                          <ProviderIcon className="size-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">
                            {connection.name || providerName}
                          </p>
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
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="w-fit gap-1.5">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          {t("status.active")}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => void disconnect(connection)}
                        >
                          {t("integrations.disconnect")}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
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
                  </div>
                )
              })
            )}
          </div>
          <div className="mt-5 rounded-2xl border bg-background p-4 sm:p-5">
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
                    <SelectValue />
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
            {selectedConnection && (
              <p className="mt-3 text-xs text-primary" role="status">
                {t("integrations.connectedAs", {
                  account:
                    selectedConnection.name || selectedConnection.provider,
                })}
              </p>
            )}
          </div>
          {message && (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 text-xs text-muted-foreground"
            >
              {message}
            </p>
          )}
          <div className="mt-5 rounded-2xl border bg-background p-4">
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
              <p className="mt-4 rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                {t("integrations.backendRequired")}
              </p>
            ) : repositories.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                {loadingRepositories
                  ? t("integrations.loadingRepositories")
                  : t("integrations.connectThenRefresh")}
              </p>
            ) : (
              <ul
                className="mt-4 max-h-72 space-y-2 overflow-y-auto"
                aria-label={t("integrations.repositories")}
              >
                {repositories.map((repository) => {
                  const isAttached = attachedIDs.has(repository.id)
                  const isImporting = importingRepositoryId === repository.id
                  return (
                    <li
                      key={repository.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {repository.fullName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {repository.private
                            ? t("integrations.privateRepository")
                            : t("integrations.publicRepository")}
                          {isAttached ? ` · ${t("integrations.attached")}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={isAttached ? "outline" : "default"}
                        className="w-full shrink-0 gap-1.5 sm:w-auto"
                        onClick={() => void attachAndImport(repository)}
                        disabled={Boolean(importingRepositoryId)}
                      >
                        {isImporting && (
                          <RiLoader4Line
                            className="size-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {isAttached
                          ? t("integrations.runImport")
                          : t("integrations.attachImport")}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
      <Frame className="bg-card" spacing="xs">
        <FramePanel fit>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>{t("integrations.latestDeliveries")}</FrameTitle>
            <FrameDescription className="mt-1">
              {t("integrations.webhookDescription")}
            </FrameDescription>
          </FrameHeader>
          <SyncActivity events={syncEvents} />
        </FramePanel>
      </Frame>
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
    <div className="flex gap-3 rounded-xl border bg-background p-3">
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
  statuses,
  session,
  onStatusesChange,
}: {
  project: Project
  projectId: string
  taskCount: number
  milestoneCount: number
  statuses: ProjectStatus[]
  session?: Session
  onStatusesChange: (statuses: ProjectStatus[]) => void
}) {
  const { locale, t } = useI18n()
  const [accessMode, setAccessMode] = useState("link")
  const [title, setTitle] = useState(`${project.name} · Project status`)
  const [publicUrl, setPublicUrl] = useState<string>()
  const [pages, setPages] = useState<PublicPageSummary[]>([])
  const [loadingPages, setLoadingPages] = useState(false)
  const [revokingPageId, setRevokingPageId] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string>()

  const [statusName, setStatusName] = useState("")
  const [statusCategory, setStatusCategory] =
    useState<ProjectStatus["category"]>("todo")
  const [savingStatus, setSavingStatus] = useState(false)

  const loadPages = useCallback(async () => {
    if (!isApiConfigured) return
    setLoadingPages(true)
    try {
      const result = await listPublicPages(projectId)
      setPages(result.items)
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : t("settings.createError")
      )
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

  const savePublicPage = async () => {
    setMessage(undefined)
    if (!isApiConfigured) {
      setMessage(t("settings.apiRequired"))
      return
    }
    setSaving(true)
    try {
      const created = await createPublicPage(projectId, {
        accessMode: accessMode as "link" | "login",
        title,
      })
      setPublicUrl(created.url)
      setPages((current) => [created.page, ...current])
      setMessage(t("settings.pageCreated"))
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : t("settings.createError")
      )
    } finally {
      setSaving(false)
    }
  }

  const revokePage = async (page: PublicPageSummary) => {
    setRevokingPageId(page.id)
    setMessage(undefined)
    try {
      await revokePublicPage(page.id)
      setPages((current) =>
        current.map((item) =>
          item.id === page.id ? { ...item, revoked: true } : item
        )
      )
      setMessage(
        t("settings.revokeMessage", {
          mode:
            page.accessMode === "login"
              ? t("settings.authenticated")
              : t("settings.publicLinkLabel"),
        })
      )
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : t("settings.revokeError")
      )
    } finally {
      setRevokingPageId(undefined)
    }
  }

  const saveStatus = async () => {
    const name = statusName.trim()
    if (!name || !isApiConfigured) return
    setSavingStatus(true)
    setMessage(undefined)
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
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : t("settings.workflowError")
      )
    } finally {
      setSavingStatus(false)
    }
  }

  const moveStatus = async (status: ProjectStatus, direction: -1 | 1) => {
    const ordered = [...statuses].sort((a, b) => a.position - b.position)
    const index = ordered.findIndex((item) => item.id === status.id)
    const target = ordered[index + direction]
    if (!target || !isApiConfigured) return
    const next = ordered.map((item) => {
      if (item.id === status.id) return { ...item, position: index + direction }
      if (item.id === target.id) return { ...item, position: index }
      return item
    })
    onStatusesChange(next)
    try {
      await Promise.all([
        updateProjectStatus(projectId, status.id, {
          position: index + direction,
        }),
        updateProjectStatus(projectId, target.id, { position: index }),
      ])
    } catch (caught) {
      onStatusesChange(statuses)
      setMessage(
        caught instanceof Error ? caught.message : t("settings.workflowError")
      )
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
      <Frame className="bg-card" spacing="xs">
        <FramePanel fit>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>{t("settings.customerPage")}</FrameTitle>
            <FrameDescription className="mt-1">
              {t("settings.customerPageDescription")}
            </FrameDescription>
          </FrameHeader>
          <div className="space-y-5">
            <div className="rounded-xl border bg-muted/20 p-4">
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
                  <label htmlFor="page-access" className="text-xs font-medium">
                    {t("settings.accessMode")}
                  </label>
                  <Select
                    value={accessMode}
                    onValueChange={(value) => setAccessMode(value ?? "link")}
                  >
                    <SelectTrigger id="page-access" className="w-full">
                      <SelectValue />
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
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1.5">
                  <RiLockLine className="size-3" aria-hidden="true" />
                  {t("settings.readOnly")}
                </Badge>
                <Badge variant="outline" className="gap-1.5">
                  <RiLinkM className="size-3" aria-hidden="true" />
                  {publicUrl ?? `/p/${project.key.toLowerCase()}-status`}
                </Badge>
              </div>
            </div>
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
                className="ms-2 gap-1.5"
                render={<a href={publicUrl} target="_blank" rel="noreferrer" />}
              >
                {t("settings.openCustomerPage")}
                <RiExternalLinkLine className="size-3.5" aria-hidden="true" />
              </Button>
            )}
            {message && (
              <p className="mt-3 text-xs text-muted-foreground" role="status">
                {message}
              </p>
            )}
            {isApiConfigured && (
              <div className="mt-5 rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium">
                      {t("settings.existingPages")}
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
                {pages.length === 0 && !loadingPages ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t("settings.noPages")}
                  </p>
                ) : (
                  <ul
                    className="mt-3 space-y-2"
                    aria-label={t("settings.existingPages")}
                  >
                    {pages.map((page) => (
                      <li
                        key={page.id}
                        className="flex flex-col justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">
                            {page.title || t("settings.customerStatusPage")}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {page.accessMode === "login"
                              ? t("settings.authenticated")
                              : t("settings.publicLinkLabel")}
                            {page.revoked
                              ? ` · ${t("settings.revoked")}`
                              : ` · ${t("settings.active")}`}
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
      <Frame className="bg-card" spacing="xs">
        <FramePanel fit>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>{t("settings.projectControls")}</FrameTitle>
            <FrameDescription className="mt-1">
              {t("settings.projectControlsDescription")}
            </FrameDescription>
          </FrameHeader>
          <div className="space-y-3">
            <SettingRow label={t("settings.projectKey")} value={project.key} />
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
          <div className="mt-5 rounded-xl border border-blue-500/15 bg-blue-500/5 p-3 text-xs leading-relaxed text-blue-800 dark:text-blue-200">
            <RiInformationLine
              className="me-1 inline size-3.5"
              aria-hidden="true"
            />
            {t("settings.permissions")}
          </div>
        </FramePanel>
      </Frame>
      <Frame className="bg-card xl:col-span-2" spacing="xs">
        <FramePanel fit>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>{t("settings.workflow")}</FrameTitle>
            <FrameDescription className="mt-1">
              {t("settings.workflowDescription")}
            </FrameDescription>
          </FrameHeader>
          <div className="space-y-2">
            {[...statuses]
              .sort((a, b) => a.position - b.position)
              .map((status, index) => (
                <div
                  key={status.id}
                  className="flex items-center gap-3 rounded-xl border bg-muted/15 px-3 py-2.5"
                >
                  <StatusPill
                    status={status.name}
                    category={status.category}
                    color={status.color}
                    compact
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {t(`settings.category.${status.category}`)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("settings.moveEarlier", {
                        name: status.name,
                      })}
                      disabled={index === 0}
                      onClick={() => void moveStatus(status, -1)}
                    >
                      <RiArrowUpLine className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("settings.moveLater", {
                        name: status.name,
                      })}
                      disabled={index === statuses.length - 1}
                      onClick={() => void moveStatus(status, 1)}
                    >
                      <RiArrowDownLine
                        className="size-3.5"
                        aria-hidden="true"
                      />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
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
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  ["backlog", "todo", "in_progress", "blocked", "done"] as const
                ).map((category) => (
                  <SelectItem key={category} value={category}>
                    {t(`settings.category.${category}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => void saveStatus()}
              disabled={!statusName.trim() || savingStatus || !isApiConfigured}
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
  const [message, setMessage] = useState<string>()
  const [inviteUrl, setInviteUrl] = useState<string>()

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
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : t("settings.accessLoadError")
      )
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
    setMessage(undefined)
    setInviteUrl(undefined)
    try {
      const result = await createInvitation({ email: email.trim(), role })
      setInvitations((current) => [result.invitation, ...current])
      setEmail("")
      setInviteUrl(result.acceptUrl)
      setMessage(t("settings.inviteCreated"))
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : t("settings.inviteError")
      )
    } finally {
      setSaving(false)
    }
  }

  const updateRole = async (
    member: TenantMember,
    nextRole: "admin" | "member" | "viewer"
  ) => {
    try {
      await updateTenantMemberRole(member.user.id, nextRole)
      setMembers((current) =>
        current.map((item) =>
          item.user.id === member.user.id
            ? { ...item, membership: { ...item.membership, role: nextRole } }
            : item
        )
      )
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : t("settings.memberError")
      )
    }
  }

  return (
    <Frame className="bg-card xl:col-span-2" spacing="xs">
      <FramePanel fit>
        <FrameHeader className="px-0 pt-0">
          <FrameTitle>{t("settings.workspaceAccess")}</FrameTitle>
          <FrameDescription className="mt-1">
            {t("settings.workspaceAccessDescription")}
          </FrameDescription>
        </FrameHeader>
        {loading ? (
          <p className="text-xs text-muted-foreground" role="status">
            {t("settings.loadingAccess")}
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="text-xs font-medium">{t("settings.members")}</p>
              <div className="mt-2 space-y-2">
                {members.map((member) => (
                  <div
                    key={member.user.id}
                    className="flex items-center gap-3 rounded-xl border bg-muted/15 px-3 py-2.5"
                  >
                    <span
                      className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
                      aria-hidden="true"
                    >
                      {member.user.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {member.user.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
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
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue />
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
                      <Badge variant="outline" className="text-[10px]">
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
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
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
                      <SelectValue />
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
                  className="mt-4 space-y-2"
                  aria-label={t("settings.pendingInvitations")}
                >
                  {invitations.map((invitation) => (
                    <li
                      key={invitation.id}
                      className="flex items-center justify-between gap-3 rounded-xl border bg-muted/15 px-3 py-2.5 text-xs"
                    >
                      <span className="truncate">{invitation.email}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {roleLabel(invitation.role)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-5 text-xs font-medium">
                {t("settings.projectOverrides")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {grants.length
                  ? t("settings.overrideCount", { count: grants.length })
                  : t("settings.noOverrides")}
              </p>
            </div>
          </div>
        )}
        {message && (
          <p className="mt-4 text-xs text-muted-foreground" role="status">
            {message}
          </p>
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
}: {
  task: Task | null
  statuses: ProjectStatus[]
  onOpenChange: (open: boolean) => void
  onTaskStatusChange: (taskId: string, statusId: string) => void
}) {
  const { locale, t } = useI18n()
  const status = statuses.find((item) => item.id === task?.statusId)
  return (
    <Sheet open={Boolean(task)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              {task?.id.slice(0, 8)}
            </Badge>
            {task?.visibility === "customer" && (
              <Badge variant="secondary" className="text-[10px]">
                {t("dialog.customerVisible")}
              </Badge>
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
                  <SelectValue />
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
