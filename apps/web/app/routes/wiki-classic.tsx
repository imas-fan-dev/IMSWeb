import { ClassicWikiPage } from "~/pages/wiki/classic-wiki-page"

export function meta() {
  return [
    { title: "经典剧情导航 | IMSWeb" },
    {
      name: "description",
      content: "保留原 Wiki 模板信息层级与交互方式的经典剧情导航。",
    },
  ]
}

export default function WikiClassic() {
  return <ClassicWikiPage />
}
