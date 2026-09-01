"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import Link from "next/link"
import {
  RiArrowRightLine,
  RiCalendarLine,
  RiCheckLine,
  RiFlagLine,
  RiGithubLine,
  RiLockLine,
  RiShareBoxLine,
} from "@remixicon/react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  ApiError,
  customerLogin,
  getPublicPage,
  isApiConfigured,
} from "@/lib/api"
import { demoMilestones, demoProject, demoTasks } from "@/lib/demo-data"
import type { PublicProjectData } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function PublicProjectPage({
  slug,
  token,
}: {
  slug: string
  token?: string
}) {
  const [payload, setPayload] = useState<PublicProjectData>(() => ({
    page: { title: `${demoProject.name} · Project status`, accessMode: "link" },
    project: {
      name: demoProject.name,
      key: demoProject.key,
      description: demoProject.description,
      targetDate: demoProject.targetDate,
    },
    tasks: demoTasks
      .filter((task) => task.visibility === "customer")
      .map((task) => ({
        id: task.id,
        parentId: task.parentId,
        milestoneId: task.milestoneId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        statusName: task.statusName,
        statusCategory: task.statusCategory,
        estimateMinutes: task.estimateMinutes,
      })),
    milestones: demoMilestones
      .filter((milestone) => milestone.visibility === "customer")
      .map((milestone) => ({
        id: milestone.id,
        name: milestone.name,
        description: milestone.description,
        startDate: milestone.startDate,
        dueDate: milestone.dueDate,
        status: milestone.status,
      })),
  }))
  const [loading, setLoading] = useState(isApiConfigured)
  const [error, setError] = useState<string>()
  const [authRequired, setAuthRequired] = useState(false)

  useEffect(() => {
    if (!isApiConfigured) return
    void getPublicPage(slug, token)
      .then(setPayload)
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 401) {
          setAuthRequired(true)
          return
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "This page is not available."
        )
      })
      .finally(() => setLoading(false))
  }, [slug, token])

  const completed = useMemo(
    () => payload.tasks.filter((task) => task.statusCategory === "done").length,
    [payload.tasks]
  )
  const progress = payload.tasks.length
    ? Math.round((completed / payload.tasks.length) * 100)
    : 0

  return (
    <main className="min-h-svh bg-[#f7f8fb] text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <RiShareBoxLine className="size-4" aria-hidden="true" />
            </span>
            JustProjects
          </Link>
          <Badge variant="outline" className="gap-1.5 bg-background/60">
            <RiLockLine className="size-3" aria-hidden="true" />
            Read-only project view
          </Badge>
        </header>
        {loading ? (
          <PublicLoading />
        ) : authRequired ? (
          <CustomerAccessForm
            slug={slug}
            onAuthenticated={(nextPayload) => {
              setPayload(nextPayload)
              setAuthRequired(false)
            }}
          />
        ) : error ? (
          <div
            role="alert"
            className="mx-auto mt-20 max-w-md rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 text-center"
          >
            <h1 className="font-medium">This project page is unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : (
          <>
            <section className="mt-14 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-primary">
                <span className="font-mono">{payload.project.key}</span>
                <span className="text-muted-foreground">/</span>
                <span>Project status</span>
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                {payload.page.title ?? payload.project.name}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
                {payload.project.description ??
                  "A transparent view of what is moving, what is next, and when to expect it."}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <RiCalendarLine className="size-4" aria-hidden="true" />
                  Target{" "}
                  {payload.project.targetDate
                    ? formatDate(payload.project.targetDate)
                    : "date to be confirmed"}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <RiGithubLine className="size-4" aria-hidden="true" />
                  GitHub-connected delivery
                </span>
              </div>
            </section>
            <section className="mt-10 grid gap-4 sm:grid-cols-[1.3fr_0.7fr]">
              <Card className="gap-5 rounded-3xl border-0 bg-slate-950 p-6 text-white shadow-xl shadow-slate-950/10 sm:p-8 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-white/60">Overall progress</p>
                    <p className="mt-2 text-4xl font-semibold tracking-tight">
                      {progress}%
                    </p>
                  </div>
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-white/10">
                    <RiCheckLine
                      className="size-5 text-emerald-300"
                      aria-hidden="true"
                    />
                  </span>
                </div>
                <Progress
                  value={progress}
                  aria-label={`${progress}% complete`}
                  className="h-2 bg-white/15 [&_[data-slot=progress-indicator]]:bg-emerald-400"
                />
                <p className="text-sm text-white/60">
                  {completed} of {payload.tasks.length} approved tasks complete
                </p>
              </Card>
              <Card className="gap-3 rounded-3xl p-6 shadow-none sm:p-8">
                <p className="text-sm text-muted-foreground">Next milestone</p>
                <p className="text-xl font-semibold tracking-tight">
                  {payload.milestones.find(
                    (milestone) => milestone.status === "open"
                  )?.name ?? "Launch"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {payload.milestones.find(
                    (milestone) => milestone.status === "open"
                  )?.dueDate
                    ? `Due ${formatDate(payload.milestones.find((milestone) => milestone.status === "open")!.dueDate!)}`
                    : "We will share the date soon."}
                </p>
                <div className="mt-auto flex items-center gap-2 text-xs font-medium text-primary">
                  See delivery plan{" "}
                  <RiArrowRightLine className="size-3.5" aria-hidden="true" />
                </div>
              </Card>
            </section>
            <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
              <section>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                      Approved work
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                      What we&apos;re shipping
                    </h2>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {payload.tasks.length} tasks
                  </span>
                </div>
                <div className="space-y-2">
                  {payload.tasks.length ? (
                    payload.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 rounded-2xl border bg-background p-4 shadow-sm shadow-slate-950/[0.02]"
                      >
                        <span
                          className={`mt-1 flex size-6 shrink-0 items-center justify-center rounded-full ${task.statusCategory === "done" ? "bg-emerald-500/10 text-emerald-600" : task.statusCategory === "blocked" ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"}`}
                        >
                          {task.statusCategory === "done" ? (
                            <RiCheckLine
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <span
                              className="size-1.5 rounded-full bg-current"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{task.title}</p>
                          {task.description && (
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                              {task.description}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge
                              variant="outline"
                              className="h-5 text-[10px]"
                            >
                              {task.statusName ?? "Planned"}
                            </Badge>
                            {task.dueDate && (
                              <span>Due {formatDate(task.dueDate)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyPublicState label="Approved tasks will appear here as the plan becomes ready." />
                  )}
                </div>
              </section>
              <section>
                <div className="mb-4">
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    Delivery checkpoints
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Milestones
                  </h2>
                </div>
                <div className="space-y-3">
                  {payload.milestones.length ? (
                    payload.milestones.map((milestone) => (
                      <div
                        key={milestone.id}
                        className="relative rounded-2xl border bg-background p-4 ps-11 shadow-sm shadow-slate-950/[0.02]"
                      >
                        <span
                          className={`absolute start-4 top-5 flex size-5 items-center justify-center rounded-full ${milestone.status === "closed" ? "bg-emerald-500 text-white" : "border-2 border-primary bg-background text-primary"}`}
                        >
                          {milestone.status === "closed" ? (
                            <RiCheckLine
                              className="size-3"
                              aria-hidden="true"
                            />
                          ) : (
                            <RiFlagLine
                              className="size-2.5"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <p className="font-medium">{milestone.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {milestone.dueDate
                            ? formatDate(milestone.dueDate)
                            : "Date to be confirmed"}
                        </p>
                        {milestone.description && (
                          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                            {milestone.description}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <EmptyPublicState label="Milestones will appear here when they are approved for sharing." />
                  )}
                </div>
              </section>
            </div>
            <footer className="mt-16 flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Shared securely via JustProjects</span>
              <span className="inline-flex items-center gap-1.5">
                <RiLockLine className="size-3.5" aria-hidden="true" />
                Customers can view, never edit
              </span>
            </footer>
          </>
        )}
      </div>
    </main>
  )
}

function CustomerAccessForm({
  slug,
  onAuthenticated,
}: {
  slug: string
  onAuthenticated: (payload: PublicProjectData) => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    setLoading(true)
    try {
      await customerLogin(slug, { email, password })
      onAuthenticated(await getPublicPage(slug))
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not verify access."
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="mx-auto mt-20 max-w-md rounded-3xl p-6 shadow-sm sm:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          Private customer page
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Sign in to view this project
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This page is limited to approved customer viewers. Access is
          read-only.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="customer-email">Email</Label>
          <Input
            id="customer-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-password">Password</Label>
          <Input
            id="customer-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        )}
        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Checking access…" : "View project status"}
        </Button>
      </form>
    </Card>
  )
}

function EmptyPublicState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-background p-6 text-sm text-muted-foreground">
      {label}
    </div>
  )
}
function PublicLoading() {
  return (
    <div
      className="mt-16 space-y-5"
      aria-busy="true"
      aria-label="Loading public project"
    >
      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      <div className="h-16 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-44 animate-pulse rounded-3xl bg-muted" />
        <div className="h-44 animate-pulse rounded-3xl bg-muted" />
      </div>
      <p className="sr-only" role="status">
        Loading project status
      </p>
    </div>
  )
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
