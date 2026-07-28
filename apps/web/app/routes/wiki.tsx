import { WikiIndexPage } from "~/pages/wiki/wiki-index-page"

export function meta() {
  return [
    { title: "剧情档案 | IMSWeb" },
    {
      name: "description",
      content: "偶像大师各企划内容页、剧情卡片与影像来源档案。",
    },
  ]
}

export default function Wiki() {
  return <WikiIndexPage />
}
