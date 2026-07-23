import { StoryMediaManager } from "~/features/admin/story-media-manager"

export function meta() {
  return [{ title: "剧情内容管理 | IMSWeb" }]
}

export default function AdminStories() {
  return <StoryMediaManager />
}
