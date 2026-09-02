"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { RiArrowLeftLine, RiCheckLine, RiLockLine, RiShareBoxLine } from "@remixicon/react"

import { FeedbackNotice } from "@/components/feedback-notice"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ProjectRequestForm, type ProjectRequestFormResult } from "@/components/project-request-form"
import { useI18n } from "@/components/language-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ApiError, createWorkspaceProjectRequest, getPublicRequestWorkspace, isApiConfigured } from "@/lib/api"

export function PublicRequestPage({ requestSlug }: { requestSlug: string }) {
  const { t } = useI18n()
  const [workspace, setWorkspace] = useState<{ name: string; requestSlug: string }>()
  const [submitted, setSubmitted] = useState<ProjectRequestFormResult>()
  const [loading, setLoading] = useState(isApiConfigured)
  const [error, setError] = useState<string>(() => (isApiConfigured ? "" : t("auth.apiRequired")))

  useEffect(() => {
    if (!isApiConfigured) return
    void getPublicRequestWorkspace(requestSlug)
      .then((result) => setWorkspace(result.tenant))
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 404) {
          setError(t("public.requestWorkspaceNotAvailable"))
          return
        }
        setError(caught instanceof Error ? caught.message : t("public.requestProjectError"))
      })
      .finally(() => setLoading(false))
  }, [requestSlug, t])

  return (
    <main className="min-h-svh bg-[#f7f8fb] text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <RiShareBoxLine className="size-4" aria-hidden="true" />
            </span>
            JustProjects
          </Link>
          <LanguageSwitcher />
        </header>

        {loading ? (
          <div className="mt-24 text-center text-sm text-muted-foreground" role="status">{t("public.requestWorkspaceLoading")}</div>
        ) : error ? (
          <div className="mx-auto mt-20 max-w-md">
            <FeedbackNotice kind="error" title={t("public.requestWorkspaceNotAvailable")} message={error} />
          </div>
        ) : workspace ? (
          <section className="mt-14">
            <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <RiArrowLeftLine className="size-3.5" aria-hidden="true" />
              {t("public.backToHome")}
            </Link>
            <div className="mt-8 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-primary">
                <Badge variant="outline" className="gap-1.5 bg-background/60">
                  <RiLockLine className="size-3" aria-hidden="true" />
                  {t("public.requestWorkspaceEyebrow")}
                </Badge>
                <span className="text-muted-foreground">{workspace.name}</span>
              </div>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{t("public.requestWorkspaceTitle")}</h1>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">{t("public.requestWorkspaceDescription")}</p>
            </div>

            <Card className="mt-10 rounded-3xl p-6 shadow-none sm:p-8">
              {submitted ? (
                <div className="space-y-5">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <RiCheckLine className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold">{t("public.requestWorkspaceSuccessTitle")}</h2>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("public.requestWorkspaceSuccessDescription")}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                    {t("public.requestTokenNotice")}
                    {submitted.requestToken && <code className="mt-3 block break-all rounded-lg bg-background px-3 py-2 text-xs text-foreground">{submitted.requestToken}</code>}
                  </div>
                  <Button variant="outline" onClick={() => setSubmitted(undefined)}>{t("public.requestWorkspaceSubmitAnother")}</Button>
                </div>
              ) : (
                <ProjectRequestForm
                  idPrefix="workspace-request"
                  onSubmitRequest={(input) => createWorkspaceProjectRequest(workspace.requestSlug, input)}
                  onSubmitted={setSubmitted}
                />
              )}
            </Card>
          </section>
        ) : null}
      </div>
    </main>
  )
}
