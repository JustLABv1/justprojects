import type { Metadata } from "next"

import { PublicProjectPage } from "@/components/public-project-page"

export const metadata: Metadata = {
  title: "Project status · JustProjects",
  robots: { index: false, follow: false },
}

export default async function PublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { slug } = await params
  const { token } = await searchParams
  return <PublicProjectPage slug={slug} token={token} />
}
