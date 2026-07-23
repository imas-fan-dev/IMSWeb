import { RecommendationManager } from "~/features/admin/recommendation-manager"

export function meta() {
  return [{ title: "向您推荐管理 | IMSWeb" }]
}

export default function AdminRecommendations() {
  return <RecommendationManager />
}
