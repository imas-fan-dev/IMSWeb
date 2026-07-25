import WorkDetailPage, { meta } from "~/pages/works/work-detail-page"

import type { Route } from "./+types/work-detail"

export { meta }

export default function WorkDetail({ params }: Route.ComponentProps) {
  return <WorkDetailPage params={params} />
}
