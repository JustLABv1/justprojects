"use client"

import { useState, type FormEvent } from "react"
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
import { useI18n } from "@/components/language-provider"

export interface NewProjectInput {
  name: string
  key: string
  description: string
  startDate: string
  targetDate: string
}

export function ProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (input: NewProjectInput) => Promise<void> | void
}) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [key, setKey] = useState("")
  const [description, setDescription] = useState("")
  const [startDate, setStartDate] = useState("")
  const [targetDate, setTargetDate] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const reset = () => {
    setName("")
    setKey("")
    setDescription("")
    setStartDate("")
    setTargetDate("")
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) return
    setError(undefined)
    setSubmitting(true)
    try {
      await onCreate({
        name: name.trim(),
        key: key.trim().toUpperCase(),
        description: description.trim(),
        startDate,
        targetDate,
      })
      reset()
      onOpenChange(false)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("dialog.projectCreateError")
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("dialog.createProject")}</DialogTitle>
          <DialogDescription>
            {t("dialog.projectDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_130px]">
            <div className="space-y-2">
              <Label htmlFor="project-name">{t("dialog.projectName")}</Label>
              <Input
                id="project-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("dialog.projectNamePlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-key">{t("dialog.key")}</Label>
              <Input
                id="project-key"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="NORTH"
                maxLength={12}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">
              {t("dialog.description")}
            </Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("dialog.projectDescriptionPlaceholder")}
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-start-date">
                {t("dialog.startDate")}
              </Label>
              <Input
                id="project-start-date"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-target-date">
                {t("dialog.targetDate")}
              </Label>
              <Input
                id="project-target-date"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
              />
            </div>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          )}
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
              {submitting ? t("dialog.creating") : t("dialog.createProject")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
