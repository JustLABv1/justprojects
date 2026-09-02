"use client"

import {
  RiCheckboxCircleLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiInformationLine,
} from "@remixicon/react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { useI18n } from "@/components/language-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ToastKind = "success" | "error" | "info"

export type ToastInput = {
  kind?: ToastKind
  title?: string
  message: string
  duration?: number
}

type Toast = ToastInput & {
  id: number
}

type ToastContextValue = {
  showToast: (input: ToastInput) => void
  dismissToast: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((input: ToastInput) => {
    const id = nextId.current++
    setToasts((current) =>
      [...current, { ...input, id, kind: input.kind ?? "success" }].slice(-4)
    )
  }, [])

  const value = useMemo(
    () => ({ showToast, dismissToast }),
    [dismissToast, showToast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within ToastProvider")
  }
  return context
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  const { t } = useI18n()

  return (
    <div
      className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:end-6 sm:w-[min(380px,calc(100vw-3rem))]"
      aria-label={t("feedback.notifications")}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: (id: number) => void
}) {
  const { t } = useI18n()
  const kind = toast.kind ?? "success"

  useEffect(() => {
    if (toast.duration === 0) return
    const timeout = window.setTimeout(
      () => onDismiss(toast.id),
      toast.duration ?? 4500
    )
    return () => window.clearTimeout(timeout)
  }, [onDismiss, toast.duration, toast.id])

  const Icon =
    kind === "error"
      ? RiErrorWarningLine
      : kind === "info"
        ? RiInformationLine
        : RiCheckboxCircleLine

  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-2xl border bg-background/95 px-4 py-3 text-sm shadow-xl ring-1 shadow-foreground/10 ring-border/40 backdrop-blur supports-[backdrop-filter]:bg-background/85",
        kind === "error"
          ? "border-destructive/35 text-destructive"
          : kind === "info"
            ? "border-border text-foreground"
            : "border-primary/25 text-primary"
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {toast.title ??
            t(
              kind === "error"
                ? "feedback.errorTitle"
                : kind === "info"
                  ? "feedback.infoTitle"
                  : "feedback.successTitle"
            )}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {toast.message}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="-mt-1 -mr-1 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={t("feedback.dismiss")}
        onClick={() => onDismiss(toast.id)}
      >
        <RiCloseLine aria-hidden="true" />
      </Button>
    </div>
  )
}
