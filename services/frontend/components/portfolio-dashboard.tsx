"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RiArrowRightUpLine, RiCheckboxMultipleLine, RiErrorWarningLine, RiInboxArchiveLine, RiLayoutGridLine, RiLoader4Line, RiRefreshLine, RiShareBoxLine, RiShieldKeyholeLine } from "@remixicon/react"

import { AppShell } from "@/components/app-shell"
import { FeedbackNotice } from "@/components/feedback-notice"
import { ProjectDialog, type NewProjectInput } from "@/components/project-dialog"
import { useI18n } from "@/components/language-provider"
import { ApiError, createProject, getPortfolio, getSession, isApiConfigured, listProjectRequests, logout } from "@/lib/api"
import type { PortfolioProject, Session } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export function PortfolioDashboard() {
  const router = useRouter()
  const { locale, t } = useI18n()
  const [projects, setProjects] = useState<PortfolioProject[]>([])
  const [session, setSession] = useState<Session>()
  const [openRequests, setOpenRequests] = useState(0)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    if (!isApiConfigured) {
      router.replace("/login")
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      const nextSession = await getSession()
      setSession(nextSession)
      const [portfolioResult, requestResult] = await Promise.all([
        getPortfolio(),
        listProjectRequests(),
      ])
      setProjects(portfolioResult.items ?? [])
      setOpenRequests((requestResult.items ?? []).filter((request) => !["converted", "rejected", "cancelled"].includes(request.status)).length)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace("/login?next=%2Fapp")
        return
      }
      setError(caught instanceof Error ? caught.message : t("portfolio.loadError"))
    } finally {
      setLoading(false)
    }
  }, [router, t])

  useEffect(() => {
    // Load the portfolio after the client-side session is available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const create = async (input: NewProjectInput) => {
    const project = await createProject({
      name: input.name,
      key: input.key || undefined,
      description: input.description,
      startDate: input.startDate || undefined,
      targetDate: input.targetDate || undefined,
    })
    router.push(`/app/projects/${project.key.toLowerCase()}/overview`)
  }

  const shellProjects = projects.map(({ project }) => project)
  const shellProject = shellProjects[0]
  const openProject = (projectId: string) => {
    const nextProject = shellProjects.find((project) => project.id === projectId)
    if (nextProject) router.push(`/app/projects/${nextProject.key.toLowerCase()}/overview`)
  }
  const handleLogout = async () => {
    await logout().catch(() => undefined)
    router.replace("/login")
  }

  const dashboard = (
    <div className="min-h-svh">
      <div className="mx-auto max-w-[1500px] space-y-8">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-primary"><RiLayoutGridLine className="size-4" aria-hidden="true" />{t("nav.portfolio")}</div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("portfolio.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("portfolio.description")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/app/requests")} className="gap-1.5"><RiInboxArchiveLine className="size-3.5" />{t("portfolio.viewRequests")}{openRequests > 0 && <Badge variant="secondary" className="ms-1 h-5 min-w-5 justify-center px-1 text-[10px]">{openRequests}</Badge>}</Button>
            {session && <Button variant="outline" size="sm" className="gap-1.5" render={<a href={`/request/${session.tenant.requestSlug}`} target="_blank" rel="noreferrer" />}><RiShareBoxLine className="size-3.5" />{t("portfolio.openRequestPage")}</Button>}
            <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">{t("portfolio.newProject")}</Button>
          </div>
        </header>

        {error && <FeedbackNotice kind="error" message={error} retry={() => void load()} />}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground"><RiLoader4Line className="size-4 animate-spin" />{t("portfolio.loading")}</div>
        ) : projects.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard label={t("portfolio.totalProjects")} value={projects.length} icon={<RiLayoutGridLine className="size-4" />} />
              <SummaryCard label={t("portfolio.activeProjects")} value={projects.filter(({ project }) => project.status === "active").length} icon={<RiCheckboxMultipleLine className="size-4" />} />
              <SummaryCard label={t("portfolio.openRequests")} value={openRequests} icon={<RiInboxArchiveLine className="size-4" />} accent={openRequests > 0} />
            </div>
            <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{t("portfolio.projectCount", { count: projects.length })}</p><Button variant="ghost" size="sm" onClick={() => void load()} className="gap-1.5"><RiRefreshLine className="size-3.5" />{t("portfolio.refresh")}</Button></div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {projects.map((item) => <PortfolioCard key={item.project.id} item={item} locale={locale} onOpen={() => router.push(`/app/projects/${item.project.key.toLowerCase()}/overview`)} />)}
            </div>
          </>
        ) : (
          <Card className="rounded-3xl p-10 text-center shadow-none"><RiLayoutGridLine className="mx-auto size-8 text-primary" /><h2 className="mt-4 text-xl font-semibold">{t("portfolio.noProjects")}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t("portfolio.noProjectsDescription")}</p><div className="mt-6 flex flex-wrap justify-center gap-2"><Button onClick={() => setCreating(true)}>{t("portfolio.newProject")}</Button>{session?.platformAdmin && <Button variant="outline" className="gap-1.5" render={<Link href="/app/admin" />}><RiShieldKeyholeLine className="size-3.5" />{t("nav.platformAdmin")}</Button>}</div></Card>
        )}
      </div>
    </div>
  )

  const dialog = <ProjectDialog open={creating} onOpenChange={setCreating} onCreate={create} />
  if (!session || !shellProject) {
    return <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{dashboard}{dialog}</main>
  }

  return (
    <AppShell
      project={shellProject}
      projects={shellProjects}
      user={session.user}
      tenant={session.tenant}
      activeView="portfolio"
      apiConnected={isApiConfigured}
      onProjectChange={openProject}
      onCreateTask={() => undefined}
      onCreateProject={() => setCreating(true)}
      onLogout={() => void handleLogout()}
      showNewTask={false}
      platformAdmin={session.platformAdmin}
    >
      {dashboard}
      {dialog}
    </AppShell>
  )
}

