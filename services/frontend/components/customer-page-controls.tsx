"use client"

import { useCallback, useEffect, useState } from "react"
import { RiLoader4Line, RiLockLine, RiUserAddLine, RiUserLine } from "@remixicon/react"

import { useI18n } from "@/components/language-provider"
import { useToast } from "@/components/toast-provider"
import { addPublicPageViewer, listPublicPageViewers, removePublicPageViewer } from "@/lib/api"
import type { PublicPageSummary, PublicPageViewer, TenantMember } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame"

export function CustomerPageControls({
  pages,
  members,
}: {
  pages: PublicPageSummary[]
  members: TenantMember[]
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [pageId, setPageId] = useState(pages[0]?.id ?? "")
  const [viewers, setViewers] = useState<PublicPageViewer[]>([])
  const [viewerToAdd, setViewerToAdd] = useState("")
  const [loadingViewers, setLoadingViewers] = useState(false)
  const [savingViewer, setSavingViewer] = useState(false)
  const page = pages.find((item) => item.id === pageId) ?? pages[0]

  const loadViewers = useCallback(async () => {
    if (!page || page.accessMode !== "login") {
      setViewers([])
      return
    }
    setLoadingViewers(true)
    try {
      const result = await listPublicPageViewers(page.id)
      setViewers(result.items ?? [])
    } catch {
      showToast({ kind: "error", message: t("settings.viewerError") })
    } finally {
      setLoadingViewers(false)
    }
  }, [page, showToast, t])

  useEffect(() => {
    // Viewer membership is synchronized with the selected public page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadViewers()
  }, [loadViewers])

  if (!page) return null

  const addViewer = async () => {
    if (!viewerToAdd) return
    setSavingViewer(true)
    try {
      const result = await addPublicPageViewer(page.id, viewerToAdd)
      setViewers((current) => [...current.filter((item) => item.userId !== result.userId), result])
      setViewerToAdd("")
      showToast({ kind: "success", message: t("settings.viewerAdded") })
    } catch {
      showToast({ kind: "error", message: t("settings.viewerError") })
    } finally {
      setSavingViewer(false)
    }
  }

  const removeViewer = async (viewer: PublicPageViewer) => {
    try {
      await removePublicPageViewer(page.id, viewer.userId)
      setViewers((current) => current.filter((item) => item.userId !== viewer.userId))
      showToast({ kind: "success", message: t("settings.viewerRemoved") })
    } catch {
      showToast({ kind: "error", message: t("settings.viewerError") })
    }
  }

  return (
    <Frame variant="ghost" className="bg-transparent" spacing="xs">
      <FramePanel fit>
        <FrameHeader className="px-0 pt-0">
          <FrameTitle>{t("settings.viewerManagement")}</FrameTitle>
          <FrameDescription className="mt-1">{t("settings.viewerManagementDescription")}</FrameDescription>
        </FrameHeader>
        <div className="space-y-4">
          <PageSelect pages={pages} page={page} onChange={setPageId} />
          {page.accessMode !== "login" ? (
            <div className="flex items-start gap-2 rounded-xl border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
              <RiLockLine className="mt-0.5 size-4 shrink-0" />
              {t("settings.loginViewersHint")}
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Select value={viewerToAdd || "none"} onValueChange={(value) => setViewerToAdd(value === "none" ? "" : value ?? "")}>
                  <SelectTrigger className="min-w-0 flex-1">
                    <SelectValue>{members.find((member) => member.user.id === viewerToAdd)?.user.name ?? t("settings.selectViewer")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("settings.selectViewer")}</SelectItem>
                    {members.filter((member) => !viewers.some((viewer) => viewer.userId === member.user.id)).map((member) => (
                      <SelectItem key={member.user.id} value={member.user.id}>{member.user.name} · {member.user.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" aria-label={t("settings.addViewer")} onClick={() => void addViewer()} disabled={!viewerToAdd || savingViewer}>
                  <RiUserAddLine className="size-4" />
                </Button>
              </div>
              {loadingViewers ? (
                <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><RiLoader4Line className="size-4 animate-spin" />{t("settings.loadingAccess")}</div>
              ) : viewers.length ? (
                <div className="divide-y border-y">
                  {viewers.map((viewer) => (
                    <div key={viewer.userId} className="flex items-center gap-3 py-3">
                      <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary"><RiUserLine className="size-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{viewer.name ?? members.find((member) => member.user.id === viewer.userId)?.user.name ?? viewer.userId}</p>
                        <p className="truncate text-xs text-muted-foreground">{viewer.email ?? members.find((member) => member.user.id === viewer.userId)?.user.email}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void removeViewer(viewer)}>{t("settings.removeViewer")}</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("settings.noViewers")}</p>
              )}
              {!viewers.length && !members.length && <p className="text-xs text-muted-foreground">{t("settings.noEligibleViewers")}</p>}
            </>
          )}
        </div>
      </FramePanel>
    </Frame>
  )
}

function PageSelect({ pages, page, onChange }: { pages: PublicPageSummary[]; page: PublicPageSummary; onChange: (value: string) => void }) {
  if (pages.length < 2) return <Badge variant="outline">{page.title ?? page.slug}</Badge>
  return (
    <Select value={page.id} onValueChange={(value) => value && onChange(value)}>
      <SelectTrigger className="w-full"><SelectValue>{page.title ?? page.slug}</SelectValue></SelectTrigger>
      <SelectContent>{pages.map((item) => <SelectItem key={item.id} value={item.id}>{item.title ?? item.slug}</SelectItem>)}</SelectContent>
    </Select>
  )
}
