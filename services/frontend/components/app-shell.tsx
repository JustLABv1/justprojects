"use client"

import { useState, type ComponentType, type ReactNode } from "react"
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
} from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { Project, User, WorkspaceView } from "@/lib/types"

const navigation: Array<{
  id: WorkspaceView
  label: string
  icon: ComponentType<{ className?: string }>
}> = [
  { id: "overview", label: "Overview", icon: RiLayoutGridLine },
  { id: "tasks", label: "Tasks", icon: RiTaskLine },
  { id: "roadmap", label: "Roadmap", icon: RiRoadMapLine },
  { id: "integrations", label: "Integrations", icon: RiGitRepositoryLine },
  { id: "settings", label: "Project settings", icon: RiSettings3Line },
]

export function AppShell({
  project,
  projects,
  user,
  activeView,
  onViewChange,
  onProjectChange,
  onCreateTask,
  onCreateProject,
  onOpenPublicPage,
  children,
}: {
  project: Project
  projects: Project[]
  user?: User
  activeView: WorkspaceView
  onViewChange: (view: WorkspaceView) => void
  onProjectChange: (projectId: string) => void
  onCreateTask: () => void
  onCreateProject: () => void
  onOpenPublicPage: () => void
  children: ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const goTo = (view: WorkspaceView) => {
    onViewChange(view)
    setSidebarOpen(false)
  }

  return (
    <div className="min-h-svh bg-muted/30 text-foreground">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/20 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 flex w-[248px] -translate-x-full flex-col border-e bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:sticky lg:top-0 lg:h-svh lg:translate-x-0",
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
                Delivery, clearly.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <RiCloseLine aria-hidden="true" />
          </Button>
        </div>

        <div className="border-b p-3">
          <label className="sr-only" htmlFor="workspace-project">
            Current project
          </label>
          <div className="relative">
            <select
              id="workspace-project"
              value={project.id}
              onChange={(event) => onProjectChange(event.target.value)}
              className="h-10 w-full appearance-none rounded-xl border border-sidebar-border bg-sidebar-accent px-3 pe-9 text-start text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.key} · {item.name}
                </option>
              ))}
            </select>
            <RiArrowDownSLine
              className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-sidebar-foreground/60"
              aria-hidden="true"
            />
          </div>
          <div className="mt-3 flex items-center justify-between px-1 text-[11px] text-sidebar-foreground/60">
            <span>Workspace</span>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-sidebar-primary/10 px-2 py-0.5 text-sidebar-primary">
                {project.status}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
                onClick={onCreateProject}
                aria-label="Create project"
              >
                <RiAddLine aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Project navigation">
          <p className="mb-2 px-2 text-[10px] font-semibold tracking-[0.16em] text-sidebar-foreground/45 uppercase">
            Project
          </p>
          {navigation.map((item) => {
            const Icon = item.icon
            const active = item.id === activeView
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => goTo(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  active &&
                    "bg-sidebar-primary/10 font-medium text-sidebar-primary"
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
                {item.id === "integrations" && (
                  <span
                    className="ms-auto size-1.5 rounded-full bg-emerald-500"
                    aria-label="Connected"
                  />
                )}
              </button>
            )
          })}

          <Separator className="my-4 bg-sidebar-border" />
          <button
            type="button"
            onClick={onCreateTask}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <RiAddLine className="size-4" aria-hidden="true" />
            Add task
            <kbd className="ms-auto rounded border border-sidebar-border px-1.5 py-0.5 text-[10px] text-sidebar-foreground/50">
              N
            </kbd>
          </button>
          <button
            type="button"
            onClick={onCreateProject}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <RiLayoutGridLine className="size-4" aria-hidden="true" />
            New project
          </button>
        </nav>

        <div className="border-t p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-sidebar-foreground/60">
            <RiQuestionLine className="size-4" aria-hidden="true" />
            <span>Need a hand?</span>
            <span className="ms-auto text-[10px]">⌘ /</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-sidebar-accent p-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {user?.name
                ?.split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase() ?? "JM"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {user?.name ?? "JustLab member"}
              </p>
              <p className="truncate text-[10px] text-sidebar-foreground/55">
                {user?.email ?? "Local preview"}
              </p>
            </div>
            <RiArrowDownSLine
              className="ms-auto size-4 text-sidebar-foreground/50"
              aria-hidden="true"
            />
          </div>
        </div>
      </aside>

      <div className="lg:-mt-svh min-w-0 lg:ms-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <RiMenuLine aria-hidden="true" />
            </Button>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span>Workspace</span>
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
              <span>Search anything</span>
              <kbd className="ms-4 rounded border bg-background px-1.5 py-0.5 text-[10px]">
                ⌘ K
              </kbd>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Search">
              <RiSearchLine className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open public page"
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
              New task
            </Button>
          </div>
        </header>
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
