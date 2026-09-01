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
import { login, getOidcStartUrl, isApiConfigured } from "@/lib/api"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    if (!isApiConfigured) {
      router.push("/")
      return
    }
    setLoading(true)
    try {
      await login({ email, password })
      router.push("/")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.")
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
        caught instanceof Error ? caught.message : "OIDC is not configured."
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
          <p className="mb-4 text-sm text-white/50">Delivery, clearly.</p>
          <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight">
            Give every project a clear next step.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">
            Connect your team, your GitHub work, and your customers around one
            trustworthy project story.
          </p>
        </div>
        <p className="text-xs text-white/40">
          Built for teams who care about the handoff.
        </p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RiArrowLeftLine className="size-3.5" aria-hidden="true" />
            Back to preview
          </Link>
          <Card className="rounded-3xl p-6 shadow-xl shadow-slate-950/5 sm:p-8">
            <div className="mb-7">
              <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <RiLockPasswordLine className="size-5" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Welcome back
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in to your workspace and pick up where you left off.
              </p>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
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
                  <Label htmlFor="login-password">Password</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
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
                Sign in
              </Button>
            </form>
            <div className="my-6 flex items-center gap-3 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => void oidc()}
            >
              <RiGithubLine className="size-4" aria-hidden="true" />
              Continue with OIDC
            </Button>
            <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
              Local accounts and OIDC sessions are owned by the backend. Your
              browser only receives an httpOnly session cookie.
            </p>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              New workspace?{" "}
              <Link
                href="/register"
                className="font-medium text-primary hover:underline"
              >
                Create an account
              </Link>
            </p>
          </Card>
        </div>
      </section>
    </main>
  )
}
