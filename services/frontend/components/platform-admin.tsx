"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  RiCheckLine,
  RiFolder3Line,
  RiLoader4Line,
  RiLockLine,
  RiPauseCircleLine,
  RiPlayCircleLine,
  RiRefreshLine,
  RiSearchLine,
  RiShieldKeyholeLine,
  RiTimeLine,
  RiUser3Line,
  RiUserForbidLine,
} from "@remixicon/react"

import { AppShell } from "@/components/app-shell"
import { FeedbackNotice } from "@/components/feedback-notice"
import { useI18n } from "@/components/language-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ApiError,
  getPlatformOverview,
  getSession,
  isApiConfigured,
  listProjects,
  listPlatformProjects,
  listPlatformUsers,
  logout,
  revokePlatformUserSessions,
  updatePlatformProject,
  updatePlatformSettings,
  updatePlatformUser,
} from "@/lib/api"
import type {
  PlatformProjectSummary,
  PlatformSettings,
  PlatformStats,
  PlatformUserSummary,
  Project,
  Session,
} from "@/lib/types"

type SavingKey = "login" | "signup" | string

export function PlatformAdminPage() {
  const router = useRouter()
  const { locale, t } = useI18n()
  const [stats, setStats] = useState<PlatformStats>()
  const [settings, setSettings] = useState<PlatformSettings>()
  const [users, setUsers] = useState<PlatformUserSummary[]>([])
  const [projects, setProjects] = useState<PlatformProjectSummary[]>([])
  const [shellProjects, setShellProjects] = useState<Project[]>([])
  const [session, setSession] = useState<Session>()
  const [currentUserId, setCurrentUserId] = useState<string>()
  const [userQuery, setUserQuery] = useState("")
  const [projectQuery, setProjectQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<SavingKey>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const load = useCallback(async () => {
    if (!isApiConfigured) {
      setLoading(false)
      setError(t("auth.apiRequired"))
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      const nextSession = await getSession()
      setSession(nextSession)
      setCurrentUserId(nextSession.user.id)
      const [overview, userResult, projectResult, shellProjectResult] =
        await Promise.all([
          getPlatformOverview(),
          listPlatformUsers(),
          listPlatformProjects(),
          listProjects(),
        ])
      setStats(overview.stats)
      setSettings(overview.settings)
      setUsers(userResult.items ?? [])
      setProjects(projectResult.items ?? [])
      setShellProjects(shellProjectResult.items ?? [])
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace("/login?next=%2Fapp%2Fadmin")
        return
      }
      if (caught instanceof ApiError && caught.status === 403) {
        router.replace("/app")
        return
      }
      setError(caught instanceof Error ? caught.message : t("admin.loadError"))
    } finally {
      setLoading(false)
    }
  }, [router, t])

  useEffect(() => {
    // Platform controls are loaded only after the browser session is available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const filteredUsers = useMemo(() => {
    const normalized = userQuery.trim().toLowerCase()
    if (!normalized) return users
    return users.filter((user) =>
      `${user.name} ${user.email}`.toLowerCase().includes(normalized)
    )
  }, [userQuery, users])

  const filteredProjects = useMemo(() => {
    const normalized = projectQuery.trim().toLowerCase()
    if (!normalized) return projects
    return projects.filter((project) =>
      `${project.name} ${project.key} ${project.tenantName}`
        .toLowerCase()
        .includes(normalized)
    )
  }, [projectQuery, projects])

  const saveSetting = async (
    field: "loginEnabled" | "signupEnabled",
    value: boolean
  ) => {
    setSaving(field === "loginEnabled" ? "login" : "signup")
    setError(undefined)
    try {
      const updated = await updatePlatformSettings({ [field]: value })
      setSettings(updated)
      setNotice(t("admin.saved"))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("admin.saveError"))
    } finally {
      setSaving(undefined)
    }
  }

  const saveUser = async (
    user: PlatformUserSummary,
    input: Partial<{ platformAdmin: boolean; suspended: boolean }>,
    action: string
  ) => {
    setSaving(`user:${user.id}:${action}`)
    setError(undefined)
    try {
      const updated = await updatePlatformUser(user.id, input)
      const nextSuspended =
        updated.suspended ?? input.suspended ?? user.suspended
      const sessionsRevoked =
        nextSuspended && !user.suspended ? user.activeSessions : 0
      setUsers((current) =>
        current.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                ...updated,
                ...(nextSuspended ? { activeSessions: 0 } : {}),
              }
            : item
        )
      )
      if (nextSuspended !== user.suspended || sessionsRevoked > 0) {
        setStats((current) =>
          current
            ? {
                ...current,
                activeUsers: Math.max(
                  0,
                  current.activeUsers + (nextSuspended ? -1 : 1)
                ),
                suspendedUsers: Math.max(
                  0,
                  current.suspendedUsers + (nextSuspended ? 1 : -1)
                ),
                activeSessions: Math.max(
                  0,
                  current.activeSessions - sessionsRevoked
                ),
              }
            : current
        )
      }
      setNotice(t("admin.actionSaved"))
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("admin.actionError")
      )
    } finally {
      setSaving(undefined)
    }
  }

  const revokeSessions = async (user: PlatformUserSummary) => {
    setSaving(`sessions:${user.id}`)
    setError(undefined)
    try {
      const result = await revokePlatformUserSessions(user.id)
      const revokedActive = Math.min(result.revoked, user.activeSessions)
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id ? { ...item, activeSessions: 0 } : item
        )
      )
      setStats((current) =>
        current
          ? {
              ...current,
              activeSessions: Math.max(
                0,
                current.activeSessions - revokedActive
              ),
            }
          : current
      )
      setNotice(t("admin.sessionsRevoked", { count: result.revoked }))
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("admin.actionError")
      )
    } finally {
      setSaving(undefined)
    }
  }

  const saveProject = async (
    project: PlatformProjectSummary,
    value: "active" | "paused" | "archived"
  ) => {
    setSaving(`project:${project.id}`)
    setError(undefined)
    try {
      const updated = await updatePlatformProject(project.id, value)
      setProjects((current) =>
        current.map((item) =>
          item.id === project.id ? { ...item, ...updated, status: value } : item
        )
      )
      setNotice(t("admin.actionSaved"))
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("admin.actionError")
      )
    } finally {
      setSaving(undefined)
    }
  }

  if (loading && !stats) {
    return (
      <main className="grid min-h-svh place-items-center bg-background px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
          {t("admin.loading")}
        </div>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-svh max-w-xl items-center px-6">
        {error ? (
          <FeedbackNotice
            kind="error"
            message={error}
            retry={() => void load()}
          />
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
            {t("admin.loading")}
          </div>
        )}
      </main>
    )
  }

  const statCards = stats
    ? [
        { label: t("admin.users"), value: stats.users, icon: RiUser3Line },
        {
          label: t("admin.activeUsers"),
          value: stats.activeUsers,
          icon: RiCheckLine,
        },
        {
          label: t("admin.workspaces"),
          value: stats.workspaces,
          icon: RiFolder3Line,
        },
        {
          label: t("admin.projects"),
          value: stats.projects,
          icon: RiFolder3Line,
        },
        { label: t("admin.tasks"), value: stats.tasks, icon: RiCheckLine },
        {
          label: t("admin.activeSessions"),
          value: stats.activeSessions,
          icon: RiTimeLine,
        },
        {
          label: t("admin.recentSignups"),
          value: stats.recentSignups,
          icon: RiUser3Line,
        },
        {
          label: t("admin.recentProjects"),
          value: stats.recentProjects,
          icon: RiFolder3Line,
        },
      ]
    : []

  const shellProject = shellProjects[0]
  const openProject = (projectId: string) => {
    const nextProject = shellProjects.find((item) => item.id === projectId)
    if (nextProject) {
      router.push(`/app/projects/${nextProject.key.toLowerCase()}/overview`)
    }
  }
  const handleLogout = async () => {
    await logout().catch(() => undefined)
    router.replace("/login")
  }

  const content = (
    <div className="mx-auto max-w-[1500px] space-y-8">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <RiShieldKeyholeLine className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("admin.title")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("admin.description")}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-fit gap-1.5"
          aria-label={t("admin.refresh")}
          onClick={() => void load()}
          disabled={loading}
        >
          <RiRefreshLine
            className={loading ? "size-3.5 animate-spin" : "size-3.5"}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">{t("admin.refresh")}</span>
        </Button>
      </header>

      {error && (
        <FeedbackNotice
          kind="error"
          message={error}
          retry={() => void load()}
        />
      )}
      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3.5 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <span>{notice}</span>
          <button
            type="button"
            className="text-xs underline underline-offset-4"
            onClick={() => setNotice(undefined)}
          >
            {t("feedback.dismiss")}
          </button>
        </div>
      )}

      <section aria-labelledby="admin-stats-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            id="admin-stats-heading"
            className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase"
          >
            {t("admin.stats")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {settings?.oidcEnabled
              ? `${t("admin.oidc")}: ${t("admin.configured")}`
              : `${t("admin.oidc")}: ${t("admin.notConfigured")}`}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {statCards.map(({ label, value, icon: Icon }) => (
            <Card key={label} className="rounded-2xl p-4 shadow-none">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight">
                {value}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {settings && (
        <Card className="rounded-3xl p-5 shadow-none sm:p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <h2 className="font-semibold tracking-tight">
                {t("admin.access")}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {t("admin.accessDescription")}
              </p>
            </div>
            <Badge variant="outline" className="w-fit gap-1.5">
              <RiLockLine className="size-3" aria-hidden="true" />
              {settings.oidcEnabled
                ? `${t("admin.oidc")}: ${t("admin.configured")}`
                : `${t("admin.oidc")}: ${t("admin.notConfigured")}`}
            </Badge>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <AccessToggle
              label={t("admin.login")}
              enabled={settings.loginEnabled}
              saving={saving === "login"}
              onChange={(value) => void saveSetting("loginEnabled", value)}
              enabledLabel={t("admin.enabled")}
              disabledLabel={t("admin.disabled")}
            />
            <AccessToggle
              label={t("admin.signup")}
              enabled={settings.signupEnabled}
              saving={saving === "signup"}
              onChange={(value) => void saveSetting("signupEnabled", value)}
              enabledLabel={t("admin.enabled")}
              disabledLabel={t("admin.disabled")}
            />
          </div>
        </Card>
      )}

      <section className="space-y-4" aria-labelledby="admin-users-heading">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2
              id="admin-users-heading"
              className="text-xl font-semibold tracking-tight"
            >
              {t("admin.directory")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("admin.directoryDescription")}
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <RiSearchLine
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={userQuery}
              onChange={(event) => setUserQuery(event.target.value)}
              placeholder={t("admin.searchUsers")}
              aria-label={t("admin.searchUsers")}
              className="h-9 ps-9"
            />
          </div>
        </div>
        <Card className="overflow-hidden rounded-3xl shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">{t("admin.user")}</th>
                  <th className="px-4 py-3 font-medium">
                    {t("admin.workspacesShort")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("admin.sessions")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("admin.lastActive")}
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    {t("admin.status")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filteredUsers.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelf={user.id === currentUserId}
                    saving={saving}
                    locale={locale}
                    onUpdate={saveUser}
                    onRevoke={revokeSessions}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {filteredUsers.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {t("admin.noUsers")}
            </p>
          )}
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="admin-projects-heading">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2
              id="admin-projects-heading"
              className="text-xl font-semibold tracking-tight"
            >
              {t("admin.projectDirectory")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("admin.projectDirectoryDescription")}
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <RiSearchLine
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
              placeholder={t("admin.searchProjects")}
              aria-label={t("admin.searchProjects")}
              className="h-9 ps-9"
            />
          </div>
        </div>
        <Card className="overflow-hidden rounded-3xl shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">
                    {t("admin.project")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("admin.workspace")}
                  </th>
                  <th className="px-4 py-3 font-medium">{t("admin.owner")}</th>
                  <th className="px-4 py-3 font-medium">
                    {t("admin.progress")}
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    {t("admin.status")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filteredProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    saving={saving === `project:${project.id}`}
                    onChange={saveProject}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {filteredProjects.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {t("admin.noProjects")}
            </p>
          )}
        </Card>
      </section>
    </div>
  )

  return (
    <AppShell
      project={shellProject}
      projects={shellProjects}
      user={session.user}
      tenant={session.tenant}
      activeView="admin"
      apiConnected={isApiConfigured}
      onProjectChange={openProject}
      onCreateTask={() => undefined}
      onCreateProject={() => router.push("/app")}
      onLogout={() => void handleLogout()}
      showNewTask={false}
      platformAdmin={session.platformAdmin ?? session.user.platformAdmin}
    >
      {content}
    </AppShell>
  )
}

function AccessToggle({
  label,
  enabled,
  saving,
  onChange,
  enabledLabel,
  disabledLabel,
}: {
  label: string
  enabled: boolean
  saving: boolean
  onChange: (value: boolean) => void
  enabledLabel: string
  disabledLabel: string
}) {
  return (
    <Button
      type="button"
      variant="outline"
      aria-pressed={enabled}
      disabled={saving}
      onClick={() => onChange(!enabled)}
      className="h-auto justify-between rounded-2xl px-4 py-3 text-left"
    >
      <span className="flex items-center gap-3">
        <span
          className={`flex size-8 items-center justify-center rounded-xl ${enabled ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}
        >
          {saving ? (
            <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
          ) : enabled ? (
            <RiCheckLine className="size-4" aria-hidden="true" />
          ) : (
            <RiLockLine className="size-4" aria-hidden="true" />
          )}
        </span>
        <span>
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-xs text-muted-foreground">
            {enabled ? enabledLabel : disabledLabel}
          </span>
        </span>
      </span>
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </span>
    </Button>
  )
}

function UserRow({
  user,
  isSelf,
  saving,
  locale,
  onUpdate,
  onRevoke,
  t,
}: {
  user: PlatformUserSummary
  isSelf: boolean
  saving?: string
  locale: "en" | "de"
  onUpdate: (
    user: PlatformUserSummary,
    input: Partial<{ platformAdmin: boolean; suspended: boolean }>,
    action: string
  ) => void
  onRevoke: (user: PlatformUserSummary) => void
  t: (
    key: import("@/lib/i18n").TranslationKey,
    values?: Record<string, string | number>
  ) => string
}) {
  const userAction = (action: string) => saving === `user:${user.id}:${action}`
  return (
    <tr className="align-top">
      <td className="px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {user.name
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{user.name}</span>
              {isSelf && (
                <Badge variant="secondary" className="text-[10px]">
                  {t("admin.self")}
                </Badge>
              )}
              {user.platformAdmin && (
                <Badge className="gap-1 text-[10px]">
                  <RiShieldKeyholeLine className="size-3" />
                  {t("admin.platformAdmin")}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-muted-foreground">
        <span className="font-medium text-foreground">{user.tenantCount}</span>
        <span className="ms-1 text-xs">
          · {user.projectCount} {t("admin.projects").toLowerCase()}
        </span>
      </td>
      <td className="px-4 py-4 text-muted-foreground">{user.activeSessions}</td>
      <td className="px-4 py-4 text-xs text-muted-foreground">
        {formatAdminDate(user.lastActiveAt, locale, t("admin.never"))}
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-col items-end gap-2">
          <Badge
            variant={user.suspended ? "destructive" : "outline"}
            className="text-[10px]"
          >
            {user.suspended ? t("admin.suspended") : t("admin.active")}
          </Badge>
          {!isSelf && (
            <div className="flex flex-wrap justify-end gap-1.5">
              <Button
                variant="outline"
                size="xs"
                onClick={() =>
                  onUpdate(
                    user,
                    { platformAdmin: !user.platformAdmin },
                    "admin"
                  )
                }
                disabled={Boolean(saving)}
                className="gap-1"
              >
                {userAction("admin") && (
                  <RiLoader4Line className="size-3 animate-spin" />
                )}
                {user.platformAdmin
                  ? t("admin.removeAdmin")
                  : t("admin.makeAdmin")}
              </Button>
              <Button
                variant={user.suspended ? "outline" : "destructive"}
                size="xs"
                onClick={() =>
                  onUpdate(user, { suspended: !user.suspended }, "suspend")
                }
                disabled={Boolean(saving)}
                className="gap-1"
              >
                {userAction("suspend") ? (
                  <RiLoader4Line className="size-3 animate-spin" />
                ) : user.suspended ? (
                  <RiPlayCircleLine className="size-3" />
                ) : (
                  <RiPauseCircleLine className="size-3" />
                )}
                {user.suspended ? t("admin.reactivate") : t("admin.suspend")}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onRevoke(user)}
                disabled={Boolean(saving)}
                className="gap-1 text-muted-foreground"
              >
                {saving === `sessions:${user.id}` ? (
                  <RiLoader4Line className="size-3 animate-spin" />
                ) : (
                  <RiUserForbidLine className="size-3" />
                )}
                {t("admin.revokeSessions")}
              </Button>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

function ProjectRow({
  project,
  saving,
  onChange,
  t,
}: {
  project: PlatformProjectSummary
  saving: boolean
  onChange: (
    project: PlatformProjectSummary,
    value: "active" | "paused" | "archived"
  ) => void
  t: (key: import("@/lib/i18n").TranslationKey) => string
}) {
  const progress = project.taskCount
    ? Math.round((project.completedTasks / project.taskCount) * 100)
    : 0
  return (
    <tr className="align-top">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-[10px] font-semibold">
            {project.key.slice(0, 3)}
          </span>
          <div className="min-w-0">
            <span className="block truncate font-medium">{project.name}</span>
            <span className="block text-xs text-muted-foreground">
              {project.key}
            </span>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-muted-foreground">
        {project.tenantName}
      </td>
      <td className="px-4 py-4 text-sm text-muted-foreground">
        {project.createdByName}
      </td>
      <td className="px-4 py-4">
        <span className="font-medium">{progress}%</span>
        <span className="ms-1 text-xs text-muted-foreground">
          ({project.completedTasks}/{project.taskCount})
        </span>
      </td>
      <td className="px-5 py-4">
        <div className="flex justify-end">
          <Select
            value={project.status}
            onValueChange={(value) => {
              if (
                value === "active" ||
                value === "paused" ||
                value === "archived"
              )
                onChange(project, value)
            }}
            disabled={saving}
          >
            <SelectTrigger size="sm" className="min-w-28">
              <SelectValue>{projectStatusLabel(project.status, t)}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="active">
                <RiPlayCircleLine />
                {t("admin.statusActive")}
              </SelectItem>
              <SelectItem value="paused">
                <RiPauseCircleLine />
                {t("admin.statusPaused")}
              </SelectItem>
              <SelectItem value="archived">
                <RiFolder3Line />
                {t("admin.statusArchived")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </td>
    </tr>
  )
}

function projectStatusLabel(
  status: string,
  t: (key: import("@/lib/i18n").TranslationKey) => string
) {
  if (status === "paused") return t("admin.statusPaused")
  if (status === "archived") return t("admin.statusArchived")
  return t("admin.statusActive")
}

function formatAdminDate(
  value: string | null | undefined,
  locale: "en" | "de",
  fallback: string
) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", {
    dateStyle: "medium",
  }).format(date)
}
