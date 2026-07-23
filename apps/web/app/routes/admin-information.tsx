import { InformationManager } from "~/features/admin/information-manager"

export function meta() {
  return [{ title: "活动内容管理 | IMSWeb" }]
}

export default function AdminInformation() {
  return <InformationManager />
}
