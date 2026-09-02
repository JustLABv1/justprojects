import { PublicRequestPage } from "@/components/public-request-page"

export default async function Page({
  params,
}: {
  params: Promise<{ tenantSlug: string }>
}) {
  const { tenantSlug } = await params
  return <PublicRequestPage requestSlug={tenantSlug} />
}
