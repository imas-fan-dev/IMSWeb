import { HomePortal } from "~/pages/home/home-portal"

export function meta() {
  return [
    { title: "IMSWeb | 偶像大师交流站" },
    {
      name: "description",
      content: "偶像大师中文资料、活动日程、制作人社区与共同创作入口。",
    },
  ]
}

export default function Home() {
  return <HomePortal />
}
