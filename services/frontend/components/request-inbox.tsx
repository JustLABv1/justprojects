"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  RiArrowRightUpLine,
  RiCheckboxCircleLine,
  RiInboxArchiveLine,
  RiLoader4Line,
  RiSearchLine,
} from "@remixicon/react"

import { FeedbackNotice } from "@/components/feedback-notice"
import { AppShell } from "@/components/app-shell"
import { useI18n } from "@/components/language-provider"
import {
  ApiError,
  convertProjectRequest,
  getSession,
  isApiConfigured,
  listProjectRequests,
  listProjects,
  listTenantMembers,
  logout,
  updateProjectRequest,
} from "@/lib/api"
import type {
  Project,
  ProjectRequest,
  ProjectRequestStatus,
  Session,
  TenantMember,
} from "@/lib/types"
import type { TranslationKey } from "@/lib/i18n"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

const statuses: ProjectRequestStatus[] = [
  "submitted",
  "in_review",
  "needs_info",
  "approved",
  "rejected",
  "converted",
  "cancelled",
]

export function RequestInbox() {
  const router = useRouter()
  const { t, locale } = useI18n()
  const [requests, setRequests] = useState<ProjectRequest[]>([])
  const [members, setMembers] = useState<TenantMember[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [session, setSession] = useState<Session>()
  const [selected, setSelected] = useState<ProjectRequest | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<ProjectRequestStatus>("submitted")
  const [assignee, setAssignee] = useState("")
  const [internalNotes, setInternalNotes] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    if (!isApiConfigured) return
    setLoading(true)
    setError(undefined)
    try {
      const nextSession = await getSession()
      setSession(nextSession)
      const [requestResult, memberResult, projectResult] = await Promise.all([
        listProjectRequests(),
        listTenantMembers(),
        listProjects(),
      ])
      setRequests(requestResult.items ?? [])
      setMembers(memberResult.members ?? [])
      setProjects(projectResult.items ?? [])
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace("/login?next=%2Fapp%2Frequests")
        return
      }
      setError(caught instanceof Error ? caught.message : t("requests.loadError"))
    } finally {
      setLoading(false)
    }
  }, [router, t])

  useEffect(() => {
    // Load the request inbox after the client-side session is available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load, router, t])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return requests.filter((request) => {
      if (statusFilter !== "all" && request.status !== statusFilter) return false
      if (!normalized) return true
      return `${request.title} ${request.description} ${request.requesterName} ${request.requesterEmail}`.toLowerCase().includes(normalized)
    })
  }, [query, requests, statusFilter])

  const selectRequest = (request: ProjectRequest) => {
    setSelected(request)
    setStatus(request.status)
    setAssignee(request.assignedTo ?? "")
    setInternalNotes(request.internalNotes ?? "")
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    setError(undefined)
    try {
      const result = await updateProjectRequest(selected.id, {
        status,
        assignedTo: assignee || null,
        internalNotes,
      })
      setRequests((current) => current.map((request) => request.id === selected.id ? result.request : request))
      setSelected(result.request)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("requests.statusError"))
    } finally {
      setSaving(false)
    }
  }

  const convert = async () => {
    if (!selected) return
    setSaving(true)
    setError(undefined)
    try {
      const result = await convertProjectRequest(selected.id, {
        name: selected.title,
        description: selected.description,
        targetDate: selected.requestedTargetDate ?? null,
      })
      setRequests((current) => current.map((request) => request.id === selected.id ? result.request : request))
      setSelected(result.request)
      router.push(`/app/projects/${result.project.key.toLowerCase()}/overview`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("requests.convertError"))
    } finally {
      setSaving(false)
    }
  }

  const shellProject = projects[0]
  const openProject = (projectId: string) => {
    const nextProject = projects.find((project) => project.id === projectId)
    if (nextProject) router.push(`/app/projects/${nextProject.key.toLowerCase()}/overview`)
  }
  const handleLogout = async () => {
    await logout().catch(() => undefined)
    router.replace("/login")
  }

  const inbox = (
    <div className="min-h-svh">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-primary">
              <RiInboxArchiveLine className="size-4" aria-hidden="true" />
              {t("nav.requests")}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">{t("requests.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("requests.description")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/app")}>{t("nav.portfolio")}</Button>
          </div>
        </header>

        {error && <FeedbackNotice kind="error" message={error} retry={() => void load()} />}
        <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <RiSearchLine className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("requests.search")} className="ps-9" />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "all")}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue>{statusFilter === "all" ? t("requests.allStatuses") : statusLabel(statusFilter, t)}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("requests.allStatuses")}</SelectItem>
              {statuses.map((item) => <SelectItem key={item} value={item}>{statusLabel(item, t)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><RiLoader4Line className="size-4 animate-spin" />{t("portfolio.loading")}</div>
        ) : filtered.length ? (
          <div className="space-y-3">
            {filtered.map((request) => (
              <button key={request.id} type="button" className="block w-full text-left" onClick={() => selectRequest(request)}>
                <Card className="rounded-2xl p-4 shadow-none transition hover:border-primary/40 hover:bg-primary/[0.02] sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><RiInboxArchiveLine className="size-4" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-medium">{request.title}</h2>
                        <Badge variant="outline">{statusLabel(request.status, t)}</Badge>
                        <Badge variant={request.priority === "urgent" ? "destructive" : "secondary"}>{priorityLabel(request.priority, t)}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{request.description}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{t("requests.requester")}: {request.requesterName} · {request.requesterEmail}</span>
                        <span>{formatDate(request.createdAt, locale)}</span>
                        {assigneeLabel(request, members) && <span>{t("requests.assignee")}: {assigneeLabel(request, members)}</span>}
                      </div>
                    </div>
                    <RiArrowRightUpLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </div>
                </Card>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed bg-background p-12 text-center text-sm text-muted-foreground">{t("requests.empty")}</div>
        )}
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>{selected.title}</SheetTitle>
                <SheetDescription>{t("requests.requestDetails")}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 p-4">
                <div className="rounded-2xl bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">{selected.description}</div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><p className="text-xs text-muted-foreground">{t("requests.requester")}</p><p className="mt-1 font-medium">{selected.requesterName}</p><p className="text-xs text-muted-foreground">{selected.requesterEmail}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("requests.priority")}</p><p className="mt-1 font-medium">{priorityLabel(selected.priority, t)}</p></div>
                  {selected.requestedStartDate && <div><p className="text-xs text-muted-foreground">{t("public.requestedStartDate")}</p><p className="mt-1 font-medium">{formatDate(selected.requestedStartDate, locale)}</p></div>}
                  {selected.requestedTargetDate && <div><p className="text-xs text-muted-foreground">{t("public.requestedTargetDate")}</p><p className="mt-1 font-medium">{formatDate(selected.requestedTargetDate, locale)}</p></div>}
                </div>
                <div className="space-y-2"><label className="text-xs font-medium" htmlFor="request-status">{t("requests.status")}</label><Select value={status} onValueChange={(value) => setStatus((value ?? "submitted") as ProjectRequestStatus)}><SelectTrigger id="request-status" className="w-full"><SelectValue>{statusLabel(status, t)}</SelectValue></SelectTrigger><SelectContent>{statuses.map((item) => <SelectItem key={item} value={item}>{statusLabel(item, t)}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><label className="text-xs font-medium" htmlFor="request-assignee">{t("requests.assignee")}</label><Select value={assignee || "none"} onValueChange={(value) => setAssignee(value === "none" ? "" : value ?? "")}><SelectTrigger id="request-assignee" className="w-full"><SelectValue>{members.find((member) => member.user.id === assignee)?.user.name ?? t("requests.unassigned")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">{t("requests.unassigned")}</SelectItem>{members.map((member) => <SelectItem key={member.user.id} value={member.user.id}>{member.user.name} · {member.user.email}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><label className="text-xs font-medium" htmlFor="request-notes">{t("requests.internalNotes")}</label><Textarea id="request-notes" value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} rows={4} placeholder={t("requests.internalNotes")} /></div>
                {selected.convertedProjectId && <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300"><RiCheckboxCircleLine className="size-4" />{t("requests.convertedProject")}</div>}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void save()} disabled={saving} className="gap-1.5">{saving && <RiLoader4Line className="size-4 animate-spin" />}{t("requests.save")}</Button>
                  {!selected.convertedProjectId && <Button variant="outline" onClick={() => void convert()} disabled={saving} className="gap-1.5"><RiArrowRightUpLine className="size-3.5" />{t("requests.convert")}</Button>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )

  if (!session || !shellProject) return <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{inbox}</main>

  return (
    <AppShell
      project={shellProject}
      projects={projects}
      user={session.user}
      tenant={session.tenant}
      activeView="requests"
      apiConnected={isApiConfigured}
      onProjectChange={openProject}
      onCreateTask={() => undefined}
      onCreateProject={() => router.push("/app")}
      onLogout={() => void handleLogout()}
      showNewTask={false}
      platformAdmin={session.platformAdmin}
    >
      {inbox}
    </AppShell>
  )
}

function statusLabel(status: string, t: (key: TranslationKey) => string) {
  const keys: Record<string, TranslationKey> = {
    submitted: "requests.submitted",
    in_review: "requests.inReview",
    needs_info: "requests.needsInfo",
    approved: "requests.approved",
    rejected: "requests.rejected",
    converted: "requests.converted",
    cancelled: "requests.cancelled",
  }
  return t(keys[status] ?? "requests.submitted")
}

function priorityLabel(priority: string, t: (key: TranslationKey) => string) {
  if (priority === "low") return t("priority.low")
  if (priority === "high") return t("priority.high")
  if (priority === "urgent") return t("priority.urgent")
  return t("priority.medium")
}

function assigneeLabel(request: ProjectRequest, members: TenantMember[]) {
  return request.assignedToName ?? members.find((member) => member.user.id === request.assignedTo)?.user.name
}

function formatDate(value: string, locale: "en" | "de") {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)
}
