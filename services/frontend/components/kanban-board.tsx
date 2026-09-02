"use client"

import { useEffect, useMemo, useState } from "react"
import { RiDraggable, RiEditLine, RiTimeLine } from "@remixicon/react"

import { useI18n } from "@/components/language-provider"

import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "@/components/reui/kanban"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { ProjectStatus, Task } from "@/lib/types"
import { PriorityPill, UserAvatar } from "@/components/status-pill"

export function KanbanBoardView({
  tasks,
  statuses,
  onTaskStatusChange,
  onSelectTask,
  onEditTask,
  compact = false,
}: {
  tasks: Task[]
  statuses: ProjectStatus[]
  onTaskStatusChange: (taskId: string, statusId: string) => void
  onSelectTask?: (task: Task) => void
  onEditTask?: (task: Task) => void
  compact?: boolean
}) {
  const { t } = useI18n()
  const columnsFromTasks = useMemo(() => {
    const columns: Record<string, Task[]> = Object.fromEntries(
      statuses.map((status) => [status.id, []])
    )
    for (const task of tasks) {
      if (!columns[task.statusId]) columns[task.statusId] = []
      columns[task.statusId].push(task)
    }
    return columns
  }, [statuses, tasks])
  const [columns, setColumns] =
    useState<Record<string, Task[]>>(columnsFromTasks)

  useEffect(() => {
    // Kanban keeps a local order while dragging, but parent mutations such as
    // task creation and server refreshes must still appear without a reload.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColumns(columnsFromTasks)
  }, [columnsFromTasks])

  const activeTask = (id: string) =>
    tasks.find((task) => task.id === id) ??
    Object.values(columns)
      .flat()
      .find((task) => task.id === id)

  return (
    <Kanban
      value={columns}
      onValueChange={setColumns}
      getItemValue={(task) => task.id}
      restoreOnCancel
      onValueCommit={(nextValue, meta) => {
        if (meta.kind !== "item") return
        const movedTask = activeTask(String(meta.event.active.id))
        const nextStatusId = Object.entries(nextValue).find(([, items]) =>
          items.some((task) => task.id === String(meta.event.active.id))
        )?.[0]
        if (movedTask && nextStatusId && nextStatusId !== movedTask.statusId) {
          onTaskStatusChange(movedTask.id, nextStatusId)
        }
      }}
      className="min-w-0"
      accessibility={{
        announcements: {
          onDragStart({ active }) {
            return t("kanban.pickedUp", {
              title: activeTask(String(active.id))?.title ?? t("tasks.task"),
            })
          },
          onDragOver({ active, over }) {
            if (!over) return
            return t("kanban.moving", {
              title: activeTask(String(active.id))?.title ?? t("tasks.task"),
            })
          },
          onDragEnd({ active, over }) {
            return over
              ? t("kanban.placed", {
                  title:
                    activeTask(String(active.id))?.title ?? t("tasks.task"),
                })
              : t("kanban.returned")
          },
          onDragCancel() {
            return t("kanban.cancelled")
          },
        },
      }}
    >
      <KanbanBoard
        className={cn(
          "gap-3 overflow-x-auto pb-2",
          compact
            ? "auto-cols-[minmax(220px,1fr)] grid-flow-col grid-rows-1 sm:grid-cols-none"
            : "auto-rows-fr sm:grid-cols-2 xl:grid-cols-5"
        )}
      >
        {statuses.map((status) => {
          const items = columns[status.id] ?? []
          return (
            <KanbanColumn
              key={status.id}
              value={status.id}
              disabled
              className={cn(
                "rounded-2xl bg-muted/45 p-2.5 opacity-100!",
                compact ? "min-w-[220px]" : "min-w-[250px]"
              )}
            >
              <div className="flex items-center gap-2 px-1 pb-2">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: status.color }}
                />
                <h3 className="text-xs font-semibold">{status.name}</h3>
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 justify-center px-1.5 text-[10px]"
                >
                  {items.length}
                </Badge>
              </div>
              <KanbanColumnContent value={status.id} className="min-h-32">
                {items.map((task) => (
                  <KanbanTaskCard
                    key={task.id}
                    task={task}
                    onSelect={onSelectTask}
                    onEdit={onEditTask}
                    compact={compact}
                  />
                ))}
                {items.length === 0 && (
                  <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border/70 px-3 text-center text-xs text-muted-foreground">
                    {t("kanban.dropTask")}
                  </div>
                )}
              </KanbanColumnContent>
            </KanbanColumn>
          )
        })}
      </KanbanBoard>
      <KanbanOverlay>
        {({ value }) => {
          const task = activeTask(String(value))
          return task ? (
            <KanbanTaskCard task={task} overlay compact={compact} />
          ) : null
        }}
      </KanbanOverlay>
    </Kanban>
  )
}

function KanbanTaskCard({
  task,
  overlay = false,
  onSelect,
  onEdit,
  compact = false,
}: {
  task: Task
  overlay?: boolean
  onSelect?: (task: Task) => void
  onEdit?: (task: Task) => void
  compact?: boolean
}) {
  const { locale, t } = useI18n()
  return (
    <KanbanItem
      value={task.id}
      className={cn("group", overlay && (compact ? "w-[220px]" : "w-[250px]"))}
    >
      <Card
        className={cn(
          "gap-3 rounded-xl border bg-background p-3 shadow-sm ring-1 ring-border/40 transition hover:border-primary/40 hover:shadow-md",
          overlay && "rotate-2 shadow-xl"
        )}
      >
        <div className="flex items-start gap-2">
          <KanbanItemHandle className="mt-0.5 shrink-0 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
            <RiDraggable
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </KanbanItemHandle>
          <button
            type="button"
            className="min-w-0 flex-1 text-start text-sm leading-snug font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => onSelect?.(task)}
          >
            <span className="line-clamp-2">{task.title}</span>
          </button>
          {onEdit && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={t("tasks.edit", { title: task.title })}
              title={t("tasks.edit", { title: task.title })}
              onClick={() => onEdit(task)}
            >
              <RiEditLine className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        {task.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <PriorityPill priority={task.priority} />
          {task.labels?.slice(0, 1).map((label) => (
            <Badge
              key={label.id}
              variant="outline"
              className="h-5 gap-1 px-1.5 text-[10px]"
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </Badge>
          ))}
        </div>
        <div className="flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <RiTimeLine className="size-3.5" aria-hidden="true" />
            {task.dueDate
              ? formatShortDate(task.dueDate, locale)
              : t("kanban.noDueDate")}
          </span>
          <span
            className="flex min-w-0 items-center gap-1.5"
            title={task.assigneeName || t("details.unassigned")}
          >
            <UserAvatar name={task.assigneeName} size="sm" />
            <span className="max-w-24 truncate">
              {task.assigneeName || t("details.unassigned")}
            </span>
          </span>
        </div>
      </Card>
    </KanbanItem>
  )
}

function formatShortDate(value: string, locale: "en" | "de") {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(date)
}
