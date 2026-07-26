import SiteDetailPage from "~/pages/sites/site-detail-page"

import type { Route } from "./+types/site-detail"

export default function SiteDetail({ params }: Route.ComponentProps) {
  return <SiteDetailPage siteSlug={params.siteSlug} />
}