function SummaryCard({ label, value, icon, accent = false }: { label: string; value: number; icon: React.ReactNode; accent?: boolean }) {
  return <Card className={`rounded-2xl p-4 shadow-none ${accent ? "border-primary/30 bg-primary/[0.03]" : ""}`}><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span></div><p className="mt-4 text-2xl font-semibold tracking-tight">{value}</p></Card>
}

function PortfolioCard({ item, locale, onOpen }: { item: PortfolioProject; locale: "en" | "de"; onOpen: () => void }) {
  const { t } = useI18n()
  const progress = item.taskTotal ? Math.round((item.completedTasks / item.taskTotal) * 100) : 0
  return <Card className="flex h-full flex-col rounded-2xl p-5 shadow-none"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-xs text-primary">{item.project.key}</span><Badge variant="outline" className="text-[10px]">{item.project.status}</Badge></div><h2 className="mt-2 truncate text-lg font-semibold">{item.project.name}</h2></div><Button variant="ghost" size="icon-sm" aria-label={t("portfolio.openProject")} onClick={onOpen}><RiArrowRightUpLine className="size-4" /></Button></div><div className="mt-6"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{t("portfolio.completedTasks", { done: item.completedTasks, total: item.taskTotal })}</span><span className="font-medium">{progress}%</span></div><Progress value={progress} className="mt-2 h-1.5" /></div><div className="mt-5 grid gap-3 border-t pt-4 text-xs"><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{t("portfolio.nextMilestone")}</span><span className="max-w-[12rem] truncate text-right font-medium">{item.nextMilestone?.name ?? t("portfolio.noMilestone")}</span></div><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{t("portfolio.customerPages", { count: item.activeCustomerPages })}</span>{item.blockedTasks > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><RiErrorWarningLine className="size-3.5" />{t("portfolio.blockedTasks", { count: item.blockedTasks })}</span>}</div>{item.project.targetDate && <div className="text-muted-foreground">{t("portfolio.targetDate", { date: formatDate(item.project.targetDate, locale) })}</div>}</div><div className="mt-auto pt-5"><Button variant="outline" className="w-full gap-1.5" onClick={onOpen}>{t("portfolio.openProject")}<RiArrowRightUpLine className="size-3.5" /></Button></div></Card>
}

function formatDate(value: string, locale: "en" | "de") {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)
}
