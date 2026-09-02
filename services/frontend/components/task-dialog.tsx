"use client"

import { useEffect, useState, type FormEvent } from "react"
import { RiAddLine, RiLoader4Line } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Milestone, ProjectStatus, Task } from "@/lib/types"
import { useI18n } from "@/components/language-provider"

export interface NewTaskInput {
  title: string
  description: string
  statusId: string
  milestoneId?: string
  priority: string
  dueDate: string
  estimateMinutes?: number
  visibility: string
}

export function TaskDialog({
  open,
  onOpenChange,
  statuses,
  milestones,
  parentTask,
  onCreate,
  trigger = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  statuses: ProjectStatus[]
  milestones: Milestone[]
  parentTask?: Task
  onCreate: (input: NewTaskInput) => Promise<void> | void
  trigger?: boolean
}) {
  const { t } = useI18n()
  const defaultStatus =
    statuses.find((status) => status.category === "todo") ?? statuses[0]
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [statusId, setStatusId] = useState(defaultStatus?.id ?? "")
  const [milestoneId, setMilestoneId] = useState("none")
  const [priority, setPriority] = useState("medium")
  const [dueDate, setDueDate] = useState("")
  const [estimate, setEstimate] = useState("")
  const [visibility, setVisibility] = useState("internal")
  const [submitting, setSubmitting] = useState(false)
  const priorityLabel =
    priority === "low"
      ? t("priority.low")
      : priority === "high"
        ? t("priority.high")
        : priority === "urgent"
          ? t("priority.urgent")
          : t("priority.medium")

  useEffect(() => {
    if (!statusId && defaultStatus) {
      // Statuses arrive with the workspace data after this dialog is mounted.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatusId(defaultStatus.id)
    }
  }, [defaultStatus, statusId])

  const reset = () => {
    setTitle("")
    setDescription("")
    setStatusId(defaultStatus?.id ?? "")
    setMilestoneId("none")
    setPriority("medium")
    setDueDate("")
    setEstimate("")
    setVisibility("internal")
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        statusId,
        milestoneId: milestoneId === "none" ? undefined : milestoneId,
        priority,
        dueDate,
        estimateMinutes: estimate ? Number(estimate) : undefined,
        visibility,
      })
      reset()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <DialogTrigger
          render={
            <Button size="sm" className="gap-1.5">
              <RiAddLine className="size-4" aria-hidden="true" />
              {t("dialog.newTask")}
            </Button>
          }
        />
      )}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {parentTask ? t("dialog.addChildTask") : t("dialog.createTask")}
          </DialogTitle>
          <DialogDescription>
            {parentTask
              ? t("dialog.childTaskDescription", { title: parentTask.title })
              : t("dialog.taskDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">{t("dialog.taskTitle")}</Label>
            <Input
              id="task-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("dialog.taskTitlePlaceholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">{t("dialog.description")}</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("dialog.descriptionPlaceholder")}
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-status">{t("dialog.status")}</Label>
              <Select
                value={statusId}
                onValueChange={(value) => setStatusId(value ?? "")}
              >
                <SelectTrigger id="task-status" className="w-full">
                  <SelectValue placeholder={t("dialog.chooseStatus")}>
                    {statuses.find((status) => status.id === statusId)?.name ??
                      t("dialog.chooseStatus")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-priority">{t("dialog.priority")}</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value ?? "medium")}
              >
                <SelectTrigger id="task-priority" className="w-full">
                  <SelectValue>{priorityLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("priority.low")}</SelectItem>
                  <SelectItem value="medium">{t("priority.medium")}</SelectItem>
                  <SelectItem value="high">{t("priority.high")}</SelectItem>
                  <SelectItem value="urgent">{t("priority.urgent")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-milestone">{t("dialog.milestone")}</Label>
              <Select
                value={milestoneId}
                onValueChange={(value) => setMilestoneId(value ?? "none")}
              >
                <SelectTrigger id="task-milestone" className="w-full">
                  <SelectValue placeholder={t("dialog.noMilestone")}>
                    {milestoneId === "none"
                      ? t("dialog.noMilestone")
                      : (milestones.find(
                          (milestone) => milestone.id === milestoneId
                        )?.name ?? t("dialog.noMilestone"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t("dialog.noMilestone")}
                  </SelectItem>
                  {milestones.map((milestone) => (
                    <SelectItem key={milestone.id} value={milestone.id}>
                      {milestone.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due-date">{t("dialog.dueDate")}</Label>
              <Input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-estimate">{t("dialog.estimate")}</Label>
              <Input
                id="task-estimate"
                type="number"
                min={0}
                step={15}
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
                placeholder="480"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-visibility">
                {t("dialog.customerVisibility")}
              </Label>
              <Select
                value={visibility}
                onValueChange={(value) => setVisibility(value ?? "internal")}
              >
                <SelectTrigger id="task-visibility" className="w-full">
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
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("dialog.cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting && (
                <RiLoader4Line
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {submitting ? t("dialog.creating") : t("dialog.createTask")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
