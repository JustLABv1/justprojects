"use client"

import {
  RiAlertLine,
  RiCheckLine,
  RiCloseLine,
  RiGitBranchLine,
  RiLoader4Line,
} from "@remixicon/react"

import { useI18n } from "@/components/language-provider"
import type { SyncConflict } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"

export function SyncConflictPanel({
  conflicts,
  resolvingId,
  onResolve,
}: {
  conflicts: SyncConflict[]
  resolvingId?: string
  onResolve: (
    conflict: SyncConflict,
    resolution: "local" | "remote" | "ignore"
  ) => void
}) {
  const { t } = useI18n()

  return (
    <Frame variant="ghost" className="bg-transparent" spacing="sm">
      <FramePanel fit>
        <FrameHeader className="px-0 pt-0">
          <FrameTitle className="flex items-center gap-2">
            <RiAlertLine className="size-4 text-amber-600" aria-hidden="true" />
            {t("sync.conflicts")}
            {conflicts.length > 0 && (
              <Badge variant="secondary">{conflicts.length}</Badge>
            )}
          </FrameTitle>
          <FrameDescription className="mt-1">
            {t("sync.conflictsDescription")}
          </FrameDescription>
        </FrameHeader>

        {conflicts.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {t("sync.noConflicts")}
          </p>
        ) : (
          <div className="space-y-3">
            {conflicts.map((conflict) => {
              const type =
                conflict.localType === "milestone"
                  ? t("sync.milestone")
                  : t("tasks.task")
              const target = t("sync.conflictTarget", {
                type,
                title:
                  conflict.localTitle ??
                  conflict.localId ??
                  conflict.externalLinkId,
              })
              const fieldLabel =
                conflict.field === "workflowStatus"
                  ? t("sync.workflowStatus")
                  : conflict.field
              const busy = resolvingId === conflict.id
              return (
                <article
                  key={conflict.id}
                  className="rounded-xl border bg-background p-3"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{target}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>
                          {t("sync.conflictField", { field: fieldLabel })}
                        </span>
                        {conflict.provider && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1">
                              <RiGitBranchLine
                                className="size-3"
                                aria-hidden="true"
                              />
                              {conflict.provider}
                              {conflict.repositoryName &&
                                ` · ${conflict.repositoryName}`}
                              {conflict.externalNumber
                                ? ` #${conflict.externalNumber}`
                                : ""}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <Badge variant="outline">{conflict.status}</Badge>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <ConflictValue
                      label={t("sync.conflictLocal")}
                      value={conflict.localValue}
                      field={conflict.field}
                    />
                    <ConflictValue
                      label={t("sync.conflictRemote")}
                      value={conflict.remoteValue}
                      field={conflict.field}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onResolve(conflict, "ignore")}
                      disabled={busy}
                    >
                      <RiCloseLine className="size-3.5" aria-hidden="true" />
                      {t("sync.conflictIgnore")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onResolve(conflict, "remote")}
                      disabled={busy}
                    >
                      {busy ? (
                        <RiLoader4Line
                          className="size-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <RiGitBranchLine
                          className="size-3.5"
                          aria-hidden="true"
                        />
                      )}
                      {t("sync.conflictUseRemote")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onResolve(conflict, "local")}
                      disabled={busy}
                    >
                      <RiCheckLine className="size-3.5" aria-hidden="true" />
                      {t("sync.conflictKeepLocal")}
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </FramePanel>
    </Frame>
  )
}

function ConflictValue({
  label,
  value,
  field,
}: {
  label: string
  value: unknown
  field: string
}) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/50 p-2.5">
      <p className="text-[0.65rem] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xs leading-relaxed break-words">
        {formatConflictValue(value, field)}
      </p>
    </div>
  )
}

function formatConflictValue(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return "—"
  if (field === "assignees" && Array.isArray(value)) {
    return value.length > 0
      ? value.map((item) => `@${String(item)}`).join(", ")
      : "—"
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
