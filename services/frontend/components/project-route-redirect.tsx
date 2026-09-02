"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { ApiError, getSession, listProjects } from "@/lib/api"
import type { WorkspaceView } from "@/lib/types"
import { useI18n } from "@/components/language-provider"

export function ProjectRouteRedirect({ view }: { view: WorkspaceView }) {
  const router = useRouter()
  const { t } = useI18n()
  const [message, setMessage] = useState(t("workspace.loading"))

  useEffect(() => {
    void (async () => {
      try {
        const session = await getSession()
        const { items } = await listProjects()
        const projects = items ?? []
        const remembered = window.localStorage.getItem(
          `justprojects.last-project.${session.tenant.id}`
        )
        const project =
          projects.find((item) => item.id === remembered) ?? projects[0]
        if (!project) {
          router.replace("/app")
          return
        }
        router.replace(`/app/projects/${project.key.toLowerCase()}/${view}`)
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace(`/login?next=/app/projects/${view}`)
          return
        }
        setMessage(
          caught instanceof Error ? caught.message : t("workspace.loadError")
        )
      }
    })()
  }, [router, t, view])

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-6">
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
    </main>
  )
}
