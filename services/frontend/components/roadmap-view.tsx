"use client"

import { useMemo } from "react"
import { RiAddLine, RiEditLine, RiFlagLine } from "@remixicon/react"
import { de as germanDateLocale, enUS } from "date-fns/locale"

import { Gantt } from "@/components/reui/gantt/gantt"
import { GanttNav } from "@/components/reui/gantt/gantt-nav"
import { GanttView } from "@/components/reui/gantt/gantt-view"
import type {
  GanttEvent,
  GanttResource,
} from "@/components/reui/gantt/gantt-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Frame, FramePanel } from "@/components/reui/frame"
import type { Milestone, Project, Task } from "@/lib/types"
import { useI18n } from "@/components/language-provider"

export function RoadmapView({
  project,
  tasks,
  milestones,
  onCreateMilestone,
  onEditMilestone,
}: {
  project: Project
  tasks: Task[]
  milestones: Milestone[]
  onCreateMilestone: () => void
  onEditMilestone: (milestone: Milestone) => void
}) {
  const { locale, t } = useI18n()
  const startDate = useMemo(
    () => parseDate(project.startDate) ?? new Date(),
    [project.startDate]
  )
  const { resources, events } = useMemo(
    () =>
      buildGanttData(
        tasks,
        milestones,
        t("roadmap.milestones"),
        t("roadmap.tasks")
      ),
    [milestones, t, tasks]
  )
  const ganttI18n = useMemo(
    () => ({
      labels: {
        today: t("roadmap.today"),
        previous: t("roadmap.previous"),
        next: t("roadmap.next"),
        addEvent: t("roadmap.addEvent"),
        addTask: t("roadmap.addTask"),
        allDay: t("roadmap.allDay"),
        loading: t("roadmap.loadingEvents"),
        event: t("roadmap.event"),
        events: (count: number) => t("roadmap.events", { count }),
        week: (week: number) => t("roadmap.week", { week }),
        resources: t("roadmap.resources"),
        goToDate: t("roadmap.goToDate"),
        scheduleHint: t("roadmap.scheduleHint"),
        scheduleHintDrag: t("roadmap.scheduleHintDrag"),
        reorder: t("roadmap.reorder"),
        selectView: t("roadmap.selectView"),
        zoomIn: t("roadmap.zoomIn"),
        zoomOut: t("roadmap.zoomOut"),
        resizePanel: t("roadmap.resizePanel"),
        jumpToBar: (title: string) => t("roadmap.jumpToBar", { title }),
        progress: (percent: number) => t("roadmap.progress", { percent }),
        durationDays: (days: number) => t("roadmap.durationDays", { days }),
        continues: t("roadmap.continues"),
        planned: (range: string) => t("roadmap.planned", { range }),
        milestone: t("roadmap.milestone"),
        scales: {
          day: t("roadmap.scaleDay"),
          week: t("roadmap.scaleWeek"),
          month: t("roadmap.scaleMonth"),
          quarter: t("roadmap.scaleQuarter"),
          year: t("roadmap.scaleYear"),
        },
      },
      formats: {
        timeGutter: locale === "de" ? "HH:mm" : "h a",
        eventTime: locale === "de" ? "HH:mm" : "h:mm a",
      },
    }),
    [locale, t]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            {t("roadmap.deliveryPlan")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("roadmap.timelineDescription")}
          </p>
        </div>
        <Button className="w-fit gap-1.5" size="sm" onClick={onCreateMilestone}>
          <RiAddLine className="size-4" aria-hidden="true" />
          {t("roadmap.newMilestone")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {milestones.length ? (
          milestones.map((milestone) => (
            <Card
              key={milestone.id}
              className="gap-2 rounded-2xl p-4 shadow-none"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex size-7 items-center justify-center rounded-lg ${milestone.status === "closed" ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}
                  >
                    <RiFlagLine className="size-3.5" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-medium">{milestone.name}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant={
                      milestone.status === "closed" ? "secondary" : "outline"
                    }
                    className="h-5 text-[10px]"
                  >
                    {milestone.status === "closed"
                      ? t("roadmap.complete")
                      : t("roadmap.upcoming")}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    aria-label={t("roadmap.editMilestone", {
                      name: milestone.name,
                    })}
                    title={t("roadmap.editMilestone", {
                      name: milestone.name,
                    })}
                    onClick={() => onEditMilestone(milestone)}
                  >
                    <RiEditLine className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <p className="ps-9 text-xs text-muted-foreground">
                {milestone.dueDate
                  ? formatDate(milestone.dueDate, locale)
                  : t("roadmap.dateToConfirm")}
              </p>
            </Card>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground sm:col-span-3">
            {t("roadmap.noMilestones")}
          </div>
        )}
      </div>
      <Frame
        variant="ghost"
        className="overflow-hidden bg-transparent"
        spacing="xs"
      >
        <FramePanel className="p-0" fit>
          <Gantt
            resources={resources}
            events={events}
            defaultDate={startDate}
            defaultScale="week"
            locale={locale === "de" ? germanDateLocale : enUS}
            i18n={ganttI18n}
            interactions={{ drag: false, resize: false, selectSlot: false }}
            className="h-[540px]"
            stickyNav
            treePanel={{ width: 230, resizable: true }}
          >
            <GanttNav />
            <GanttView />
          </Gantt>
        </FramePanel>
      </Frame>
      <p className="px-1 text-xs text-muted-foreground">
        {t("roadmap.readOnly")}
      </p>
    </div>
  )
}

function buildGanttData(
  tasks: Task[],
  milestones: Milestone[],
  milestoneTitle: string,
  taskTitle: string
) {
  const resources: GanttResource[] = [
    {
      id: "roadmap-milestones",
      title: milestoneTitle,
      color: "#0f766e",
      children: milestones.map((milestone) => ({
        id: `milestone-${milestone.id}`,
        title: milestone.name,
        color: "#0f766e",
      })),
    },
    {
      id: "roadmap-tasks",
      title: taskTitle,
      color: "#6366f1",
      children: tasks
        .filter((task) => !task.parentId)
        .map((task) => ({
          id: `task-${task.id}`,
          title: task.title,
          color:
            task.statusCategory === "done"
              ? "#22c55e"
              : task.statusCategory === "blocked"
                ? "#f59e0b"
                : "#6366f1",
        })),
    },
  ]
  const events: GanttEvent[] = [
    ...milestones.map((milestone) => {
      const start =
        parseDate(milestone.startDate) ??
        parseDate(milestone.dueDate) ??
        new Date()
      const end = parseDate(milestone.dueDate) ?? start
      return {
        id: `milestone-${milestone.id}`,
        title: milestone.name,
        start,
        end,
        allDay: true,
        resourceId: `milestone-${milestone.id}`,
        color: milestone.status === "closed" ? "#0f766e" : "#14b8a6",
        readOnly: true,
      }
    }),
    ...tasks
      .filter((task) => !task.parentId)
      .map((task) => {
        const start =
          parseDate(task.startDate) ?? parseDate(task.dueDate) ?? new Date()
        const due =
          parseDate(task.dueDate) ?? new Date(start.getTime() + 2 * 86_400_000)
        const end = due.getTime() < start.getTime() ? start : due
        return {
          id: `task-${task.id}`,
          title: task.title,
          start,
          end,
          allDay: true,
          resourceId: `task-${task.id}`,
          progress:
            task.statusCategory === "done"
              ? 100
              : task.statusCategory === "in_progress"
                ? 55
                : 0,
          color:
            task.statusCategory === "done"
              ? "#22c55e"
              : task.statusCategory === "blocked"
                ? "#f59e0b"
                : "#6366f1",
          readOnly: true,
        }
      }),
  ]
  return { resources, events }
}

function parseDate(value?: string | null) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatDate(value: string, locale: "en" | "de" = "en") {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}
