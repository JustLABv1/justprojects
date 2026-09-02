"use client"

import { useState, type FormEvent } from "react"
import { RiAddLine, RiLoader4Line, RiMegaphoneLine } from "@remixicon/react"

import { FeedbackNotice } from "@/components/feedback-notice"
import { useI18n } from "@/components/language-provider"
import { createProjectUpdate } from "@/lib/api"
import type { ProjectUpdate } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"

export function ProjectUpdatesPanel({
  projectId,
  updates,
  onUpdateCreated,
}: {
  projectId: string
  updates: ProjectUpdate[]
  onUpdateCreated?: (update: ProjectUpdate) => void
}) {
  const { locale, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [visibility, setVisibility] = useState<"customer" | "internal">("customer")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    setError(undefined)
    try {
      const result = await createProjectUpdate(projectId, {
        title: title.trim(),
        body: body.trim(),
        visibility,
      })
      onUpdateCreated?.(result.update)
      setTitle("")
      setBody("")
      setVisibility("customer")
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("updates.postError"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Frame variant="ghost" className="bg-transparent" spacing="xs">
        <FramePanel fit>
          <FrameHeader className="px-0 pt-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <FrameTitle>{t("updates.title")}</FrameTitle>
                <FrameDescription className="mt-1">
                  {t("updates.description")}
                </FrameDescription>
              </div>
              <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setOpen(true)}>
                <RiAddLine className="size-3.5" aria-hidden="true" />
                {t("updates.post")}
              </Button>
            </div>
          </FrameHeader>
          {updates.length ? (
            <div className="space-y-3">
              {updates.slice(0, 5).map((update) => (
                <Card key={update.id} className="rounded-2xl p-4 shadow-none">
                  <div className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <RiMegaphoneLine className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{update.title}</p>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {update.visibility === "customer"
                            ? t("updates.postCustomer")
                            : t("updates.postInternal")}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {update.body}
                      </p>
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        {update.authorName ? `${update.authorName} · ` : ""}
                        {formatDate(update.createdAt, locale)}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              {t("updates.empty")}
            </div>
          )}
        </FramePanel>
      </Frame>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("updates.new")}</DialogTitle>
            <DialogDescription>{t("updates.description")}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <label htmlFor="update-title" className="text-xs font-medium">
                {t("updates.postTitle")}
              </label>
              <Input
                id="update-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="update-body" className="text-xs font-medium">
                {t("updates.postBody")}
              </label>
              <Textarea
                id="update-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={5}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="update-visibility" className="text-xs font-medium">
                {t("updates.postVisibility")}
              </label>
              <Select
                value={visibility}
                onValueChange={(value) => setVisibility((value ?? "customer") as "customer" | "internal")}
              >
                <SelectTrigger id="update-visibility" className="w-full">
                  <SelectValue>
                    {visibility === "customer"
                      ? t("updates.postCustomer")
                      : t("updates.postInternal")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">{t("updates.postCustomer")}</SelectItem>
                  <SelectItem value="internal">{t("updates.postInternal")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <FeedbackNotice kind="error" message={error} />}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("dialog.cancel")}
              </Button>
              <Button type="submit" disabled={saving || !title.trim() || !body.trim()}>
                {saving && <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />}
                {saving ? t("updates.posting") : t("updates.postSubmit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function formatDate(value: string, locale: "en" | "de") {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}
