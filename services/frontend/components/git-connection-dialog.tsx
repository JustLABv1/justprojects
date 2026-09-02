"use client"

import { useState, type FormEvent } from "react"
import { RiGitlabLine, RiGithubLine, RiLoader4Line } from "@remixicon/react"

import { useI18n } from "@/components/language-provider"
import { createGitHubTokenConnection, createGitLabConnection } from "@/lib/api"
import type { GitConnection, GitProvider } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function GitConnectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (connection: GitConnection) => void
}) {
  const { t } = useI18n()
  const [provider, setProvider] = useState<GitProvider>("github")
  const [name, setName] = useState("")
  const [baseUrl, setBaseUrl] = useState("https://gitlab.com")
  const [accessToken, setAccessToken] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      const connection =
        provider === "github"
          ? await createGitHubTokenConnection({
              name: name.trim() || undefined,
              accessToken: accessToken.trim(),
              webhookSecret: webhookSecret.trim() || undefined,
            })
          : await createGitLabConnection({
              name: name.trim() || undefined,
              baseUrl: baseUrl.trim() || undefined,
              accessToken: accessToken.trim(),
              webhookSecret: webhookSecret.trim() || undefined,
            })
      onCreated(connection)
      onOpenChange(false)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("integrations.connectionError")
      )
    } finally {
      setSaving(false)
    }
  }

  const providerName =
    provider === "github" ? t("integrations.github") : t("integrations.gitlab")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("integrations.tokenDialogTitle", { provider: providerName })}
          </DialogTitle>
          <DialogDescription>
            {t("integrations.tokenDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="connection-provider">
              {t("integrations.provider")}
            </Label>
            <Select
              value={provider}
              onValueChange={(value) =>
                value && setProvider(value as GitProvider)
              }
            >
              <SelectTrigger id="connection-provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="github">
                  <RiGithubLine className="size-4" aria-hidden="true" />
                  {t("integrations.github")}
                </SelectItem>
                <SelectItem value="gitlab">
                  <RiGitlabLine className="size-4" aria-hidden="true" />
                  {t("integrations.gitlab")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="connection-name">
              {t("integrations.connectionName")}
            </Label>
            <Input
              id="connection-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("integrations.connectionNamePlaceholder")}
            />
          </div>
          {provider === "gitlab" && (
            <div className="space-y-2">
              <Label htmlFor="gitlab-base-url">
                {t("integrations.baseUrl")}
              </Label>
              <Input
                id="gitlab-base-url"
                type="url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://gitlab.example.com"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                {t("integrations.baseUrlHint")}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="connection-token">
              {t("integrations.accessToken")}
            </Label>
            <Input
              id="connection-token"
              type="password"
              autoComplete="new-password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              {t("integrations.accessTokenHint")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="connection-webhook-secret">
              {t("integrations.webhookSecret")}
            </Label>
            <Input
              id="connection-webhook-secret"
              type="password"
              autoComplete="new-password"
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("integrations.webhookSecretHint")}
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("integrations.cancel")}
            </Button>
            <Button type="submit" disabled={saving || !accessToken.trim()}>
              {saving && (
                <RiLoader4Line
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {saving
                ? t("integrations.saving")
                : t("integrations.saveConnection")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
