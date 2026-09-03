"use client"

import { useState, type FormEvent } from "react"
import {
  RiArrowRightLine,
  RiCheckLine,
  RiExternalLinkLine,
  RiGitlabLine,
  RiGithubLine,
  RiLoader4Line,
} from "@remixicon/react"

import { FeedbackNotice } from "@/components/feedback-notice"
import { useI18n } from "@/components/language-provider"
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
import { createGitHubTokenConnection, createGitLabConnection } from "@/lib/api"
import type { GitConnection, GitProvider } from "@/lib/types"
import { cn } from "@/lib/utils"

type ConnectionStep = 1 | 2 | 3

const providerOptions: GitProvider[] = ["github", "gitlab"]

const tokenSettingsUrls: Record<GitProvider, string> = {
  github: "https://github.com/settings/personal-access-tokens/new",
  gitlab: "https://gitlab.com/-/user_settings/personal_access_tokens",
}

const tokenDocumentationUrls: Record<GitProvider, string> = {
  github:
    "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens",
  gitlab: "https://docs.gitlab.com/user/profile/personal_access_tokens/",
}

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
  const [step, setStep] = useState<ConnectionStep>(1)
  const [provider, setProvider] = useState<GitProvider>("github")
  const [name, setName] = useState("")
  const [baseUrl, setBaseUrl] = useState("https://gitlab.com")
  const [accessToken, setAccessToken] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const reset = () => {
    setStep(1)
    setProvider("github")
    setName("")
    setBaseUrl("https://gitlab.com")
    setAccessToken("")
    setWebhookSecret("")
    setSaving(false)
    setError(undefined)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const selectProvider = (nextProvider: GitProvider) => {
    if (nextProvider === provider) return
    setProvider(nextProvider)
    setAccessToken("")
    setError(undefined)
  }

  const goBack = () => {
    setError(undefined)
    if (step === 1) {
      handleOpenChange(false)
      return
    }
    setStep(step === 3 ? 2 : 1)
  }

  const goForward = () => {
    setError(undefined)
    if (step === 1) {
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    }
  }

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
      handleOpenChange(false)
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
  const tokenGuideSteps =
    provider === "github"
      ? [
          t("integrations.githubTokenGuideStep1"),
          t("integrations.githubTokenGuideStep2"),
          t("integrations.githubTokenGuideStep3"),
        ]
      : [
          t("integrations.gitlabTokenGuideStep1"),
          t("integrations.gitlabTokenGuideStep2"),
          t("integrations.gitlabTokenGuideStep3"),
        ]
  const stepLabels = [
    { id: 1 as const, label: t("integrations.connectionStepProvider") },
    { id: 2 as const, label: t("integrations.connectionStepInstructions") },
    { id: 3 as const, label: t("integrations.connectionStepCredentials") },
  ]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("integrations.tokenDialogTitle", { provider: providerName })}
          </DialogTitle>
          <DialogDescription>
            {t("integrations.tokenDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div
          aria-label={t("integrations.connectionStepLabel")}
          className="flex items-center gap-1"
        >
          {stepLabels.map((item, index) => (
            <div
              key={item.id}
              aria-current={step === item.id ? "step" : undefined}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                  step >= item.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/40 text-muted-foreground"
                )}
              >
                {step > item.id ? (
                  <RiCheckLine className="size-3.5" aria-hidden="true" />
                ) : (
                  item.id
                )}
              </span>
              <span
                className={cn(
                  "truncate text-xs",
                  step === item.id
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
              {index < stepLabels.length - 1 && (
                <span className="mx-1 h-px min-w-3 flex-1 bg-border" />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-5">
          {step === 1 && (
            <section
              className="space-y-4"
              aria-labelledby="connection-provider-heading"
            >
              <div>
                <h2
                  id="connection-provider-heading"
                  className="text-sm font-medium"
                >
                  {t("integrations.chooseProvider")}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("integrations.chooseProviderDescription")}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {providerOptions.map((option) => {
                  const selected = provider === option
                  const Icon = option === "github" ? RiGithubLine : RiGitlabLine
                  const label =
                    option === "github"
                      ? t("integrations.github")
                      : t("integrations.gitlab")

                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      disabled={saving}
                      onClick={() => selectProvider(option)}
                      className={cn(
                        "group flex min-h-28 flex-col items-start justify-between rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                        selected &&
                          "border-primary bg-primary/5 ring-2 ring-primary/15"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 items-center justify-center rounded-lg border bg-background",
                          selected
                            ? "border-primary/30 text-primary"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-medium">{label}</span>
                        {selected && (
                          <RiCheckLine
                            className="size-4 text-primary"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {step === 2 && (
            <section
              className="space-y-4"
              aria-labelledby="connection-guide-heading"
            >
              <div>
                <h2
                  id="connection-guide-heading"
                  className="text-sm font-medium"
                >
                  {t("integrations.tokenGuideTitle", {
                    provider: providerName,
                  })}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("integrations.tokenGuideDescription")}
                </p>
              </div>

              <ol className="space-y-3 rounded-xl border bg-muted/20 p-4">
                {tokenGuideSteps.map((instruction, index) => (
                  <li
                    key={instruction}
                    className="flex items-start gap-3 text-sm"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="leading-relaxed">{instruction}</span>
                  </li>
                ))}
              </ol>

              <div className="flex flex-wrap gap-2">
                <a
                  href={tokenSettingsUrls[provider]}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {t("integrations.openTokenSettings", {
                    provider: providerName,
                  })}
                  <RiExternalLinkLine className="size-3.5" aria-hidden="true" />
                </a>
                <a
                  href={tokenDocumentationUrls[provider]}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {t("integrations.readProviderGuide")}
                  <RiExternalLinkLine className="size-3.5" aria-hidden="true" />
                </a>
              </div>

              <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                {t("integrations.tokenGuideCopy")}
              </p>
            </section>
          )}

          {step === 3 && (
            <section
              className="space-y-4"
              aria-labelledby="connection-details-heading"
            >
              <div>
                <h2
                  id="connection-details-heading"
                  className="text-sm font-medium"
                >
                  {t("integrations.connectionDetails")}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("integrations.connectionDetailsDescription", {
                    provider: providerName,
                  })}
                </p>
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
                  autoComplete="organization"
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

              <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                {t("integrations.tokenValidationHint", {
                  provider: providerName,
                })}
              </p>
            </section>
          )}

          {error && <FeedbackNotice kind="error" message={error} />}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={saving}
            >
              {step === 1 ? t("integrations.cancel") : t("integrations.back")}
            </Button>
            {step < 3 ? (
              <Button type="button" onClick={goForward} disabled={saving}>
                {t("integrations.continue")}
                <RiArrowRightLine aria-hidden="true" />
              </Button>
            ) : (
              <Button type="submit" disabled={saving || !accessToken.trim()}>
                {saving && (
                  <RiLoader4Line
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {saving
                  ? t("integrations.validating")
                  : t("integrations.validateAndSave")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
