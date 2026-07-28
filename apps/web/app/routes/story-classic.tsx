import { ClassicStoryPage } from "~/pages/wiki/classic-story-page"

export function meta() {
  return [
    { title: "经典剧情详情 | IMSWeb" },
    {
      name: "description",
      content: "保留原 Wiki 模板分类与剧情卡片交互方式的经典视图。",
    },
  ]
}

export default function StoryClassic() {
  return <ClassicStoryPage />
}
