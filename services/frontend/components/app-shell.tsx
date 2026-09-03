"use client"

import { useEffect, useState, type ComponentType, type ReactNode } from "react"
import Link from "next/link"
import {
  RiAddLine,
  RiArrowDownSLine,
  RiBriefcaseLine,
  RiCheckboxMultipleLine,
  RiCloseLine,
  RiComputerLine,
  RiDashboardLine,
  RiInboxLine,
  RiLayoutGridLine,
  RiMoonLine,
  RiMenuLine,
  RiPlugLine,
  RiQuestionLine,
  RiRoadMapLine,
  RiSearchLine,
  RiSettings3Line,
  RiSunLine,
  RiLogoutBoxRLine,
} from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { LanguageSwitcher } from "@/components/language-switcher"
import { NotificationBell } from "@/components/notification-bell"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useI18n } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"
import type { Project, Tenant, User, WorkspaceView } from "@/lib/types"
import { useTheme } from "next-themes"

const navigation: Array<{
  id: WorkspaceView
  label: TranslationKey
  icon: ComponentType<{ className?: string }>
}> = [
  { id: "overview", label: "nav.overview", icon: RiDashboardLine },
  { id: "tasks", label: "nav.tasks", icon: RiCheckboxMultipleLine },
  { id: "roadmap", label: "nav.roadmap", icon: RiRoadMapLine },
  { id: "integrations", label: "nav.integrations", icon: RiPlugLine },
  { id: "settings", label: "nav.settings", icon: RiSettings3Line },
]

const createProjectValue = "__create_project__"
type ShellView = WorkspaceView | "portfolio" | "requests"

