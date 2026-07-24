import ChronicleActivityPage, { meta } from "~/pages/chronicle/activity-page"

import type { Route } from "./+types/chronicle-activity"

export { meta }

export default function ChronicleActivity({ params }: Route.ComponentProps) {
  return <ChronicleActivityPage activityId={params.activityId} />
}
