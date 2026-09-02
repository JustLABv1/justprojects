import type { Metadata } from "next"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { LanguageProvider } from "@/components/language-provider"
import { ToastProvider } from "@/components/toast-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "JustProjects · Delivery, clearly.",
  description:
    "Project management with a trustworthy customer-facing status layer.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", "font-sans")}
    >
      <body>
        <ThemeProvider>
          <LanguageProvider>
            <ToastProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </ToastProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
