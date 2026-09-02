"use client"

import { useCallback, useEffect, useState } from "react"
import { RiLoader4Line, RiNotification3Line } from "@remixicon/react"

import { useI18n } from "@/components/language-provider"
import { listNotifications, markNotificationRead } from "@/lib/api"
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

export function NotificationBell({ enabled = true, className }: { enabled?: boolean; className?: string }) {
  const { locale, t } = useI18n()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const result = await listNotifications()
      setNotifications(result.items ?? [])
    } catch {
      // Notification UI is supplementary; keep the rest of the page usable.
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    // Notification data is synchronized with the authenticated session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const unread = notifications.filter((notification) => !notification.readAt)

  const read = async (notification: Notification) => {
    if (notification.readAt) return
    try {
      const result = await markNotificationRead(notification.id)
      setNotifications((current) => current.map((item) => item.id === notification.id ? result.notification : item))
    } catch {
      // Keep the notification unread if the server could not persist the change.
    }
  }

  if (!enabled) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" className={cn("relative", className)} aria-label={t("notifications.title")} />}>
        <RiNotification3Line className="size-4" aria-hidden="true" />
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] leading-4 text-primary-foreground">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-3">
        <PopoverHeader>
          <PopoverTitle>{t("notifications.title")}</PopoverTitle>
          <PopoverDescription>
            {unread.length ? t("notifications.newCount", { count: unread.length }) : t("notifications.empty")}
          </PopoverDescription>
        </PopoverHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground"><RiLoader4Line className="size-4 animate-spin" />{t("portfolio.loading")}</div>
        ) : notifications.length ? (
          <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className={`w-full rounded-xl p-3 text-left transition hover:bg-muted ${notification.readAt ? "opacity-60" : "bg-primary/5"}`}
                onClick={() => void read(notification)}
              >
                <div className="flex items-start gap-2">
                  {!notification.readAt && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">{notification.title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{notification.body}</span>
                    <span className="mt-2 block text-[10px] text-muted-foreground">{formatDate(notification.createdAt, locale)}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-muted-foreground">{t("notifications.empty")}</div>
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
