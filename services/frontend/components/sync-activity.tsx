"use client"

import { useState } from "react"
import {
  RiAlertLine,
  RiCheckLine,
  RiGitPullRequestLine,
  RiLoader4Line,
  RiRefreshLine,
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
import { Button } from "@/components/ui/button"
import type { SyncEvent, SyncEventLog } from "@/lib/types"
import { useI18n } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"

export function SyncActivity({
  events,
  live = false,
  onRefresh,
  compact = false,
}: {
  events: SyncEvent[]
  live?: boolean
  onRefresh?: () => Promise<void> | void
  compact?: boolean
}) {
  const { locale, t } = useI18n()
  const [refreshing, setRefreshing] = useState(false)
  const visibleEvents = compact ? events.slice(0, 3) : events
  const successfulCount = events.filter(
    (event) => event.status === "succeeded"
  ).length
  const failedCount = events.filter((event) => event.status === "failed").length

  const refresh = async () => {
    if (!onRefresh) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      {compact && events.length > 0 && (
        <div
          className="grid grid-cols-3 divide-x rounded-xl border bg-muted/20"
          aria-label={t("sync.activitySummary")}
        >
          <div className="min-w-0 px-2.5 py-2">
            <p className="truncate text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              {t("sync.lastSync")}
            </p>
            <p className="mt-1 truncate text-xs font-medium">
              {formatDate(
                visibleEvents[0]?.updatedAt ??
                  visibleEvents[0]?.createdAt ??
                  "",
                locale
              )}
            </p>
          </div>
          <div className="min-w-0 px-2.5 py-2">
            <p className="truncate text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              {t("sync.successful")}
            </p>
            <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {successfulCount}
            </p>
          </div>
          <div className="min-w-0 px-2.5 py-2">
            <p className="truncate text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              {t("sync.failedCount")}
            </p>
            <p
              className={
                failedCount > 0
                  ? "mt-1 text-xs font-medium text-destructive"
                  : "mt-1 text-xs font-medium"
              }
            >
              {failedCount}
            </p>
          </div>
        </div>
      )}
      {(live || onRefresh) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span
              className={
                live
                  ? "size-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-emerald-500)_15%,transparent)]"
                  : "size-1.5 rounded-full bg-muted-foreground/50"
              }
              aria-hidden="true"
            />
            <span className="font-medium text-foreground">
              {live ? t("sync.live") : t("sync.activityLog")}
            </span>
            {live && (
              <span className="truncate">{t("sync.liveDescription")}</span>
            )}
          </div>
          {onRefresh && (
            <Button
              variant="ghost"
              size="xs"
              className="gap-1.5"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RiRefreshLine
                className={refreshing ? "size-3.5 animate-spin" : "size-3.5"}
                aria-hidden="true"
              />
              {refreshing ? t("sync.refreshing") : t("sync.refresh")}
            </Button>
          )}
        </div>
      )}

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/10 px-4 py-8 text-center text-xs text-muted-foreground">
          {t("sync.noRuns")}
        </div>
      ) : (
        <Timeline defaultValue={visibleEvents.length} orientation="vertical">
          {visibleEvents.map((event, index) => {
            const step = visibleEvents.length - index
            const active =
              event.status === "queued" || event.status === "processing"
            const Icon =
              event.status === "failed"
                ? RiAlertLine
                : active
                  ? RiLoader4Line
                  : RiCheckLine
            return (
              <TimelineItem
                key={event.id}
                step={step}
                className={
                  compact
                    ? "group-data-[orientation=vertical]/timeline:not-last:pb-3"
                    : undefined
                }
              >
                <TimelineHeader
                  className={
                    compact
                      ? "flex flex-wrap items-center gap-x-2 gap-y-0.5"
                      : "flex flex-wrap items-center gap-x-3 gap-y-1"
                  }
                >
                  <TimelineDate
                    dateTime={event.updatedAt ?? event.createdAt}
                    className={
                      compact ? "mb-0 shrink-0 text-[11px]" : "mb-0 shrink-0"
                    }
                  >
                    {formatDate(event.updatedAt ?? event.createdAt, locale)}
                  </TimelineDate>
                  <TimelineIndicator>
                    <Icon
                      className={active ? "size-3 animate-spin" : "size-3"}
                      aria-hidden="true"
                    />
                  </TimelineIndicator>
                  <TimelineTitle
                    className={compact ? "min-w-0 text-xs" : "min-w-0"}
                  >
                    {eventLabel(event.eventName, t)}
                  </TimelineTitle>
                </TimelineHeader>
                <TimelineContent
                  className={
                    compact
                      ? "flex flex-col items-start gap-1"
                      : "flex flex-col items-start gap-2"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{eventAction(event, t)}</span>
                    <Badge
                      variant={
                        event.status === "failed"
                          ? "destructive"
                          : active
                            ? "outline"
                            : "secondary"
                      }
                      className="h-5 text-[10px] capitalize"
                    >
                      {statusLabel(event.status, t)}
                    </Badge>
                    {event.status === "succeeded" && (
                      <RiGitPullRequestLine
                        className="size-3.5"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  {!compact &&
                    event.errorMessage &&
                    event.status === "failed" && (
                      <p className="w-full rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-xs leading-relaxed text-destructive">
                        {event.errorMessage}
                      </p>
                    )}
                  {!compact && event.logs?.length ? (
                    <div className="w-full rounded-xl border bg-muted/20 p-2.5">
                      <p className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                        {t("sync.activityLog")}
                      </p>
                      <div className="space-y-1.5">
                        {event.logs.slice(-8).map((log) => (
                          <SyncLogLine key={log.id} log={log} locale={locale} />
                        ))}
                      </div>
                    </div>
                  ) : !compact &&
                    (event.status === "queued" ||
                      event.status === "processing") ? (
                    <p className="text-xs text-muted-foreground">
                      {t("sync.waitingForLogs")}
                    </p>
                  ) : !compact ? (
                    <p className="text-xs text-muted-foreground">
                      {t("sync.noLogs")}
                    </p>
                  ) : null}
                  {compact &&
                    event.errorMessage &&
                    event.status === "failed" && (
                      <p className="w-full rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-xs leading-relaxed text-destructive">
                        {event.errorMessage}
                      </p>
                    )}
                </TimelineContent>
                <TimelineSeparator />
              </TimelineItem>
            )
          })}
        </Timeline>
      )}
      {compact && events.length > visibleEvents.length && (
        <p className="text-center text-[11px] text-muted-foreground">
          {t("sync.moreEvents", {
            count: events.length - visibleEvents.length,
          })}
        </p>
      )}
    </div>
  )
}

function SyncLogLine({
  log,
  locale,
}: {
  log: SyncEventLog
  locale: "en" | "de"
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-xs">
      <span className="mt-0.5 shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        {log.phase ?? log.level}
      </span>
      <span className="min-w-0 flex-1 leading-relaxed text-foreground/80">
        {log.message}
      </span>
      <time
        dateTime={log.createdAt}
        className="shrink-0 text-[10px] text-muted-foreground"
      >
        {formatDate(log.createdAt, locale)}
      </time>
    </div>
  )
}

type Translator = (
  key: TranslationKey,
  values?: Record<string, string | number>
) => string

function eventLabel(value: string, t: Translator) {
  if (value === "import") return t("sync.import")
  const [provider, resource] = value.split(".", 2)
  if (!provider || !resource) return t("sync.unknownEvent")
  const translatedResource =
    resource === "issues"
      ? t("sync.issues")
      : resource === "issue"
        ? t("sync.issue")
        : resource === "milestone"
          ? t("sync.milestone")
          : resource === "poll"
            ? t("sync.scheduledSync")
            : resource
  return `${provider === "github" ? "GitHub" : provider === "gitlab" ? "GitLab" : provider} ${translatedResource}`
}

function eventAction(event: SyncEvent, t: Translator) {
  if (event.eventName === "import" || event.action === "manual") {
    return t("sync.manualImport")
  }
  if (event.action === "scheduled") {
    return t("sync.scheduled")
  }
  return event.action
    ? t("sync.actionDelivery", { action: event.action })
    : t("sync.background")
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
