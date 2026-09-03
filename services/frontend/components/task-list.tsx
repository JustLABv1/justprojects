"use client"

import { useMemo, useState } from "react"
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCheckboxCircleLine,
  RiEditLine,
  RiFlagLine,
  RiIndentIncrease,
} from "@remixicon/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useI18n } from "@/components/language-provider"
import type { Milestone, ProjectStatus, Task } from "@/lib/types"
import { PriorityPill, StatusPill, UserAvatar } from "@/components/status-pill"

export function TaskList({
  tasks,
  statuses,
  milestones,
  onSelectTask,
  onEditTask,
}: {
  tasks: Task[]
  statuses: ProjectStatus[]
  milestones: Milestone[]
  onSelectTask?: (task: Task) => void
  onEditTask?: (task: Task) => void
}) {
  const { locale, t } = useI18n()
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const roots = tasks.filter((task) => !task.parentId)
    return Object.fromEntries(roots.map((task) => [task.id, true]))
  })
  const statusMap = useMemo(
    () => new Map(statuses.map((status) => [status.id, status])),
    [statuses]
  )
  const milestoneMap = useMemo(
    () => new Map(milestones.map((milestone) => [milestone.id, milestone])),
    [milestones]
  )
  const visibleTasks = useMemo(() => {
    const children = new Map<string, Task[]>()
    for (const task of tasks) {
      if (task.parentId)
        children.set(task.parentId, [
          ...(children.get(task.parentId) ?? []),
          task,
        ])
    }
    const result: Array<{ task: Task; depth: number }> = []
    const walk = (parentId: string | null, depth: number) => {
      for (const task of tasks.filter(
        (item) => (item.parentId ?? null) === parentId
      )) {
        result.push({ task, depth })
        if (expanded[task.id]) walk(task.id, depth + 1)
      }
    }
    walk(null, 0)
    return { result, children }
  }, [expanded, tasks])

  if (tasks.length === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 text-center">
        <RiCheckboxCircleLine
          className="mb-3 size-8 text-muted-foreground/50"
          aria-hidden="true"
        />
        <h3 className="text-sm font-medium">{t("tasks.emptyTitle")}</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {t("tasks.emptyDescription")}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">{t("tasks.projectTasks")}</caption>
          <thead className="bg-muted/30 text-left text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="w-10 px-4 py-3">
                <span className="sr-only">{t("tasks.select")}</span>
              </th>
              <th scope="col" className="px-2 py-3">
                {t("tasks.task")}
              </th>
              <th scope="col" className="px-3 py-3">
                {t("tasks.status")}
              </th>
              <th scope="col" className="px-3 py-3">
                {t("tasks.priority")}
              </th>
              <th scope="col" className="px-3 py-3">
                {t("tasks.due")}
              </th>
              <th scope="col" className="px-3 py-3">
                {t("tasks.assignee")}
              </th>
              <th scope="col" className="px-3 py-3">
                <span className="sr-only">{t("tasks.visibility")}</span>
              </th>
              <th scope="col" className="w-12 px-3 py-3">
                <span className="sr-only">{t("tasks.edit")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleTasks.result.map(({ task, depth }) => {
              const childCount = visibleTasks.children.get(task.id)?.length ?? 0
              const isExpanded = expanded[task.id] ?? false
              const status = statusMap.get(task.statusId)
              const milestone = task.milestoneId
                ? milestoneMap.get(task.milestoneId)
                : undefined
              return (
                <tr
                  key={task.id}
                  className="group transition hover:bg-muted/20"
                >
                  <td className="px-4 py-3 align-middle">
                    <Checkbox
                      aria-label={t("tasks.markComplete", {
                        title: task.title,
                      })}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <div
                      className="flex items-center gap-1.5"
                      style={{ paddingInlineStart: `${depth * 24}px` }}
                    >
                      {childCount > 0 ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-6 shrink-0"
                          aria-label={t(
                            isExpanded ? "tasks.collapse" : "tasks.expand",
                            { title: task.title }
                          )}
                          onClick={() =>
                            setExpanded((current) => ({
                              ...current,
                              [task.id]: !isExpanded,
                            }))
                          }
                        >
                          {isExpanded ? (
                            <RiArrowDownSLine aria-hidden="true" />
                          ) : (
                            <RiArrowRightSLine aria-hidden="true" />
                          )}
                        </Button>
                      ) : (
                        <span className="size-6 shrink-0" aria-hidden="true" />
                      )}
                      {depth > 0 && (
                        <RiIndentIncrease
                          className="size-3.5 text-muted-foreground/50"
                          aria-hidden="true"
                        />
                      )}
                      <button
                        type="button"
                        className="min-w-0 text-start font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        onClick={() => onSelectTask?.(task)}
                      >
                        <span className="block truncate">{task.title}</span>
                        {childCount > 0 && (
                          <span className="text-[11px] font-normal text-muted-foreground">
                            {childCount === 1
                              ? t("tasks.childTask", { count: childCount })
                              : t("tasks.childTasks", { count: childCount })}
                          </span>
                        )}
                        {milestone && (
                          <span
                            className="mt-1 flex max-w-48 items-center gap-1 text-[11px] font-normal text-primary"
                            title={`${t("tasks.milestone")}: ${milestone.name}`}
                          >
                            <RiFlagLine
                              className="size-3 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="truncate">{milestone.name}</span>
                          </span>
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill
                      status={status?.name ?? task.statusName}
                      category={status?.category ?? task.statusCategory}
                      color={status?.color}
                      compact
                    />
                  </td>
                  <td className="px-3 py-3">
                    <PriorityPill priority={task.priority} />
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {task.dueDate ? formatDate(task.dueDate, locale) : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="max-w-44 space-y-1">
                      <span
                        className="flex items-center gap-1.5"
                        title={task.assigneeName || t("details.unassigned")}
                      >
                        <UserAvatar name={task.assigneeName} size="sm" />
                        <span className="max-w-28 truncate text-xs text-muted-foreground">
                          {task.assigneeName || t("details.unassigned")}
                        </span>
                      </span>
                      {task.remoteAssignees
                        ?.filter((assignee) => !assignee.mapped)
                        .map((assignee) => (
                          <Badge
                            key={`${assignee.provider}-${assignee.login}`}
                            variant="outline"
                            className="h-5 max-w-full truncate px-1.5 text-[10px] font-normal"
                            title={`${t("tasks.remoteAssignee")}: @${assignee.login}`}
                          >
                            {assignee.provider} · @{assignee.login}
                          </Badge>
                        ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {task.visibility === "customer" && (
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        {t("tasks.customer")}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {onEditTask && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("tasks.edit", { title: task.title })}
                        onClick={() => onEditTask(task)}
                      >
                        <RiEditLine className="size-4" aria-hidden="true" />
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span>{t("tasks.summary", { count: tasks.length })}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {t("tasks.liveView")}
        </span>
      </div>
    </div>
  )
}

function formatDate(value: string, locale: "en" | "de") {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(date)
}
