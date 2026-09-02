"use client"

import { useState, type FormEvent } from "react"
import { RiLoader4Line } from "@remixicon/react"

import { FeedbackNotice } from "@/components/feedback-notice"
import { useI18n } from "@/components/language-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ProjectRequest } from "@/lib/types"
import type { TranslationKey } from "@/lib/i18n"

export interface ProjectRequestFormInput {
  requesterName: string
  requesterEmail: string
  title: string
  description: string
  requestedStartDate?: string
  requestedTargetDate?: string
  priority: "low" | "medium" | "high" | "urgent"
}

export interface ProjectRequestFormResult {
  request: ProjectRequest
  requestToken?: string
}

export function ProjectRequestForm({
  requester,
  onSubmitRequest,
  onSubmitted,
  onCancel,
  idPrefix = "request",
}: {
  requester?: { name?: string; email?: string }
  onSubmitRequest: (input: ProjectRequestFormInput) => Promise<ProjectRequestFormResult>
  onSubmitted?: (result: ProjectRequestFormResult) => void
  onCancel?: () => void
  idPrefix?: string
}) {
  const { t } = useI18n()
  const [requesterName, setRequesterName] = useState(requester?.name ?? "")
  const [requesterEmail, setRequesterEmail] = useState(requester?.email ?? "")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [requestedStartDate, setRequestedStartDate] = useState("")
  const [requestedTargetDate, setRequestedTargetDate] = useState("")
  const [priority, setPriority] = useState<ProjectRequestFormInput["priority"]>("medium")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!requesterName.trim() || !requesterEmail.trim() || !title.trim() || !description.trim()) return
    setSaving(true)
    setError(undefined)
    try {
      const result = await onSubmitRequest({
        requesterName: requesterName.trim(),
        requesterEmail: requesterEmail.trim(),
        title: title.trim(),
        description: description.trim(),
        requestedStartDate: requestedStartDate || undefined,
        requestedTargetDate: requestedTargetDate || undefined,
        priority,
      })
      onSubmitted?.(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("public.requestProjectError"))
    } finally {
      setSaving(false)
    }
  }

  const nameId = `${idPrefix}-name`
  const emailId = `${idPrefix}-email`
  const titleId = `${idPrefix}-title`
  const descriptionId = `${idPrefix}-description`
  const startId = `${idPrefix}-start`
  const targetId = `${idPrefix}-target`
  const priorityId = `${idPrefix}-priority`
  const canSubmit = !saving && Boolean(requesterName.trim() && requesterEmail.trim() && title.trim() && description.trim())

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={nameId}>{t("public.requesterName")}</Label>
          <Input id={nameId} value={requesterName} onChange={(event) => setRequesterName(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={emailId}>{t("public.requesterEmail")}</Label>
          <Input id={emailId} type="email" value={requesterEmail} onChange={(event) => setRequesterEmail(event.target.value)} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={titleId}>{t("public.requestProject")}</Label>
        <Input id={titleId} value={title} onChange={(event) => setTitle(event.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={descriptionId}>{t("public.requestProjectDetails")}</Label>
        <Textarea id={descriptionId} value={description} onChange={(event) => setDescription(event.target.value)} rows={5} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={startId}>{t("public.requestedStartDate")}</Label>
          <Input id={startId} type="date" value={requestedStartDate} onChange={(event) => setRequestedStartDate(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={targetId}>{t("public.requestedTargetDate")}</Label>
          <Input id={targetId} type="date" value={requestedTargetDate} onChange={(event) => setRequestedTargetDate(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={priorityId}>{t("public.requestPriority")}</Label>
          <Select value={priority} onValueChange={(value) => setPriority((value ?? "medium") as ProjectRequestFormInput["priority"])}>
            <SelectTrigger id={priorityId} className="w-full"><SelectValue>{priorityLabel(priority, t)}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t("priority.low")}</SelectItem>
              <SelectItem value="medium">{t("priority.medium")}</SelectItem>
              <SelectItem value="high">{t("priority.high")}</SelectItem>
              <SelectItem value="urgent">{t("priority.urgent")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && <FeedbackNotice kind="error" message={error} />}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>{t("dialog.cancel")}</Button>}
        <Button type="submit" disabled={!canSubmit}>
          {saving && <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />}
          {saving ? t("public.requestSending") : t("public.requestSubmit")}
        </Button>
      </div>
    </form>
  )
}

function priorityLabel(value: string, t: (key: TranslationKey) => string) {
  if (value === "low") return t("priority.low")
  if (value === "high") return t("priority.high")
  if (value === "urgent") return t("priority.urgent")
  return t("priority.medium")
}
