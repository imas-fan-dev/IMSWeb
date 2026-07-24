import { StoryManagementPage } from "~/pages/admin/stories/story-management-page"

export function meta() {
  return [{ title: "剧情内容管理 | IMSWeb" }]
}

export default function AdminStories() {
  return <StoryManagementPage />
}
