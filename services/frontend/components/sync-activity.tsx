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
import { useI18n } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"

export function SyncActivity({ events }: { events: SyncEvent[] }) {
  const { locale, t } = useI18n()
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
                {formatDate(event.createdAt, locale)}
              </TimelineDate>
              <TimelineIndicator>
                <Icon
                  className={
                    event.status === "queued" ? "size-3 animate-spin" : "size-3"
                  }
                  aria-hidden="true"
                />
              </TimelineIndicator>
              <TimelineTitle>{eventLabel(event.eventName, t)}</TimelineTitle>
            </TimelineHeader>
            <TimelineContent className="flex items-center gap-2">
              <span>
                {event.action
                  ? t("sync.actionDelivery", { action: event.action })
                  : t("sync.background")}
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
                {statusLabel(event.status, t)}
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

type Translator = (
  key: TranslationKey,
  values?: Record<string, string | number>
) => string

function eventLabel(value: string, t: Translator) {
  const [provider, resource] = value.split(".", 2)
  if (!provider || !resource) return t("sync.unknownEvent")
  const translatedResource =
    resource === "issues"
      ? t("sync.issues")
      : resource === "milestone"
        ? t("sync.milestone")
        : resource
  return `${provider === "github" ? "GitHub" : provider === "gitlab" ? "GitLab" : provider} ${translatedResource}`
}

function statusLabel(value: string, t: Translator) {
  if (value === "queued") return t("sync.queued")
  if (value === "processing") return t("sync.processing")
  if (value === "succeeded") return t("sync.succeeded")
  if (value === "failed") return t("sync.failed")
  return value
}

function formatDate(value: string, locale: "en" | "de" = "en") {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}
