import { cn } from "@/lib/utils"

export function JustProjectsLogo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-7 w-auto shrink-0 bg-current", className)}
      style={{
        aspectRatio: "550 / 530",
        WebkitMaskImage: "url('/images/logos/justprojects-logo.svg')",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "100% 100%",
        maskImage: "url('/images/logos/justprojects-logo.svg')",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "100% 100%",
      }}
    />
  )
}
