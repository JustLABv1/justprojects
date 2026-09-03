"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  RiArrowLeftLine,
  RiEyeLine,
  RiEyeOffLine,
  RiLoader4Line,
  RiLockPasswordLine,
  RiRocketLine,
  RiShieldKeyholeLine,
  RiSparkling2Line,
} from "@remixicon/react"

import { JustProjectsLogo } from "@/components/justprojects-logo"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useI18n } from "@/components/language-provider"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ApiError,
  getOidcStartUrl,
  getOidcStatus,
  getSession,
  isApiConfigured,
  login,
  register,
} from "@/lib/api"

type AuthPageMode = "login" | "register"

type RegisterForm = {
  name: string
  email: string
  password: string
  tenantName: string
}

export function AuthPage({ mode }: { mode: AuthPageMode }) {
  const router = useRouter()
  const { t } = useI18n()
  const isLogin = mode === "login"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    name: "",
    email: "",
    password: "",
    tenantName: "",
  })
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [oidcLoading, setOidcLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [oidcAvailable, setOidcAvailable] = useState<boolean | null>(() =>
    isApiConfigured ? null : false
  )

  useEffect(() => {
    if (!isApiConfigured) return

    let active = true
    void getOidcStatus()
      .then((result) => {
        if (active) setOidcAvailable(result.enabled)
      })
      .catch(() => {
        // A missing or unavailable capability endpoint means OIDC is hidden.
        if (active) setOidcAvailable(false)
      })

    return () => {
      active = false
    }
  }, [])

  const updateRegisterField = (field: keyof RegisterForm, value: string) => {
    setRegisterForm((current) => ({ ...current, [field]: value }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    if (!isApiConfigured) {
      setError(t("auth.apiRequired"))
      return
    }

    setLoading(true)
    try {
      if (isLogin) {
        await login({ email, password })
        await getSession()
      } else {
        await register(registerForm)
      }
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
    setError(undefined)
    setOidcLoading(true)
    try {
      const result = await getOidcStartUrl()
      window.location.assign(result.url)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("login.continueOIDC")
      )
    } finally {
      setOidcLoading(false)
    }
  }

  return (
    <main className="min-h-svh bg-background text-foreground xl:grid xl:grid-cols-[minmax(0,1.08fr)_minmax(480px,0.92fr)]">
      <AuthVisual />

      <section className="relative flex min-h-svh items-center justify-center overflow-hidden px-5 py-8 sm:px-10 xl:px-14 xl:py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_42%)]" />
        <div className="relative z-10 w-full max-w-[520px]">
          <div className="mb-6 flex items-center justify-end gap-4">
            {!isLogin && (
              <Link
                href="/login"
                className="group me-auto inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <RiArrowLeftLine
                  className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5"
                  aria-hidden="true"
                />
                {t("register.backSignIn")}
              </Link>
            )}
            <LanguageSwitcher />
          </div>

          <Card className="auth-card gap-0 rounded-[28px] border border-border/70 bg-card/90 p-6 shadow-2xl shadow-slate-950/10 backdrop-blur-xl sm:p-8 dark:bg-card/80">
            <div>
              <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/15">
                {isLogin ? (
                  <RiLockPasswordLine className="size-5" aria-hidden="true" />
                ) : (
                  <RiRocketLine className="size-5" aria-hidden="true" />
                )}
              </div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground/75 uppercase">
                {isLogin
                  ? t("auth.loginEyebrow")
                  : t("auth.registerEyebrow")}
              </p>
              <h1 className="mt-2 text-[clamp(1.8rem,4vw,2.35rem)] leading-tight font-semibold tracking-[-0.045em]">
                {isLogin ? t("login.welcome") : t("register.createWorkspace")}
              </h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {isLogin
                  ? t("login.signInDescription")
                  : t("register.createDescription")}
              </p>
            </div>

            <form onSubmit={submit} className="auth-form-stagger mt-8 space-y-4">
              {!isLogin && (
                <AuthField
                  id="register-name"
                  label={t("register.yourName")}
                  value={registerForm.name}
                  onChange={(value) => updateRegisterField("name", value)}
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  required
                />
              )}

              <AuthField
                id={isLogin ? "login-email" : "register-email"}
                label={isLogin ? t("login.email") : t("register.email")}
                type="email"
                value={isLogin ? email : registerForm.email}
                onChange={(value) =>
                  isLogin
                    ? setEmail(value)
                    : updateRegisterField("email", value)
                }
                autoComplete="email"
                placeholder="you@company.com"
                required
              />

              {!isLogin && (
                <AuthField
                  id="register-workspace"
                  label={t("register.workspaceName")}
                  value={registerForm.tenantName}
                  onChange={(value) => updateRegisterField("tenantName", value)}
                  placeholder={t("register.workspacePlaceholder")}
                  required
                />
              )}

              <PasswordField
                id={isLogin ? "login-password" : "register-password"}
                label={isLogin ? t("login.password") : t("register.password")}
                value={isLogin ? password : registerForm.password}
                onChange={(value) =>
                  isLogin
                    ? setPassword(value)
                    : updateRegisterField("password", value)
                }
                visible={showPassword}
                onToggle={() => setShowPassword((visible) => !visible)}
                autoComplete={isLogin ? "current-password" : "new-password"}
                minLength={10}
                required
                showLabel={t("auth.showPassword")}
                hideLabel={t("auth.hidePassword")}
              />

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-xs leading-relaxed text-destructive"
                >
                  {error}
                </p>
              )}

              <Button
                className="h-11 w-full rounded-xl text-sm shadow-lg shadow-primary/15 transition-transform duration-150 active:scale-[0.98]"
                type="submit"
                disabled={loading || oidcLoading}
              >
                {loading && (
                  <RiLoader4Line
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {isLogin ? t("login.signIn") : t("register.create")}
              </Button>
            </form>

            {!isApiConfigured && (
              <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                {t("auth.apiRequired")}
              </p>
            )}

            {oidcAvailable === true && (
              <div className="mt-6">
                <div className="flex items-center gap-3 text-[10px] font-medium tracking-[0.18em] text-muted-foreground/80 uppercase">
                  <span className="h-px flex-1 bg-border" />
                  {t("login.or")}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5 h-11 w-full rounded-xl border-border/80 bg-background/60 text-sm transition-transform duration-150 hover:bg-muted/70 active:scale-[0.98] dark:bg-background/30"
                  onClick={() => void oidc()}
                  disabled={loading || oidcLoading}
                >
                  {oidcLoading ? (
                    <RiLoader4Line
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <RiShieldKeyholeLine className="size-4" aria-hidden="true" />
                  )}
                  {t("login.continueOIDC")}
                </Button>
              </div>
            )}

            <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
              {t("login.sessionNote")}
            </p>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {isLogin ? t("login.newWorkspace") : t("auth.haveAccount")} {" "}
              <Link
                href={isLogin ? "/register" : "/login"}
                className="font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
              >
                {isLogin ? t("login.createAccount") : t("login.signIn")}
              </Link>
            </p>
          </Card>
        </div>
      </section>
    </main>
  )
}

function AuthVisual() {
  const { t } = useI18n()
  const stages = [
    { number: "01", label: t("auth.plan") },
    { number: "02", label: t("auth.build") },
    { number: "03", label: t("auth.share") },
  ]

  return (
    <section className="auth-visual relative isolate hidden overflow-hidden text-white xl:flex xl:min-h-svh">
      <div className="auth-visual-grid" aria-hidden="true" />
      <div className="auth-visual-glow auth-visual-glow-one" aria-hidden="true" />
      <div className="auth-visual-glow auth-visual-glow-two" aria-hidden="true" />
      <div className="auth-visual-orbit auth-visual-orbit-one" aria-hidden="true">
        <span />
      </div>
      <div className="auth-visual-orbit auth-visual-orbit-two" aria-hidden="true">
        <span />
      </div>
      <div className="auth-signal-card" aria-hidden="true">
        <div className="flex items-center justify-between text-[10px] tracking-[0.16em] text-white/50 uppercase">
          <span>{t("auth.deliveryPulse")}</span>
          <span className="flex items-center gap-1.5 text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-300 auth-beacon" />
            {t("auth.live")}
          </span>
        </div>
        <div className="mt-5 space-y-3">
          <div className="auth-signal-bar w-[82%]" />
          <div className="auth-signal-bar w-[61%] opacity-70" />
          <div className="auth-signal-bar w-[72%] opacity-45" />
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 text-[10px] text-white/40">
          <span>{t("auth.nextClearStep")}</span>
          <span className="text-white/70">{t("auth.ready")}</span>
        </div>
      </div>

      <div className="relative z-10 flex min-h-[430px] flex-1 flex-col p-6 sm:p-10 xl:min-h-svh xl:p-14 2xl:p-16">
        <div className="auth-reveal flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <JustProjectsLogo className="h-8 text-white" />
          <span className="font-normal">
            Just <span className="font-semibold">Projects</span>
          </span>
        </div>

        <div className="my-auto max-w-2xl py-16 xl:py-0">
          <div className="auth-reveal auth-reveal-delay-1 mb-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs text-white/65 backdrop-blur-sm">
            <RiSparkling2Line className="size-3.5 text-violet-300" aria-hidden="true" />
            {t("auth.signal")}
          </div>
          <p className="auth-reveal auth-reveal-delay-1 mb-4 text-sm text-white/45">
            {t("login.heroEyebrow")}
          </p>
          <h2 className="auth-reveal auth-reveal-delay-2 max-w-xl text-[clamp(2.7rem,5.5vw,5.6rem)] leading-[0.98] font-semibold tracking-[-0.065em] text-balance">
            {t("login.heroHeading")}
          </h2>
          <p className="auth-reveal auth-reveal-delay-3 mt-6 max-w-xl text-base leading-7 text-white/60 sm:text-lg">
            {t("login.heroDescription")}
          </p>

          <div className="auth-reveal auth-reveal-delay-4 mt-10 flex max-w-lg items-center gap-2 sm:gap-3">
            {stages.map((stage, index) => (
              <div key={stage.number} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] font-mono text-[10px] text-white/55">
                    {stage.number}
                  </span>
                  <span className="truncate text-xs font-medium text-white/60 sm:text-sm">
                    {stage.label}
                  </span>
                </div>
                {index < stages.length - 1 && (
                  <span className="h-px flex-1 bg-gradient-to-r from-white/20 to-transparent" />
                )}
              </div>
            ))}
          </div>
        </div>

        <p className="auth-reveal auth-reveal-delay-4 text-xs text-white/35">
          {t("login.heroFooter")}
        </p>
      </div>
    </section>
  )
}

function AuthField({
  id,
  label,
  value,
  onChange,
  type = "text",
  ...props
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium" htmlFor={id}>
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl bg-background/60 px-3.5 text-sm shadow-sm transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/60 focus-visible:ring-2 dark:bg-background/25"
        {...props}
      />
    </div>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  showLabel,
  hideLabel,
  ...props
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  visible: boolean
  onToggle: () => void
  showLabel: string
  hideLabel: string
  autoComplete?: string
  minLength?: number
  required?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium" htmlFor={id}>
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 rounded-xl bg-background/60 px-3.5 pr-11 text-sm shadow-sm transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/60 focus-visible:ring-2 dark:bg-background/25"
          {...props}
        />
        <button
          type="button"
          className="absolute inset-y-0 end-0 inline-flex w-11 items-center justify-center text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          aria-label={visible ? hideLabel : showLabel}
          onClick={onToggle}
        >
          {visible ? (
            <RiEyeOffLine className="size-4" aria-hidden="true" />
          ) : (
            <RiEyeLine className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  )
}
