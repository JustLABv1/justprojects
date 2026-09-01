"use client"

import { useMemo, useState } from "react"
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCheckboxCircleLine,
  RiIndentIncrease,
} from "@remixicon/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { ProjectStatus, Task } from "@/lib/types"
import { PriorityPill, StatusPill, UserAvatar } from "@/components/status-pill"

export function TaskList({
  tasks,
  statuses,
  onSelectTask,
}: {
  tasks: Task[]
  statuses: ProjectStatus[]
  onSelectTask?: (task: Task) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const roots = tasks.filter((task) => !task.parentId)
    return Object.fromEntries(roots.map((task) => [task.id, true]))
  })
  const statusMap = useMemo(
    () => new Map(statuses.map((status) => [status.id, status])),
    [statuses]
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
        <h3 className="text-sm font-medium">No tasks match these filters</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Try a different status or create a new task to get the work moving.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">Project tasks</caption>
          <thead className="bg-muted/30 text-left text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="w-10 px-4 py-3">
                <span className="sr-only">Select</span>
              </th>
              <th scope="col" className="px-2 py-3">
                Task
              </th>
              <th scope="col" className="px-3 py-3">
                Status
              </th>
              <th scope="col" className="px-3 py-3">
                Priority
              </th>
              <th scope="col" className="px-3 py-3">
                Due
              </th>
              <th scope="col" className="px-3 py-3">
                Assignee
              </th>
              <th scope="col" className="px-3 py-3">
                <span className="sr-only">Visibility</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleTasks.result.map(({ task, depth }) => {
              const childCount = visibleTasks.children.get(task.id)?.length ?? 0
              const isExpanded = expanded[task.id] ?? false
              const status = statusMap.get(task.statusId)
              return (
                <tr
                  key={task.id}
                  className="group transition hover:bg-muted/20"
                >
                  <td className="px-4 py-3 align-middle">
                    <Checkbox aria-label={`Mark ${task.title} complete`} />
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
                          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${task.title}`}
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
                            {childCount} child{" "}
                            {childCount === 1 ? "task" : "tasks"}
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
                    {task.dueDate ? formatDate(task.dueDate) : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <UserAvatar name={task.assigneeName} size="sm" />
                  </td>
                  <td className="px-3 py-3 text-right">
                    {task.visibility === "customer" && (
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        Customer
                      </Badge>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span>{tasks.length} tasks · nested hierarchy preserved</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Live local
          view
        </span>
      </div>
    </div>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date)
}
