import { CommunityExchangeMeWorkspace } from "./community-exchange-me-workspace"

export function meta() {
  return [
    { title: "个人档案 | IMSWeb" },
    {
      name: "description",
      content: "管理制作人个人资料、交换名片、事务所与认领消息。",
    },
  ]
}

export default function CommunityExchangeMePage() {
  return <CommunityExchangeMeWorkspace />
}
