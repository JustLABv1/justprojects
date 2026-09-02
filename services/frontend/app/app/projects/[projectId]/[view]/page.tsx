import { ProjectWorkspace } from "@/components/project-workspace"
import type { WorkspaceView } from "@/lib/types"

const views = new Set<WorkspaceView>([
  "overview",
  "tasks",
  "roadmap",
  "integrations",
  "settings",
])

export default async function ProjectViewPage({
  params,
}: {
  params: Promise<{ projectId: string; view: string }>
}) {
  const { projectId, view } = await params
  const initialView = views.has(view as WorkspaceView)
    ? (view as WorkspaceView)
    : "overview"

  return <ProjectWorkspace projectRef={projectId} initialView={initialView} />
}
