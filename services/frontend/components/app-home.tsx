"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
  ProjectDialog,
  type NewProjectInput,
} from "@/components/project-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  ApiError,
  createProject,
  getSession,
  isApiConfigured,
  listProjects,
} from "@/lib/api"
import { FeedbackNotice } from "@/components/feedback-notice"
import { useI18n } from "@/components/language-provider"

export function AppHome() {
  const router = useRouter()
  const { t } = useI18n()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string>()

  const load = async () => {
    try {
      await getSession()
      const { items } = await listProjects()
      const projects = items ?? []
      if (projects[0]) {
        router.replace(
          `/app/projects/${projects[0].key.toLowerCase()}/overview`
        )
        return
      }
      setCreating(true)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace("/login")
        return
      }
      setError(
        caught instanceof Error ? caught.message : t("auth.apiUnavailable")
      )
    }
  }

  useEffect(() => {
    if (!isApiConfigured) {
      router.replace("/login")
      return
    }

    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
    // The router and translation function are stable; this is an initial session check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const create = async (input: NewProjectInput) => {
    const project = await createProject({
      name: input.name,
      key: input.key || undefined,
      description: input.description,
      startDate: input.startDate || undefined,
      targetDate: input.targetDate || undefined,
    })
    router.replace(`/app/projects/${project.key.toLowerCase()}/overview`)
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-6">
      <Card className="w-full max-w-lg rounded-3xl p-8 text-center shadow-xl shadow-slate-950/5">
        {error ? (
          <FeedbackNotice
            kind="error"
            message={error}
            retry={() => void load()}
            className="text-left"
          />
        ) : (
          <>
            <p className="text-sm font-medium text-primary">JustProjects</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">
              {t("workspace.noProjects")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("workspace.noProjectsDescription")}
            </p>
            <Button className="mt-6" onClick={() => setCreating(true)}>
              {t("nav.createProject")}
            </Button>
          </>
        )}
      </Card>
      <ProjectDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={create}
      />
    </main>
  )
}
