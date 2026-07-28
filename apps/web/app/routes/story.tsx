import { StoryPage } from "~/pages/wiki/story-page"

export function meta() {
  return [
    { title: "剧情详情 | IMSWeb" },
    {
      name: "description",
      content: "按分类浏览内容页的剧情卡片与投稿来源。",
    },
  ]
}

export default function Story() {
  return <StoryPage />
}
