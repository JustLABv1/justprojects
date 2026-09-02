"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RiArrowLeftLine, RiLoader4Line, RiRocketLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useI18n } from "@/components/language-provider"
import { isApiConfigured, register } from "@/lib/api"

export default function RegisterPage() {
  const router = useRouter()
  const { t } = useI18n()
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    tenantName: "",
  })
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
      await register(form)
      router.push("/app")
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("workspace.loadError")
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-5 sm:p-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RiArrowLeftLine className="size-3.5" aria-hidden="true" />
            {t("register.backSignIn")}
          </Link>
          <LanguageSwitcher />
        </div>
        <Card className="rounded-3xl p-6 shadow-xl shadow-slate-950/5 sm:p-8">
          <div className="mb-7">
            <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <RiRocketLine className="size-5" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("register.createWorkspace")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("register.createDescription")}
            </p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Field
              id="register-name"
              label={t("register.yourName")}
              value={form.name}
              onChange={(value) =>
                setForm((current) => ({ ...current, name: value }))
              }
              autoComplete="name"
              required
            />
            <Field
              id="register-email"
              label={t("register.email")}
              type="email"
              value={form.email}
              onChange={(value) =>
                setForm((current) => ({ ...current, email: value }))
              }
              autoComplete="email"
              required
            />
            <Field
              id="register-workspace"
              label={t("register.workspaceName")}
              value={form.tenantName}
              onChange={(value) =>
                setForm((current) => ({ ...current, tenantName: value }))
              }
              placeholder={t("register.workspacePlaceholder")}
              required
            />
            <Field
              id="register-password"
              label={t("register.password")}
              type="password"
              value={form.password}
              onChange={(value) =>
                setForm((current) => ({ ...current, password: value }))
              }
              autoComplete="new-password"
              minLength={10}
              required
            />
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
              {t("register.create")}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  )
}

function Field({
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
  minLength?: number
  required?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </div>
  )
}
