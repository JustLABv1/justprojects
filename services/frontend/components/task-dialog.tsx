"use client"

import { useState, type FormEvent } from "react"
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
              New task
            </Button>
          }
        />
      )}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {parentTask ? "Add a child task" : "Create a task"}
          </DialogTitle>
          <DialogDescription>
            {parentTask
              ? `This task will be nested under “${parentTask.title}”.`
              : "Capture the next piece of work while the context is fresh."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Task title</Label>
            <Input
              id="task-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Review the customer launch checklist"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does done look like?"
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-status">Status</Label>
              <Select
                value={statusId}
                onValueChange={(value) => setStatusId(value ?? "")}
              >
                <SelectTrigger id="task-status" className="w-full">
                  <SelectValue placeholder="Choose a status" />
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
              <Label htmlFor="task-priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value ?? "medium")}
              >
                <SelectTrigger id="task-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-milestone">Milestone</Label>
              <Select
                value={milestoneId}
                onValueChange={(value) => setMilestoneId(value ?? "none")}
              >
                <SelectTrigger id="task-milestone" className="w-full">
                  <SelectValue placeholder="No milestone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No milestone</SelectItem>
                  {milestones.map((milestone) => (
                    <SelectItem key={milestone.id} value={milestone.id}>
                      {milestone.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due-date">Due date</Label>
              <Input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-estimate">Estimate (minutes)</Label>
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
              <Label htmlFor="task-visibility">Customer visibility</Label>
              <Select
                value={visibility}
                onValueChange={(value) => setVisibility(value ?? "internal")}
              >
                <SelectTrigger id="task-visibility" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal only</SelectItem>
                  <SelectItem value="customer">Visible to customer</SelectItem>
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
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting && (
                <RiLoader4Line
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
