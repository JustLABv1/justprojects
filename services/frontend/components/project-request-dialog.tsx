"use client"

import { useState } from "react"

import { useI18n } from "@/components/language-provider"
import { createPublicProjectRequest } from "@/lib/api"
import type { ProjectRequest } from "@/lib/types"
import { ProjectRequestForm } from "@/components/project-request-form"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export function ProjectRequestDialog({
  slug,
  token,
  open,
  onOpenChange,
  requester,
  onSubmitted,
}: {
  slug: string
  token?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  requester?: { name?: string; email?: string }
  onSubmitted?: (request: ProjectRequest) => void
}) {
  const { t } = useI18n()
  const [requestToken, setRequestToken] = useState<string>()
  const [submitted, setSubmitted] = useState(false)

  const close = (nextOpen: boolean) => {
    if (!nextOpen) setSubmitted(false)
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        {submitted ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("public.requestProject")}</DialogTitle>
              <DialogDescription>{t("public.requestProjectSubmitted")}</DialogDescription>
            </DialogHeader>
            <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
              {t("public.requestTokenNotice")}
              {requestToken && (
                <code className="mt-3 block break-all rounded-lg bg-background px-3 py-2 text-xs text-foreground">
                  {requestToken}
                </code>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => close(false)}>{t("dialog.cancel")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("public.requestProjectTitle")}</DialogTitle>
              <DialogDescription>{t("public.requestProjectDescription")}</DialogDescription>
            </DialogHeader>
            <ProjectRequestForm
              idPrefix="dialog-request"
              requester={requester}
              onSubmitRequest={(input) => createPublicProjectRequest(slug, { token, ...input })}
              onSubmitted={(result) => {
                onSubmitted?.(result.request)
                setRequestToken(result.requestToken)
                setSubmitted(true)
              }}
              onCancel={() => close(false)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
