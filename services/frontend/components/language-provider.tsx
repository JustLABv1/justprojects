"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import {
  defaultLocale,
  detectBrowserLocale,
  translate,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n"

const localeStorageKey = "justprojects.locale"

type LanguageContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: defaultLocale,
  setLocale: () => undefined,
  t: (key, values) => translate(defaultLocale, key, values),
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale)

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(localeStorageKey)
    } catch {
      // Browser privacy settings can disable localStorage; autodetection still works.
    }
    const nextLocale: Locale =
      stored === "de" || stored === "en" ? stored : detectBrowserLocale()
    // Keep the server-rendered English shell hydration-safe, then apply the
    // saved/browser locale once the client environment is available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocale(nextLocale)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    try {
      window.localStorage.setItem(localeStorageKey, locale)
    } catch {
      // The active locale remains usable for this session without persistence.
    }
  }, [locale])

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => translate(locale, key, values),
    }),
    [locale]
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useI18n() {
  return useContext(LanguageContext)
}
