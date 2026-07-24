import { RecommendationsCenter } from "~/features/recommendations/recommendations-center"

export function meta() {
  return [
    { title: "向您推荐 | IMSWeb" },
    {
      name: "description",
      content: "浏览 IMSWeb 制作人社区持续更新的推荐内容。",
    },
  ]
}

export default function Recommendations() {
  return <RecommendationsCenter />
}
