"use client"

import { useState, type ComponentType, type ReactNode } from "react"
import Link from "next/link"
import {
  RiAddLine,
  RiArrowDownSLine,
  RiCloseLine,
  RiGitRepositoryLine,
  RiLayoutGridLine,
  RiMenuLine,
  RiQuestionLine,
  RiRoadMapLine,
  RiSearchLine,
  RiSettings3Line,
  RiShareBoxLine,
  RiTaskLine,
  RiLogoutBoxRLine,
} from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Separator } from "@/components/ui/separator"
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useI18n } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"
import type { Project, Tenant, User, WorkspaceView } from "@/lib/types"

const navigation: Array<{
  id: WorkspaceView
  label: TranslationKey
  icon: ComponentType<{ className?: string }>
}> = [
  { id: "overview", label: "nav.overview", icon: RiLayoutGridLine },
  { id: "tasks", label: "nav.tasks", icon: RiTaskLine },
  { id: "roadmap", label: "nav.roadmap", icon: RiRoadMapLine },
  { id: "integrations", label: "nav.integrations", icon: RiGitRepositoryLine },
  { id: "settings", label: "nav.settings", icon: RiSettings3Line },
]

export function AppShell({
  project,
  projects,
  user,
  tenant,
  activeView,
  onProjectChange,
  onCreateTask,
  onCreateProject,
  onOpenPublicPage,
  onLogout,
  children,
}: {
  project: Project
  projects: Project[]
  user?: User
  tenant?: Tenant
  activeView: WorkspaceView
  onProjectChange: (projectId: string) => void
  onCreateTask: () => void
  onCreateProject: () => void
  onOpenPublicPage: () => void
  onLogout: () => void
  children: ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { t } = useI18n()

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
          <Select
            value={project.id}
            onValueChange={(projectId) => {
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
              {projects.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.key} · {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-3 flex items-center justify-between px-1 text-[11px] text-sidebar-foreground/60">
            <span className="truncate">
              {tenant?.name ?? t("nav.workspace")}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-sidebar-primary/10 px-2 py-0.5 text-sidebar-primary">
                {project.status === "active"
                  ? t("status.active")
                  : project.status}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
                onClick={onCreateProject}
                aria-label={t("nav.createProject")}
              >
                <RiAddLine aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label={t("nav.project")}>
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

          <Separator className="my-4 bg-sidebar-border" />
          <button
            type="button"
            onClick={onCreateTask}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <RiAddLine className="size-4" aria-hidden="true" />
            {t("nav.addTask")}
            <kbd className="ms-auto rounded border border-sidebar-border px-1.5 py-0.5 text-[10px] text-sidebar-foreground/50">
              N
            </kbd>
          </button>
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
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {tenant?.name ?? t("nav.workspace")}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
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
              <span className="font-medium text-foreground">{project.key}</span>
            </div>
            <div className="min-w-0 sm:hidden">
              <p className="truncate text-sm font-semibold">{project.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground md:flex">
              <RiSearchLine className="size-3.5" aria-hidden="true" />
              <span>{t("nav.searchAnything")}</span>
              <kbd className="ms-4 rounded border bg-background px-1.5 py-0.5 text-[10px]">
                ⌘ K
              </kbd>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("nav.searchAnything")}
            >
              <RiSearchLine className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("nav.openPublicPage")}
              onClick={onOpenPublicPage}
            >
              <RiShareBoxLine className="size-4" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              className="hidden gap-1.5 sm:inline-flex"
              onClick={onCreateTask}
            >
              <RiAddLine className="size-4" aria-hidden="true" />
              {t("nav.newTask")}
            </Button>
            <LanguageSwitcher className="min-w-0 px-1.5 py-1 md:px-2" />
          </div>
        </header>
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
