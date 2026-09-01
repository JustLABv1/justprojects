import { ProjectWorkspace } from "@/components/project-workspace"
import { demoWorkspace } from "@/lib/demo-data"

export default function Page() {
  return <ProjectWorkspace initialData={demoWorkspace} />
}
