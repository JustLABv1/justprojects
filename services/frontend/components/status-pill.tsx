import { Badge } from "@/components/ui/badge"
import type { StatusCategory } from "@/lib/types"

const categoryLabels: Record<StatusCategory, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
}

export function StatusPill({
  status,
  category,
  color,
  compact = false,
}: {
  status?: string
  category?: StatusCategory
  color?: string
  compact?: boolean
}) {
  const label = status ?? (category ? categoryLabels[category] : "Unassigned")

  return (
    <Badge
      variant="outline"
      className={compact ? "h-5 gap-1 px-1.5 text-[10px]" : "gap-1.5"}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color ?? statusColor(category) }}
      />
      {label}
    </Badge>
  )
}

export function statusColor(category?: StatusCategory) {
  switch (category) {
    case "backlog":
      return "#94a3b8"
    case "todo":
      return "#60a5fa"
    case "in_progress":
      return "#8b5cf6"
    case "blocked":
      return "#f59e0b"
    case "done":
      return "#22c55e"
    default:
      return "#94a3b8"
  }
}

export function PriorityPill({ priority }: { priority: string }) {
  const color =
    priority === "urgent"
      ? "bg-rose-500"
      : priority === "high"
        ? "bg-orange-500"
        : priority === "medium"
          ? "bg-blue-500"
          : "bg-slate-400"

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground capitalize">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${color}`} />
      {priority}
    </span>
  )
}

export function UserAvatar({
  name,
  size = "default",
}: {
  name?: string
  size?: "sm" | "default"
}) {
  const initials =
    name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "—"

  return (
    <span
      aria-label={name ?? "Unassigned"}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary ${size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs"}`}
      title={name ?? "Unassigned"}
    >
      {initials}
    </span>
  )
}
