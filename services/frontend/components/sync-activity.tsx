"use client"

import {
  RiAlertLine,
  RiCheckLine,
  RiGitPullRequestLine,
  RiLoader4Line,
} from "@remixicon/react"

import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline"
import { Badge } from "@/components/ui/badge"
import type { SyncEvent } from "@/lib/types"

export function SyncActivity({ events }: { events: SyncEvent[] }) {
  return (
    <Timeline defaultValue={events.length || 1} orientation="vertical">
      {events.map((event, index) => {
        const step = events.length - index
        const Icon =
          event.status === "failed"
            ? RiAlertLine
            : event.status === "queued"
              ? RiLoader4Line
              : RiCheckLine
        return (
          <TimelineItem key={event.id} step={step}>
            <TimelineHeader>
              <TimelineDate dateTime={event.createdAt}>
                {formatDate(event.createdAt)}
              </TimelineDate>
              <TimelineIndicator>
                <Icon
                  className={
                    event.status === "queued" ? "size-3 animate-spin" : "size-3"
                  }
                  aria-hidden="true"
                />
              </TimelineIndicator>
              <TimelineTitle>
                {event.eventName.replace("github.", "GitHub ")}
              </TimelineTitle>
            </TimelineHeader>
            <TimelineContent className="flex items-center gap-2">
              <span>
                {event.action ? `${event.action} delivery` : "Background sync"}
              </span>
              <Badge
                variant={
                  event.status === "failed"
                    ? "destructive"
                    : event.status === "queued"
                      ? "outline"
                      : "secondary"
                }
                className="h-5 text-[10px] capitalize"
              >
                {event.status}
              </Badge>
              {event.status === "succeeded" && (
                <RiGitPullRequestLine className="size-3.5" aria-hidden="true" />
              )}
            </TimelineContent>
            <TimelineSeparator />
          </TimelineItem>
        )
      })}
    </Timeline>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}
