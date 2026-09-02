"use client"

import { useI18n } from "@/components/language-provider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export function LanguageSwitcher({
  className,
  selectClassName,
}: {
  className?: string
  selectClassName?: string
}) {
  const { locale, setLocale, t } = useI18n()

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2 py-1",
        className
      )}
    >
      <label htmlFor="language-switcher" className="sr-only">
        {t("language.label")}
      </label>
      <Select
        value={locale}
        onValueChange={(value) => setLocale(value as "en" | "de")}
      >
        <SelectTrigger
          id="language-switcher"
          aria-label={t("language.label")}
          className={cn(
            "h-7 w-[5.75rem] border-0 bg-transparent px-1 text-xs font-medium shadow-none focus-visible:ring-0",
            selectClassName
          )}
        >
          <SelectValue>
            {locale === "de" ? t("language.german") : t("language.english")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="en">{t("language.english")}</SelectItem>
          <SelectItem value="de">{t("language.german")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
