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
import { FeedbackNotice } from "@/components/feedback-notice"
import { Progress } from "@/components/ui/progress"
import {
  ApiError,
  customerLogin,
  getPublicPage,
  isApiConfigured,
} from "@/lib/api"
import type { PublicProjectData } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useI18n } from "@/components/language-provider"
import { LanguageSwitcher } from "@/components/language-switcher"

export function PublicProjectPage({
  slug,
  token,
}: {
  slug: string
  token?: string
}) {
  const { locale, t } = useI18n()
  const [payload, setPayload] = useState<PublicProjectData>({
    page: { accessMode: "link" },
    project: { name: "", key: "" },
    tasks: [],
    milestones: [],
  })
  const [loading, setLoading] = useState(isApiConfigured)
  const [error, setError] = useState<string | undefined>(() =>
    isApiConfigured ? undefined : t("auth.apiRequired")
  )
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
          caught instanceof Error ? caught.message : t("public.notAvailable")
        )
      })
      .finally(() => setLoading(false))
  }, [slug, t, token])

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
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Badge variant="outline" className="gap-1.5 bg-background/60">
              <RiLockLine className="size-3" aria-hidden="true" />
              {t("public.readOnlyView")}
            </Badge>
          </div>
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
          <div className="mx-auto mt-20 max-w-md">
            <FeedbackNotice
              kind="error"
              title={t("public.pageUnavailable")}
              message={error}
            />
          </div>
        ) : (
          <>
            <section className="mt-14 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-primary">
                <span className="font-mono">{payload.project.key}</span>
                <span className="text-muted-foreground">/</span>
                <span>{t("public.projectStatus")}</span>
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                {payload.page.title ?? payload.project.name}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
                {payload.project.description ??
                  t("public.transparentDescription")}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <RiCalendarLine className="size-4" aria-hidden="true" />
                  {t("public.target")}{" "}
                  {payload.project.targetDate
                    ? formatDate(payload.project.targetDate, locale)
                    : t("public.dateToConfirm")}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <RiGithubLine className="size-4" aria-hidden="true" />
                  {t("public.providerDelivery", {
                    provider: "GitHub / GitLab",
                  })}
                </span>
              </div>
            </section>
            <section className="mt-10 grid gap-4 sm:grid-cols-[1.3fr_0.7fr]">
              <Card className="gap-5 rounded-3xl border-0 bg-slate-950 p-6 text-white shadow-xl shadow-slate-950/10 sm:p-8 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-white/60">
                      {t("public.overallProgress")}
                    </p>
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
                  {t("public.approvedTasksComplete", {
                    done: completed,
                    total: payload.tasks.length,
                  })}
                </p>
              </Card>
              <Card className="gap-3 rounded-3xl p-6 shadow-none sm:p-8">
                <p className="text-sm text-muted-foreground">
                  {t("public.nextMilestone")}
                </p>
                <p className="text-xl font-semibold tracking-tight">
                  {payload.milestones.find(
                    (milestone) => milestone.status === "open"
                  )?.name ?? t("public.launch")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {payload.milestones.find(
                    (milestone) => milestone.status === "open"
                  )?.dueDate
                    ? t("public.due", {
                        date: formatDate(
                          payload.milestones.find(
                            (milestone) => milestone.status === "open"
                          )!.dueDate!,
                          locale
                        ),
                      })
                    : t("public.dateSoon")}
                </p>
                <div className="mt-auto flex items-center gap-2 text-xs font-medium text-primary">
                  {t("public.seeDeliveryPlan")}{" "}
                  <RiArrowRightLine className="size-3.5" aria-hidden="true" />
                </div>
              </Card>
            </section>
            <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
              <section>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                      {t("public.approvedWork")}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                      {t("public.shipping")}
                    </h2>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t("public.taskCount", { count: payload.tasks.length })}
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
                              {task.statusName ?? t("public.planned")}
                            </Badge>
                            {task.dueDate && (
                              <span>
                                {t("public.due", {
                                  date: formatDate(task.dueDate, locale),
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyPublicState label={t("public.emptyTasks")} />
                  )}
                </div>
              </section>
              <section>
                <div className="mb-4">
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    {t("public.deliveryCheckpoints")}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    {t("public.milestones")}
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
                            ? formatDate(milestone.dueDate, locale)
                            : t("public.dateToConfirm")}
                        </p>
                        {milestone.description && (
                          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                            {milestone.description}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <EmptyPublicState label={t("public.emptyMilestones")} />
                  )}
                </div>
              </section>
            </div>
            <footer className="mt-16 flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>{t("public.sharedSecurely")}</span>
              <span className="inline-flex items-center gap-1.5">
                <RiLockLine className="size-3.5" aria-hidden="true" />
                {t("public.customersNeverEdit")}
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
  const { t } = useI18n()
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
        caught instanceof Error ? caught.message : t("public.notAvailable")
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="mx-auto mt-20 max-w-md rounded-3xl p-6 shadow-sm sm:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          {t("public.privatePage")}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {t("public.signInView")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("public.approvedViewers")}
        </p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="customer-email">{t("login.email")}</Label>
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
          <Label htmlFor="customer-password">{t("login.password")}</Label>
          <Input
            id="customer-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error && <FeedbackNotice kind="error" message={error} />}
        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? t("public.checkingAccess") : t("public.viewStatus")}
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
  const { t } = useI18n()
  return (
    <div
      className="mt-16 space-y-5"
      aria-busy="true"
      aria-label={t("public.loading")}
    >
      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      <div className="h-16 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-44 animate-pulse rounded-3xl bg-muted" />
        <div className="h-44 animate-pulse rounded-3xl bg-muted" />
      </div>
      <p className="sr-only" role="status">
        {t("public.loadingStatus")}
      </p>
    </div>
  )
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
