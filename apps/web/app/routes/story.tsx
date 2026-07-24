import { StoryPage } from "~/pages/wiki/story-page"

export function meta() {
  return [
    { title: "角色剧情 | IMSWeb" },
    {
      name: "description",
      content: "按分类浏览角色剧情卡片与投稿来源。",
    },
  ]
}

export default function Story() {
  return <StoryPage />
}