export function AppShell({
  project,
  projects,
  user,
  tenant,
  activeView,
  apiConnected,
  onProjectChange,
  onCreateTask,
  onCreateProject,
  onLogout,
  showNewTask = true,
  children,
}: {
  project: Project
  projects: Project[]
  user?: User
  tenant?: Tenant
  activeView: ShellView
  apiConnected?: boolean
  onProjectChange: (projectId: string) => void
  onCreateTask: () => void
  onCreateProject: () => void
  onLogout: () => void
  showNewTask?: boolean
  children: ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const closeSidebar = () => {
    setSidebarOpen(false)
  }

  return (
    <div className="min-h-svh bg-muted/30 text-foreground">
      {sidebarOpen && (
        <button
          type="button"
          aria-label={t("nav.closeNavigation")}
          className="fixed inset-0 z-30 bg-slate-950/20 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 flex w-[248px] -translate-x-full flex-col border-e bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:translate-x-0",
          sidebarOpen && "translate-x-0"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <RiLayoutGridLine className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">
                JustProjects
              </p>
              <p className="text-[10px] text-sidebar-foreground/60">
                {t("brand.tagline")}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-label={t("nav.closeNavigation")}
            onClick={() => setSidebarOpen(false)}
          >
            <RiCloseLine aria-hidden="true" />
          </Button>
        </div>

        <div className="border-b p-3">
          <label className="sr-only" htmlFor="workspace-project">
            {tenant?.name ?? t("nav.workspace")}
          </label>
          <p className="mb-2 px-1 text-[10px] font-semibold tracking-[0.14em] text-sidebar-foreground/50 uppercase">
            {tenant?.name ?? t("nav.workspace")}
          </p>
          <Select
            value={project.id}
            onValueChange={(projectId) => {
              if (projectId === createProjectValue) {
                onCreateProject()
                return
              }
              if (projectId) onProjectChange(projectId)
            }}
          >
            <SelectTrigger
              id="workspace-project"
              aria-label={t("nav.workspace")}
              className="h-10 w-full rounded-xl border-sidebar-border bg-sidebar-accent px-3 text-sm font-medium focus-visible:ring-sidebar-ring"
            >
              <SelectValue>
                {project.key} · {project.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{t("nav.project")}</SelectLabel>
                {projects.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.key} · {item.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectItem value={createProjectValue}>
                <RiAddLine aria-hidden="true" />
                {t("nav.createProject")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label={t("nav.project")}>
          <Link
            href="/app"
            onClick={closeSidebar}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground",
              activeView === "portfolio" &&
                "bg-sidebar-primary/10 font-medium text-sidebar-primary"
            )}
          >
            <RiBriefcaseLine className="size-4" aria-hidden="true" />
            {t("nav.portfolio")}
          </Link>
          <Link
            href="/app/requests"
            onClick={closeSidebar}
            className={cn(
              "mb-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground",
              activeView === "requests" &&
                "bg-sidebar-primary/10 font-medium text-sidebar-primary"
            )}
          >
            <RiInboxLine className="size-4" aria-hidden="true" />
            {t("nav.requests")}
          </Link>
          <p className="mb-2 px-2 text-[10px] font-semibold tracking-[0.16em] text-sidebar-foreground/45 uppercase">
            {t("nav.project")}
          </p>
          {navigation.map((item) => {
            const Icon = item.icon
            const active = item.id === activeView
            return (
              <Link
                key={item.id}
                aria-current={active ? "page" : undefined}
                href={`/app/projects/${project.key.toLowerCase()}/${item.id}`}
                onClick={() => {
                  closeSidebar()
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  active &&
                    "bg-sidebar-primary/10 font-medium text-sidebar-primary"
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {t(item.label)}
                {item.id === "integrations" && (
                  <span
                    className="ms-auto size-1.5 rounded-full bg-emerald-500"
                    aria-label={t("status.connected")}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="border-t p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-sidebar-foreground/60">
            <RiQuestionLine className="size-4" aria-hidden="true" />
            <span>{t("nav.needHelp")}</span>
            <span className="ms-auto text-[10px]">⌘ /</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl bg-sidebar-accent p-2 text-left transition outline-none hover:bg-sidebar-primary/10 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                />
              }
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {user?.name
                  ?.split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() ?? "JM"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {user?.name ?? t("nav.justlabMember")}
                </span>
                <span className="block truncate text-[10px] text-sidebar-foreground/55">
                  {user?.email ?? t("nav.justlabMember")}
                </span>
              </span>
              <RiArrowDownSLine
                className="size-4 text-sidebar-foreground/50"
                aria-hidden="true"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-64 p-2">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {tenant?.name ?? t("nav.workspace")}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <div className="space-y-2 px-1 py-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {t("theme.label")}
                  </span>
                  <ThemeSwitcher />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {t("language.label")}
                  </span>
                  <LanguageSwitcher
                    className="rounded-md border-0 bg-transparent p-0"
                    selectClassName="h-8 w-auto min-w-[5.5rem] px-1"
                  />
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} variant="destructive">
                <RiLogoutBoxRLine aria-hidden="true" />
                {t("account.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="min-w-0 lg:ms-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              aria-label={t("nav.openNavigation")}
              onClick={() => setSidebarOpen(true)}
            >
              <RiMenuLine aria-hidden="true" />
            </Button>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span>{t("nav.workspace")}</span>
              <span aria-hidden="true">/</span>
              <span className="font-medium text-foreground">
                {activeView === "portfolio"
                  ? t("nav.portfolio")
                  : activeView === "requests"
                    ? t("nav.requests")
                    : project.key}
              </span>
              {apiConnected && (
                <span className="ms-2 inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                  <span
                    className="size-1.5 rounded-full bg-emerald-500"
                    aria-hidden="true"
                  />
                  {t("status.apiConnected")}
                </span>
              )}
            </div>
            <div className="min-w-0 sm:hidden">
              <p className="truncate text-sm font-semibold">
                {activeView === "portfolio"
                  ? t("nav.portfolio")
                  : activeView === "requests"
                    ? t("nav.requests")
                    : project.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <NotificationBell />
            <Button
              variant="outline"
              size="sm"
              className="hidden h-8 min-w-48 justify-start gap-2 text-muted-foreground md:inline-flex"
              aria-label={t("nav.searchAnything")}
              aria-haspopup="dialog"
              onClick={() => setSearchOpen(true)}
            >
              <RiSearchLine className="size-3.5" aria-hidden="true" />
              <span className="flex-1 text-left">
                {t("nav.searchAnything")}
              </span>
              <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px]">
                ⌘ K
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label={t("nav.searchAnything")}
              aria-haspopup="dialog"
              onClick={() => setSearchOpen(true)}
            >
              <RiSearchLine className="size-4" aria-hidden="true" />
            </Button>
            {showNewTask && (
              <Button
                size="sm"
                className="hidden gap-1.5 sm:inline-flex"
                onClick={onCreateTask}
              >
                <RiAddLine className="size-4" aria-hidden="true" />
                {t("nav.newTask")}
              </Button>
            )}
          </div>
        </header>
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
      <WorkspaceSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        project={project}
        projects={projects}
        onCreateTask={onCreateTask}
        onCreateProject={onCreateProject}
        showNewTask={showNewTask}
      />
    </div>
  )
}

function ThemeSwitcher() {
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Avoid choosing a concrete theme before next-themes has read the client preference.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const selectedTheme =
    mounted && (theme === "light" || theme === "dark") ? theme : "system"
  const themeLabel =
    selectedTheme === "light"
      ? t("theme.light")
      : selectedTheme === "dark"
        ? t("theme.dark")
        : t("theme.system")

  return (
    <Select
      value={selectedTheme}
      onValueChange={(value) => value && setTheme(value)}
    >
      <SelectTrigger
        aria-label={t("theme.label")}
        className="h-8 min-w-8 gap-1.5 border-0 bg-transparent px-2 text-xs font-medium shadow-none focus-visible:ring-0"
      >
        {selectedTheme === "light" ? (
          <RiSunLine className="size-4" aria-hidden="true" />
        ) : selectedTheme === "dark" ? (
          <RiMoonLine className="size-4" aria-hidden="true" />
        ) : (
          <RiComputerLine className="size-4" aria-hidden="true" />
        )}
        <SelectValue>
          <span className="hidden sm:inline">{themeLabel}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="system">
          <RiComputerLine className="size-4" aria-hidden="true" />
          {t("theme.system")}
        </SelectItem>
        <SelectItem value="light">
          <RiSunLine className="size-4" aria-hidden="true" />
          {t("theme.light")}
        </SelectItem>
        <SelectItem value="dark">
          <RiMoonLine className="size-4" aria-hidden="true" />
          {t("theme.dark")}
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

function WorkspaceSearchDialog({
  open,
  onOpenChange,
  project,
  projects,
  onCreateTask,
  onCreateProject,
  showNewTask,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
  projects: Project[]
  onCreateTask: () => void
  onCreateProject: () => void
  showNewTask: boolean
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const matchingViews = navigation.filter((item) => {
    const label = t(item.label).toLowerCase()
    return !normalizedQuery || label.includes(normalizedQuery)
  })
  const matchingProjects = projects.filter((item) => {
    const label = `${item.key} ${item.name}`.toLowerCase()
    return !normalizedQuery || label.includes(normalizedQuery)
  })
  const showActions =
    !normalizedQuery ||
    t("nav.newTask").toLowerCase().includes(normalizedQuery) ||
    t("nav.createProject").toLowerCase().includes(normalizedQuery)

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("")
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-4 pe-12">
          <DialogTitle>{t("search.title")}</DialogTitle>
          <DialogDescription>{t("search.description")}</DialogDescription>
        </DialogHeader>
        <div className="p-4">
          <div className="relative">
            <RiSearchLine
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search.placeholder")}
              aria-label={t("search.placeholder")}
              className="h-10 ps-9"
            />
          </div>
          <div className="mt-4 max-h-80 overflow-y-auto">
            {matchingViews.length > 0 && (
              <SearchGroupLabel>{t("search.views")}</SearchGroupLabel>
            )}
            <div className="space-y-1">
              {matchingViews.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.id}
                    href={`/app/projects/${project.key.toLowerCase()}/${item.id}`}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    <span>{t(item.label)}</span>
                  </Link>
                )
              })}
            </div>

            {matchingProjects.length > 0 && (
              <>
                <SearchGroupLabel className="mt-5">
                  {t("search.projects")}
                </SearchGroupLabel>
                <div className="space-y-1">
                  {matchingProjects.map((item) => (
                    <Link
                      key={item.id}
                      href={`/app/projects/${item.key.toLowerCase()}/overview`}
                      onClick={() => onOpenChange(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <span className="flex size-6 items-center justify-center rounded-md bg-muted text-[10px] font-semibold">
                        {item.key.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {item.key} · {item.name}
                      </span>
                      {item.id === project.id && (
                        <span className="text-xs text-muted-foreground">
                          {t("search.current")}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </>
            )}

            {showActions && (
              <>
                <SearchGroupLabel className="mt-5">
                  {t("search.actions")}
                </SearchGroupLabel>
                <div className="space-y-1">
                  {showNewTask && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={() => {
                        onOpenChange(false)
                        onCreateTask()
                      }}
                    >
                      <RiAddLine className="size-4 text-muted-foreground" />
                      {t("nav.newTask")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => {
                      onOpenChange(false)
                      onCreateProject()
                    }}
                  >
                    <RiLayoutGridLine className="size-4 text-muted-foreground" />
                    {t("nav.createProject")}
                  </button>
                </div>
              </>
            )}

            {matchingViews.length === 0 &&
              matchingProjects.length === 0 &&
              !showActions && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {t("search.noResults")}
                </p>
              )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SearchGroupLabel({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <p
      className={cn(
        "mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase",
        className
      )}
    >
      {children}
    </p>
  )
}
