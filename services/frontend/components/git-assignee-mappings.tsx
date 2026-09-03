"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  RiGithubLine,
  RiLinkM,
  RiLoader4Line,
  RiUserLine,
} from "@remixicon/react"

import { useI18n } from "@/components/language-provider"
import { useToast } from "@/components/toast-provider"
import {
  ApiError,
  createGitHubUserMapping,
  deleteGitHubUserMapping,
  isApiConfigured,
  listGitHubUserMappings,
} from "@/lib/api"
import type { GitUserMapping, Task, TenantMember } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"

export function GitAssigneeMappings({
  tasks,
  members,
  onChanged,
}: {
  tasks: Task[]
  members: TenantMember[]
  onChanged?: () => void | Promise<void>
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [mappings, setMappings] = useState<GitUserMapping[]>([])
  const [remoteLogin, setRemoteLogin] = useState("")
  const [userId, setUserId] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string>()
  const [error, setError] = useState<string>()
  const [unavailable, setUnavailable] = useState(false)

  const loadMappings = useCallback(async () => {
    if (!isApiConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result = await listGitHubUserMappings()
      setMappings(result.items ?? [])
      setUnavailable(false)
      setError(undefined)
    } catch (cause) {
      // Mapping management is an integration permission. Hide the panel for
      // viewers who are not allowed to manage provider connections; surface
      // other failures so an administrator can act on them.
      if (cause instanceof ApiError && cause.status === 403) {
        setUnavailable(true)
      } else {
        setError(
          cause instanceof ApiError && cause.message
            ? cause.message
            : t("integrations.mappingError")
        )
      }
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    // Mapping data is loaded when the integrations view mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMappings()
  }, [loadMappings])

  const unmappedLogins = useMemo(() => {
    const mapped = new Set(
      mappings
        .filter((mapping) => mapping.provider === "github")
        .map((mapping) => mapping.remoteLogin.toLowerCase())
    )
    return Array.from(
      new Set(
        tasks.flatMap((task) =>
          (task.remoteAssignees ?? [])
            .filter(
              (assignee) =>
                assignee.provider === "github" &&
                !assignee.mapped &&
                !mapped.has(assignee.login.toLowerCase())
            )
            .map((assignee) => assignee.login)
        )
      )
    ).sort((left, right) => left.localeCompare(right))
  }, [mappings, tasks])

  const saveMapping = async () => {
    const login = remoteLogin.trim()
    if (!login || !userId) return
    setSaving(true)
    setError(undefined)
    try {
      const mapping = await createGitHubUserMapping({
        githubLogin: login,
        userId,
      })
      setMappings((current) => [
        ...current.filter(
          (item) => item.remoteLogin.toLowerCase() !== login.toLowerCase()
        ),
        mapping,
      ])
      setRemoteLogin("")
      setUserId("")
      showToast({ kind: "success", message: t("integrations.mappingSaved") })
      void onChanged?.()
    } catch (cause) {
      const message =
        cause instanceof ApiError && cause.message
          ? cause.message
          : t("integrations.mappingError")
      setError(message)
      showToast({ kind: "error", message })
    } finally {
      setSaving(false)
    }
  }

  const removeMapping = async (mapping: GitUserMapping) => {
    setRemovingId(mapping.id)
    try {
      await deleteGitHubUserMapping(mapping.id)
      setMappings((current) => current.filter((item) => item.id !== mapping.id))
      showToast({ kind: "success", message: t("integrations.mappingDeleted") })
      void onChanged?.()
    } catch (cause) {
      showToast({
        kind: "error",
        message:
          cause instanceof ApiError && cause.message
            ? cause.message
            : t("integrations.mappingError"),
      })
    } finally {
      setRemovingId(undefined)
    }
  }

  if (unavailable) return null

  return (
    <Frame variant="ghost" className="bg-transparent" spacing="sm">
      <FramePanel fit>
        <FrameHeader className="px-0 pt-0">
          <FrameTitle className="flex items-center gap-2">
            <RiLinkM
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            {t("integrations.assigneeMappings")}
          </FrameTitle>
          <FrameDescription className="mt-1">
            {t("integrations.assigneeMappingsDescription")}
          </FrameDescription>
        </FrameHeader>

        {error && (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        )}

        {unmappedLogins.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2">
              <RiGithubLine
                className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t("integrations.unmappedAssignees")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {unmappedLogins.map((login) => (
                    <button
                      key={login}
                      type="button"
                      className="rounded-md border border-amber-500/30 bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-amber-500/10"
                      onClick={() => setRemoteLogin(login)}
                    >
                      @{login}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="mb-4 text-xs text-muted-foreground">
          {t("integrations.mappingHint")}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <RiGithubLine
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={remoteLogin}
              onChange={(event) => setRemoteLogin(event.target.value)}
              placeholder={t("integrations.remoteLogin")}
              className="pl-8"
              aria-label={t("integrations.remoteLogin")}
            />
          </div>
          <Select
            value={userId || "none"}
            onValueChange={(value) =>
              setUserId(value === "none" ? "" : (value ?? ""))
            }
          >
            <SelectTrigger className="min-w-0 sm:w-64">
              <SelectValue>
                {members.find((member) => member.user.id === userId)?.user
                  .name ?? t("integrations.selectWorkspaceUser")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {t("integrations.selectWorkspaceUser")}
              </SelectItem>
              {members.map((member) => (
                <SelectItem key={member.user.id} value={member.user.id}>
                  {member.user.name} · {member.user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => void saveMapping()}
            disabled={!remoteLogin.trim() || !userId || saving}
          >
            {saving ? (
              <RiLoader4Line
                className="size-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <RiUserLine className="size-3.5" aria-hidden="true" />
            )}
            {t("integrations.saveMapping")}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-5 text-xs text-muted-foreground">
            <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
            {t("integrations.loadingMappings")}
          </div>
        ) : mappings.length > 0 ? (
          <div className="mt-4 divide-y border-y">
            {mappings.map((mapping) => {
              const member = members.find(
                (item) => item.user.id === mapping.userId
              )
              return (
                <div key={mapping.id} className="flex items-center gap-3 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <RiGithubLine className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      @{mapping.remoteLogin}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member?.user.name ?? mapping.userId}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive"
                    onClick={() => void removeMapping(mapping)}
                    disabled={removingId === mapping.id}
                  >
                    {removingId === mapping.id && (
                      <RiLoader4Line
                        className="size-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {t("integrations.removeMapping")}
                  </Button>
                </div>
              )
            })}
          </div>
        ) : null}
      </FramePanel>
    </Frame>
  )
}
