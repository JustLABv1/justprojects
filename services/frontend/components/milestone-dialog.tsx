"use client"

import { useEffect, useState, type FormEvent } from "react"
import { RiLoader4Line } from "@remixicon/react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useI18n } from "@/components/language-provider"
import type { Milestone } from "@/lib/types"

export interface NewMilestoneInput {
  name: string
  description: string
  startDate: string
  dueDate: string
  status: "open" | "closed"
  visibility: string
}

export type UpdateMilestoneInput = NewMilestoneInput & { version: number }

export function MilestoneDialog({
  open,
  onOpenChange,
  milestone,
  onCreate,
  onUpdate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  milestone?: Milestone
  onCreate?: (input: NewMilestoneInput) => Promise<void> | void
  onUpdate?: (input: UpdateMilestoneInput) => Promise<void> | void
}) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [startDate, setStartDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [status, setStatus] = useState<"open" | "closed">("open")
  const [visibility, setVisibility] = useState("internal")
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setName("")
    setDescription("")
    setStartDate("")
    setDueDate("")
    setStatus("open")
    setVisibility("internal")
  }

  useEffect(() => {
    if (!open || !milestone) return
    // Populate the editor whenever a different roadmap milestone is selected.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(milestone.name)
    setDescription(milestone.description ?? "")
    setStartDate(milestone.startDate?.slice(0, 10) ?? "")
    setDueDate(milestone.dueDate?.slice(0, 10) ?? "")
    setStatus(milestone.status === "closed" ? "closed" : "open")
    setVisibility(milestone.visibility)
  }, [open, milestone])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) return
    if (milestone ? !onUpdate : !onCreate) return
    setSubmitting(true)
    try {
      const input: NewMilestoneInput = {
        name: name.trim(),
        description: description.trim(),
        startDate,
        dueDate,
        status,
        visibility,
      }
      if (milestone) {
        await onUpdate?.({ ...input, version: milestone.version })
      } else {
        await onCreate?.(input)
      }
      reset()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {milestone
              ? t("dialog.editMilestone")
              : t("dialog.createMilestone")}
          </DialogTitle>
          <DialogDescription>
            {milestone
              ? t("dialog.editMilestoneDescription")
              : t("dialog.milestoneDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="milestone-name">{t("dialog.milestoneName")}</Label>
            <Input
              id="milestone-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("dialog.milestoneNamePlaceholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="milestone-description">
              {t("dialog.description")}
            </Label>
            <Textarea
              id="milestone-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("dialog.milestoneDescriptionPlaceholder")}
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="milestone-start-date">
                {t("dialog.startDate")}
              </Label>
              <Input
                id="milestone-start-date"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="milestone-due-date">{t("dialog.dueDate")}</Label>
              <Input
                id="milestone-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="milestone-status">{t("dialog.status")}</Label>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value === "closed" ? "closed" : "open")
              }
            >
              <SelectTrigger id="milestone-status" className="w-full">
                <SelectValue>
                  {status === "closed"
                    ? t("roadmap.complete")
                    : t("roadmap.upcoming")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t("roadmap.upcoming")}</SelectItem>
                <SelectItem value="closed">{t("roadmap.complete")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="milestone-visibility">
              {t("dialog.customerVisibility")}
            </Label>
            <Select
              value={visibility}
              onValueChange={(value) => setVisibility(value ?? "internal")}
            >
              <SelectTrigger id="milestone-visibility" className="w-full">
                <SelectValue>
                  {visibility === "customer"
                    ? t("dialog.visibleToCustomer")
                    : t("dialog.internalOnly")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">
                  {t("dialog.internalOnly")}
                </SelectItem>
                <SelectItem value="customer">
                  {t("dialog.visibleToCustomer")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("dialog.cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting && (
                <RiLoader4Line
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {submitting
                ? milestone
                  ? t("dialog.saving")
                  : t("dialog.creating")
                : milestone
                  ? t("dialog.saveChanges")
                  : t("dialog.createMilestone")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
