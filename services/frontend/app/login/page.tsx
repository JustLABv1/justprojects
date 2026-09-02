"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  RiArrowLeftLine,
  RiGithubLine,
  RiLoader4Line,
  RiLockPasswordLine,
} from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useI18n } from "@/components/language-provider"
import {
  ApiError,
  getOidcStartUrl,
  getSession,
  isApiConfigured,
  login,
} from "@/lib/api"

export default function LoginPage() {
  const router = useRouter()
  const { t } = useI18n()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    if (!isApiConfigured) {
      setError(t("auth.apiRequired"))
      return
    }
    setLoading(true)
    try {
      await login({ email, password })
      await getSession()
      router.replace("/app")
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 401
          ? t("auth.sessionUnavailable")
          : caught instanceof Error
            ? caught.message
            : t("workspace.loadError")
      )
    } finally {
      setLoading(false)
    }
  }

  const oidc = async () => {
    try {
      const result = await getOidcStartUrl()
      window.location.assign(result.url)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("login.continueOIDC")
      )
    }
  }

  return (
    <main className="grid min-h-svh bg-muted/30 lg:grid-cols-[1fr_0.9fr]">
      <section className="hidden flex-col justify-between bg-slate-950 p-10 text-white lg:flex">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-xl bg-white/10">
            <RiLockPasswordLine className="size-4" aria-hidden="true" />
          </span>
          JustProjects
        </div>
        <div className="max-w-lg">
          <p className="mb-4 text-sm text-white/50">{t("login.heroEyebrow")}</p>
          <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight">
            {t("login.heroHeading")}
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">
            {t("login.heroDescription")}
          </p>
        </div>
        <p className="text-xs text-white/40">{t("login.heroFooter")}</p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between gap-4">
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RiArrowLeftLine className="size-3.5" aria-hidden="true" />
              {t("login.backPreview")}
            </Link>
            <LanguageSwitcher />
          </div>
          <Card className="rounded-3xl p-6 shadow-xl shadow-slate-950/5 sm:p-8">
            <div className="mb-7">
              <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <RiLockPasswordLine className="size-5" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {t("login.welcome")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("login.signInDescription")}
              </p>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">{t("login.email")}</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password">{t("login.password")}</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                  >
                    {t("login.forgotPassword")}
                  </button>
                </div>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••"
                  required
                />
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {error}
                </p>
              )}
              <Button className="w-full" type="submit" disabled={loading}>
                {loading && (
                  <RiLoader4Line
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {t("login.signIn")}
              </Button>
            </form>
            {!isApiConfigured && (
              <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                {t("auth.apiRequired")}
              </p>
            )}
            <div className="my-6 flex items-center gap-3 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              {t("login.or")}
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => void oidc()}
            >
              <RiGithubLine className="size-4" aria-hidden="true" />
              {t("login.continueOIDC")}
            </Button>
            <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
              {t("login.sessionNote")}
            </p>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              {t("login.newWorkspace")}{" "}
              <Link
                href="/register"
                className="font-medium text-primary hover:underline"
              >
                {t("login.createAccount")}
              </Link>
            </p>
          </Card>
        </div>
      </section>
    </main>
  )
}
