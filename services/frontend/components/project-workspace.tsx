"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  RiArrowRightUpLine,
  RiCalendarLine,
  RiCheckboxMultipleLine,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiFilter3Line,
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
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { AppShell } from "@/components/app-shell"
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
  createProject,
  attachProjectRepository,
  getGitHubAppInstallUrl,
  getGitHubOAuthStartUrl,
  getProject,
  getSession,
  importGitHubProject,
  isApiConfigured,
  listGitHubConnections,
  listGitHubRepositories,
  listLabels,
  listMilestones,
  listPublicPages,
  listProjectRepositories,
  listProjects,
  listSyncRuns,
  listTasks,
  revokePublicPage,
  updateTask,
} from "@/lib/api"
import { demoWorkspace } from "@/lib/demo-data"
import type {
  GitHubRepository,
  Project,
  ProjectRepository,
  ProjectStatus,
  PublicPageSummary,
  Task,
  WorkspaceData,
  WorkspaceView,
} from "@/lib/types"

const taskFilterQuery = createFilterQuery<string>()

export function ProjectWorkspace({
  initialData = demoWorkspace,
}: {
  initialData?: WorkspaceData
}) {
  const [data, setData] = useState<WorkspaceData>(initialData)
  const [activeView, setActiveView] = useState<WorkspaceView>("overview")
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const loadWorkspace = async (projectId: string) => {
    if (!isApiConfigured) return
    setLoading(true)
    setError(undefined)
    try {
      const projectsResponse = await listProjects()
      const projectFromList = projectsResponse.items.find(
        (item) => item.id === projectId
      )
      if (!projectFromList)
        throw new Error("Project not found in the current workspace.")
      const [
        details,
        tasks,
        milestones,
        labels,
        session,
        connections,
        syncRuns,
      ] = await Promise.all([
        getProject(projectId),
        listTasks(projectId),
        listMilestones(projectId),
        listLabels(projectId),
        getSession().catch(() => undefined),
        listGitHubConnections().catch(() => ({ items: [] })),
        listSyncRuns().catch(() => ({ items: [] })),
      ])
      setData((current) => ({
        ...current,
        project: details.project ?? projectFromList,
        projects: projectsResponse.items,
        statuses: details.statuses,
        tasks: tasks.items,
        milestones: milestones.items,
        labels: labels.items,
        session,
        githubConnections: connections.items,
        syncEvents: syncRuns.items,
      }))
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load the project."
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isApiConfigured) return
    // This effect starts the external API synchronization for the selected
    // project; its async completion updates the workspace state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkspace(initialData.project.id)
    // The initial project is the only server-selected project in this shell.
    // Sidebar changes call loadWorkspace explicitly.
  }, [initialData.project.id])

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
    if (isApiConfigured) {
      void loadWorkspace(projectId)
      return
    }
    const nextProject = data.projects.find(
      (project) => project.id === projectId
    )
    if (nextProject)
      setData((current) => ({ ...current, project: nextProject }))
  }

  const handleCreateTask = async (input: NewTaskInput) => {
    const status =
      data.statuses.find((item) => item.id === input.statusId) ??
      data.statuses[0]
    if (isApiConfigured) {
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
      setNotice("Task created and ready for the team.")
      return
    }
    const localTask: Task = {
      id: `local-${Date.now()}`,
      projectId: data.project.id,
      statusId: input.statusId,
      statusName: status?.name,
      statusCategory: status?.category,
      title: input.title,
      description: input.description,
      milestoneId: input.milestoneId,
      priority: input.priority,
      dueDate: input.dueDate || null,
      estimateMinutes: input.estimateMinutes,
      visibility: input.visibility,
      position: data.tasks.length,
      version: 1,
    }
    setData((current) => ({ ...current, tasks: [...current.tasks, localTask] }))
    setNotice("Task added to the local preview. Connect the API to persist it.")
  }

  const handleCreateProject = async (input: NewProjectInput) => {
    if (isApiConfigured) {
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
      setNotice(`${created.name} created. Loading its workspace now.`)
      await loadWorkspace(created.id)
      return
    }
    const localProject: Project = {
      id: `local-project-${Date.now()}`,
      name: input.name,
      key: input.key || input.name.slice(0, 4).toUpperCase(),
      description: input.description,
      startDate: input.startDate || null,
      targetDate: input.targetDate || null,
      status: "active",
      version: 1,
    }
    setData((current) => ({
      ...current,
      project: localProject,
      projects: [localProject, ...current.projects],
    }))
    setNotice(
      "Project added to the local preview. Connect the API to persist it."
    )
  }

  const handleCreateMilestone = async (input: NewMilestoneInput) => {
    if (isApiConfigured) {
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
      setNotice("Milestone created and added to the roadmap.")
      return
    }
    const localMilestone = {
      id: `local-milestone-${Date.now()}`,
      projectId: data.project.id,
      name: input.name,
      description: input.description,
      startDate: input.startDate || null,
      dueDate: input.dueDate || null,
      status: "open",
      visibility: input.visibility,
      version: 1,
    }
    setData((current) => ({
      ...current,
      milestones: [...current.milestones, localMilestone],
    }))
    setNotice(
      "Milestone added to the local preview. Connect the API to persist it."
    )
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
    if (!isApiConfigured) {
      setNotice(
        "Status moved in the local preview. Connect the API to persist it."
      )
      return
    }
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
          : "Could not save the status change."
      )
    }
  }

  const filterFields = useMemo<FilterField<string>[]>(
    () => [
      {
        id: "status",
        label: "Status",
        type: "select",
        options: data.statuses.map((status) => ({
          value: status.id,
          label: status.name,
        })),
      },
      {
        id: "priority",
        label: "Priority",
        type: "select",
        options: ["urgent", "high", "medium", "low"].map((priority) => ({
          value: priority,
          label: capitalize(priority),
        })),
      },
    ],
    [data.statuses]
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

  return (
    <AppShell
      project={data.project}
      projects={data.projects}
      user={data.session?.user}
      activeView={activeView}
      onViewChange={setActiveView}
      onProjectChange={onProjectChange}
      onCreateTask={() => setTaskDialogOpen(true)}
      onCreateProject={() => setProjectDialogOpen(true)}
      onOpenPublicPage={() => setActiveView("settings")}
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
                Live workspace
              </Badge>
              {isApiConfigured ? (
                <Badge variant="outline" className="gap-1.5 text-[10px]">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  API connected
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1.5 text-[10px]">
                  <RiInformationLine className="size-3" aria-hidden="true" />
                  Preview data
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {viewTitle(activeView, data.project.name)}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {viewDescription(activeView, data.project.description)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setActiveView("settings")}
            >
              <RiExternalLinkLine className="size-4" aria-hidden="true" />
              Customer page
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
              <p className="font-medium">
                We could not refresh this workspace.
              </p>
              <p className="mt-0.5 text-xs opacity-80">{error}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => void loadWorkspace(data.project.id)}
            >
              <RiRefreshLine className="size-3.5" aria-hidden="true" />
              Retry
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

        {loading ? (
          <WorkspaceLoading />
        ) : (
          <>
            {activeView === "overview" && (
              <OverviewView
                data={data}
                progress={progress}
                onOpenTasks={() => setActiveView("tasks")}
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
                projectId={data.project.id}
                connections={data.githubConnections}
                syncEvents={data.syncEvents}
              />
            )}
            {activeView === "settings" && (
              <ProjectSettings
                project={data.project}
                projectId={data.project.id}
                taskCount={data.tasks.length}
                milestoneCount={data.milestones.length}
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
          label="Overall progress"
          value={`${progress}%`}
          detail={`${data.tasks.filter((task) => task.statusCategory === "done").length} of ${data.tasks.length} tasks complete`}
          icon={
            <RiCheckboxMultipleLine className="size-4" aria-hidden="true" />
          }
          accent="indigo"
          progress={progress}
        />
        <MetricCard
          label="Active work"
          value={String(activeTasks)}
          detail="Tasks still in motion"
          icon={<RiTimeLine className="size-4" aria-hidden="true" />}
          accent="blue"
        />
        <MetricCard
          label="Next milestone"
          value={nextMilestone?.name ?? "None scheduled"}
          detail={
            nextMilestone?.dueDate
              ? `Due ${formatDate(nextMilestone.dueDate)}`
              : "Keep planning moving"
          }
          icon={<RiCalendarLine className="size-4" aria-hidden="true" />}
          accent="teal"
        />
        <MetricCard
          label="Needs attention"
          value={String(blockedTasks)}
          detail={
            blockedTasks
              ? "Blocked tasks need a decision"
              : "Nothing blocked right now"
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
                  <FrameTitle>Current delivery flow</FrameTitle>
                  <FrameDescription className="mt-1">
                    A quick view of where the team is spending energy.
                  </FrameDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={onOpenTasks}
                >
                  Open tasks
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
              <FrameTitle>Sync activity</FrameTitle>
              <FrameDescription className="mt-1">
                GitHub deliveries and reconciliation history.
              </FrameDescription>
            </FrameHeader>
            <SyncActivity events={data.syncEvents} />
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full gap-1.5"
              onClick={() => undefined}
            >
              View sync history{" "}
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
            placeholder="Search tasks..."
            aria-label="Search tasks"
            className="h-9 ps-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filters
            fields={filterFields}
            defaultQuery={taskFilterQuery}
            onQueryChange={onFilterChange}
            trigger={
              <Button variant="outline" size="sm" className="gap-1.5">
                <RiFilter3Line className="size-3.5" aria-hidden="true" />
                Filters
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
                    ? formatDateValue(dateFilter, undefined, "MMM d, yyyy")
                    : "Due date"}
                </Button>
              }
            />
            <PopoverContent align="end" className="w-auto p-3">
              <DateSelector
                value={dateFilter}
                onChange={onDateFilterChange}
                allowRange
                showTwoMonths={false}
                label="Filter by due date"
                dayDateFormat="MMM d, yyyy"
                inputHint="MMM d, yyyy"
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
                Board
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-1.5 px-3">
                <RiLayoutIcon view="list" />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        <span>Optimistic moves enabled</span>
        <span aria-hidden="true">·</span>
        <span>Keyboard accessible drag handles</span>
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
  projectId,
  connections,
  syncEvents,
}: {
  projectId: string
  connections: WorkspaceData["githubConnections"]
  syncEvents: WorkspaceData["syncEvents"]
}) {
  const [connecting, setConnecting] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [loadingRepositories, setLoadingRepositories] = useState(false)
  const [importingRepositoryId, setImportingRepositoryId] = useState<string>()
  const [repositories, setRepositories] = useState<GitHubRepository[]>([])
  const [attachedRepositories, setAttachedRepositories] = useState<
    ProjectRepository[]
  >([])
  const [message, setMessage] = useState<string>()

  const loadRepositories = useCallback(async () => {
    if (!isApiConfigured) return
    setLoadingRepositories(true)
    try {
      const [available, attached] = await Promise.all([
        listGitHubRepositories(),
        listProjectRepositories(projectId),
      ])
      setRepositories(available.items)
      setAttachedRepositories(attached.items)
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "GitHub repositories could not be loaded."
      )
    } finally {
      setLoadingRepositories(false)
    }
  }, [projectId])

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
        setMessage(
          "The preview includes a connected GitHub App. Set NEXT_PUBLIC_API_URL to start the real OAuth flow."
        )
        return
      }
      const result = await getGitHubOAuthStartUrl()
      window.location.assign(result.url)
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "GitHub could not be connected."
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
        setMessage("Connect the backend API to install the GitHub App.")
        return
      }
      const result = await getGitHubAppInstallUrl()
      window.location.assign(result.url)
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "The GitHub App could not be started."
      )
    } finally {
      setInstalling(false)
    }
  }

  const attachAndImport = async (repository: GitHubRepository) => {
    setImportingRepositoryId(repository.id)
    setMessage(undefined)
    try {
      const isAttached = attachedRepositories.some(
        (item) => item.link.repositoryId === repository.id
      )
      if (!isAttached) {
        const linked = await attachProjectRepository(projectId, repository.id)
        setAttachedRepositories((current) => [
          ...current,
          { link: linked.link, repository: linked.repository },
        ])
      }
      const run = await importGitHubProject(projectId, repository.id)
      setMessage(
        `Import queued for ${repository.fullName}. Run ${run.runId.slice(0, 8)} is processing in the background.`
      )
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "The repository could not be attached or imported."
      )
    } finally {
      setImportingRepositoryId(undefined)
    }
  }

  const connection = connections[0]
  const attachedIDs = useMemo(
    () => new Set(attachedRepositories.map((item) => item.link.repositoryId)),
    [attachedRepositories]
  )
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <Frame className="bg-card" spacing="xs">
        <FramePanel fit>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>GitHub connection</FrameTitle>
            <FrameDescription className="mt-1">
              Keep issue titles, state, labels, assignees, milestones, and links
              moving in both directions.
            </FrameDescription>
          </FrameHeader>
          <div className="rounded-2xl border bg-muted/20 p-4 sm:p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                  <RiGitHubLine className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium">
                    {connection
                      ? `Connected as ${connection.externalAccountLogin ?? "GitHub account"}`
                      : "No GitHub connection yet"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {connection
                      ? connection.authMethod === "app"
                        ? "GitHub App · least-privilege issue access"
                        : "OAuth · access depends on the scopes granted"
                      : "Connect an App installation or OAuth account"}
                  </p>
                </div>
              </div>
              <Badge
                variant={connection?.active ? "secondary" : "outline"}
                className="w-fit gap-1.5"
              >
                <span
                  className={`size-1.5 rounded-full ${connection?.active ? "bg-emerald-500" : "bg-muted-foreground"}`}
                />
                {connection?.active ? "Active" : "Not connected"}
              </Badge>
            </div>
            {connection && (
              <div className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-3">
                <ConnectionStat
                  label="Auth method"
                  value={
                    connection.authMethod === "app" ? "GitHub App" : "OAuth"
                  }
                />
                <ConnectionStat
                  label="Scope posture"
                  value="Issues + metadata"
                />
                <ConnectionStat
                  label="Repositories"
                  value="Select per project"
                />
              </div>
            )}
            <Button
              className="mt-5 gap-1.5"
              variant={connection ? "outline" : "default"}
              onClick={() => void connectGitHub()}
              disabled={connecting}
            >
              {connecting && (
                <RiLoader4Line
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {connection
                ? "Connect another OAuth account"
                : "Connect with OAuth"}
              <RiArrowRightUpLine className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              className="mt-2 gap-1.5 sm:ms-2"
              variant="outline"
              onClick={() => void installGitHubApp()}
              disabled={installing}
            >
              {installing && (
                <RiLoader4Line
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              Install GitHub App
              <RiArrowRightUpLine className="size-3.5" aria-hidden="true" />
            </Button>
            {message && (
              <p
                role="status"
                aria-live="polite"
                className="mt-3 text-xs text-muted-foreground"
              >
                {message}
              </p>
            )}
          </div>
          <div className="mt-5 rounded-2xl border bg-background p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="text-sm font-medium">Project repositories</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Attach a repository before the first import. Imports run in
                  the worker and preserve local-only workflow fields.
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
                Refresh
              </Button>
            </div>
            {!isApiConfigured ? (
              <p className="mt-4 rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                Repository selection appears when the backend API is connected.
              </p>
            ) : repositories.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                {loadingRepositories
                  ? "Loading repositories..."
                  : "Connect GitHub, then refresh to choose a repository."}
              </p>
            ) : (
              <ul
                className="mt-4 max-h-72 space-y-2 overflow-y-auto"
                aria-label="GitHub repositories"
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
                          {repository.private ? "Private" : "Public"} repository
                          {isAttached ? " · Attached to this project" : ""}
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
                        {isAttached ? "Run import" : "Attach & import"}
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
              title="Bidirectional sync"
              copy="Local app-only fields stay local while shared issue fields reconcile."
            />
            <IntegrationFeature
              icon={<RiLockLine className="size-4" aria-hidden="true" />}
              title="Conflict safe"
              copy="Conflicting fields pause until an authorized person resolves them."
            />
          </div>
        </FramePanel>
      </Frame>
      <Frame className="bg-card" spacing="xs">
        <FramePanel fit>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Latest deliveries</FrameTitle>
            <FrameDescription className="mt-1">
              Webhook receipts are persisted before background processing.
            </FrameDescription>
          </FrameHeader>
          <SyncActivity events={syncEvents} />
        </FramePanel>
      </Frame>
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
}: {
  project: Project
  projectId: string
  taskCount: number
  milestoneCount: number
}) {
  const [accessMode, setAccessMode] = useState("link")
  const [title, setTitle] = useState(`${project.name} · Project status`)
  const [publicUrl, setPublicUrl] = useState<string>()
  const [pages, setPages] = useState<PublicPageSummary[]>([])
  const [loadingPages, setLoadingPages] = useState(false)
  const [revokingPageId, setRevokingPageId] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string>()

  const loadPages = useCallback(async () => {
    if (!isApiConfigured) return
    setLoadingPages(true)
    try {
      const result = await listPublicPages(projectId)
      setPages(result.items)
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Public pages could not be loaded."
      )
    } finally {
      setLoadingPages(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!isApiConfigured) return
    // Refresh page status whenever the selected project changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPages()
  }, [loadPages])

  const savePublicPage = async () => {
    setMessage(undefined)
    if (!isApiConfigured) {
      setMessage("Connect the backend API to create a real customer link.")
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
      setMessage(
        "Customer page created. The token is included in this one-time link."
      )
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not create the customer page."
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
      setMessage(`The ${page.accessMode} customer page link was revoked.`)
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Could not revoke the page."
      )
    } finally {
      setRevokingPageId(undefined)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
      <Frame className="bg-card" spacing="xs">
        <FramePanel fit>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Customer page</FrameTitle>
            <FrameDescription className="mt-1">
              Publish a carefully scoped, read-only project view for customers.
            </FrameDescription>
          </FrameHeader>
          <div className="space-y-5">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <RiShareBoxIcon />
                </span>
                <div>
                  <p className="text-sm font-medium">Public status page</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Only customer-visible tasks and milestones are exposed.
                    Public links are hashed, revocable, and marked noindex.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="page-title" className="text-xs font-medium">
                    Page title
                  </label>
                  <Input
                    id="page-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="page-access" className="text-xs font-medium">
                    Access mode
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
                        Revocable public link
                      </SelectItem>
                      <SelectItem value="login">
                        Authenticated customer access
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1.5">
                  <RiLockLine className="size-3" aria-hidden="true" />
                  Read-only
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
              {publicUrl ? "Create a new public link" : "Create public page"}{" "}
              <RiArrowRightUpLine className="size-3.5" aria-hidden="true" />
            </Button>
            {publicUrl && (
              <Button
                variant="outline"
                className="ms-2 gap-1.5"
                render={<a href={publicUrl} target="_blank" rel="noreferrer" />}
              >
                Open customer page
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
                    <p className="text-xs font-medium">Existing pages</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Tokens are never shown again after creation.
                    </p>
                  </div>
                  {loadingPages && (
                    <RiLoader4Line
                      className="size-4 animate-spin text-muted-foreground"
                      aria-label="Loading existing pages"
                    />
                  )}
                </div>
                {pages.length === 0 && !loadingPages ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No customer pages have been created for this project.
                  </p>
                ) : (
                  <ul
                    className="mt-3 space-y-2"
                    aria-label="Existing customer pages"
                  >
                    {pages.map((page) => (
                      <li
                        key={page.id}
                        className="flex flex-col justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">
                            {page.title || "Customer status page"}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {page.accessMode === "login"
                              ? "Authenticated"
                              : "Public link"}
                            {page.revoked ? " · Revoked" : " · Active"}
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
                            Revoke
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
            <FrameTitle>Project controls</FrameTitle>
            <FrameDescription className="mt-1">
              A small, explicit surface for the controls that shape customer
              visibility.
            </FrameDescription>
          </FrameHeader>
          <div className="space-y-3">
            <SettingRow label="Project key" value={project.key} />
            <SettingRow label="Project version" value={`v${project.version}`} />
            <SettingRow label="Tracked tasks" value={String(taskCount)} />
            <SettingRow label="Milestones" value={String(milestoneCount)} />
            <SettingRow
              label="Target date"
              value={
                project.targetDate ? formatDate(project.targetDate) : "Not set"
              }
            />
          </div>
          <div className="mt-5 rounded-xl border border-blue-500/15 bg-blue-500/5 p-3 text-xs leading-relaxed text-blue-800 dark:text-blue-200">
            <RiInformationLine
              className="me-1 inline size-3.5"
              aria-hidden="true"
            />
            Permission grants can be scoped to this project for workflow,
            integration, sync resolution, and public page administration.
          </div>
        </FramePanel>
      </Frame>
    </div>
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
                Customer visible
              </Badge>
            )}
          </div>
          <SheetTitle>{task?.title ?? "Task details"}</SheetTitle>
          <SheetDescription>
            {task?.description ??
              "No description yet. Use the task editor to add context and delivery notes."}
          </SheetDescription>
        </SheetHeader>
        {task && (
          <div className="space-y-6 px-4 pb-6">
            <div className="space-y-2">
              <label className="text-xs font-medium" htmlFor="detail-status">
                Status
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
              <DetailField label="Priority" value={capitalize(task.priority)} />
              <DetailField
                label="Due date"
                value={task.dueDate ? formatDate(task.dueDate) : "Not set"}
              />
              <DetailField
                label="Estimate"
                value={
                  task.estimateMinutes
                    ? `${Math.round(task.estimateMinutes / 60)}h`
                    : "Not set"
                }
              />
              <DetailField
                label="Assignee"
                value={task.assigneeName ?? "Unassigned"}
              />
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Workflow state</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Optimistic updates roll back if the backend rejects the
                    change.
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

function viewTitle(view: WorkspaceView, projectName: string) {
  if (view === "overview") return projectName
  if (view === "tasks") return "Tasks"
  if (view === "roadmap") return "Roadmap"
  if (view === "integrations") return "Integrations"
  return "Project settings"
}
function viewDescription(view: WorkspaceView, description?: string) {
  if (view === "overview")
    return (
      description ??
      "A shared view of delivery, ownership, and the next decision."
    )
  if (view === "tasks")
    return "Break work into clear, nested pieces and keep the next action visible."
  if (view === "roadmap")
    return "See milestones, dates, and delivery windows in one calm timeline."
  if (view === "integrations")
    return "Connect GitHub without losing local workflow, permissions, or conflict control."
  return "Decide what customers see and who can shape this project."
}
function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}
