"use client"

import {
  RiErrorWarningLine,
  RiInformationLine,
  RiRefreshLine,
} from "@remixicon/react"

import { useI18n } from "@/components/language-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function FeedbackNotice({
  kind,
  message,
  detail,
  retry,
  title,
  className,
}: {
  kind: "error" | "success"
  message: string
  detail?: string
  retry?: () => void
  title?: string
  className?: string
}) {
  const { t } = useI18n()
  const isError = kind === "error"

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-3 border px-4 py-3 text-sm",
        isError
          ? "border-destructive/35 bg-destructive/8 text-destructive"
          : "border-primary/20 bg-primary/5 text-primary",
        className
      )}
    >
      {isError ? (
        <RiErrorWarningLine
          className="mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
      ) : (
        <RiInformationLine
          className="mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {title ??
            t(isError ? "feedback.errorTitle" : "feedback.successTitle")}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed opacity-90">{message}</p>
        {detail && (
          <p className="mt-1 text-xs leading-relaxed opacity-75">{detail}</p>
        )}
      </div>
      {retry && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={retry}
        >
          <RiRefreshLine className="size-3.5" aria-hidden="true" />
          {t("workspace.retry")}
        </Button>
      )}
    </div>
  )
}
