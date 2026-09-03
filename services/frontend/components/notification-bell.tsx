"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  RiDeleteBinLine,
  RiLoader4Line,
  RiNotification3Line,
} from "@remixicon/react"

import { useI18n } from "@/components/language-provider"
import {
  clearNotifications,
  deleteNotification,
  listNotifications,
  markNotificationRead,
} from "@/lib/api"
import type { Notification } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export function NotificationBell({
  enabled = true,
  className,
}: {
  enabled?: boolean
  className?: string
}) {
  const router = useRouter()
  const { locale, t } = useI18n()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [removingIDs, setRemovingIDs] = useState<Set<string>>(() => new Set())
  const [clearing, setClearing] = useState(false)

  const load = useCallback(
    async (silent = false) => {
      if (!enabled) return
      if (!silent) setLoading(true)
      try {
        const result = await listNotifications()
        setNotifications(result.items ?? [])
      } catch {
        // Notification UI is supplementary; keep the rest of the page usable.
      } finally {
        setLoading(false)
      }
    },
    [enabled]
  )

  useEffect(() => {
    // Notification data is synchronized with the authenticated session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void load(true)
    }, 5000)
    return () => window.clearInterval(interval)
  }, [load])

  const unread = notifications.filter((notification) => !notification.readAt)

  const remove = async (notification: Notification) => {
    setRemovingIDs((current) => new Set(current).add(notification.id))
    try {
      await deleteNotification(notification.id)
      setNotifications((current) =>
        current.filter((item) => item.id !== notification.id)
      )
    } catch {
      // Keep the notification visible if the server could not remove it.
    } finally {
      setRemovingIDs((current) => {
        const next = new Set(current)
        next.delete(notification.id)
        return next
      })
    }
  }

  const clearAll = async () => {
    if (!notifications.length || clearing) return
    setClearing(true)
    try {
      await clearNotifications()
      setNotifications([])
    } catch {
      // Keep the notifications visible if the server could not clear them.
    } finally {
      setClearing(false)
    }
  }

  const read = async (notification: Notification) => {
    if (!notification.readAt) {
      try {
        const result = await markNotificationRead(notification.id)
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? result.notification : item
          )
        )
      } catch {
        // Keep the notification unread if the server could not persist the change.
        return
      }
    }
    if (notification.link) {
      setOpen(false)
      router.push(notification.link)
    }
  }

  if (!enabled) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("relative", className)}
            aria-label={t("notifications.title")}
          />
        }
      >
        <RiNotification3Line className="size-4" aria-hidden="true" />
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] leading-4 text-primary-foreground">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] p-3"
      >
        <PopoverHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <PopoverTitle>{t("notifications.title")}</PopoverTitle>
              <PopoverDescription>
                {unread.length
                  ? t("notifications.newCount", { count: unread.length })
                  : t("notifications.empty")}
              </PopoverDescription>
            </div>
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 gap-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => void clearAll()}
                disabled={clearing || removingIDs.size > 0}
              >
                <RiDeleteBinLine className="size-3.5" aria-hidden="true" />
                {clearing
                  ? t("notifications.clearing")
                  : t("notifications.clearAll")}
              </Button>
            )}
          </div>
        </PopoverHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <RiLoader4Line className="size-4 animate-spin" />
            {t("portfolio.loading")}
          </div>
        ) : notifications.length ? (
          <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`flex items-start gap-1 rounded-xl transition hover:bg-muted ${notification.readAt ? "opacity-60" : "bg-primary/5"}`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-xl p-3 text-left"
                  onClick={() => void read(notification)}
                  disabled={clearing || removingIDs.has(notification.id)}
                >
                  <span className="flex items-start gap-2">
                    {!notification.readAt && (
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium">
                        {notification.title}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {notification.body}
                      </span>
                      <span className="mt-2 block text-[10px] text-muted-foreground">
                        {formatDate(notification.createdAt, locale)}
                      </span>
                    </span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="mt-2 mr-1 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t("notifications.remove")}
                  onClick={() => void remove(notification)}
                  disabled={clearing || removingIDs.has(notification.id)}
                >
                  <RiDeleteBinLine className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {t("notifications.empty")}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function formatDate(value: string, locale: "en" | "de") {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)
}
