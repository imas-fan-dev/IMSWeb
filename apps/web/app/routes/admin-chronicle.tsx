import { ConstructionIcon, HistoryIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { AdminPageHeader, AdminPanel } from "~/features/admin/admin-ui"

export function meta() {
  return [{ title: "活动纪年审核 | IMSWeb" }]
}

export default function AdminChronicle() {
  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="CHRONICLE REVIEW"
        title="活动纪年审核"
        description="审核活动纪年投稿与图片素材。"
      />
      <AdminPanel
        title="审核队列"
        description="待处理投稿与素材状态"
        icon={HistoryIcon}
      >
        <Alert>
          <ConstructionIcon aria-hidden="true" />
          <AlertTitle>审核数据尚未接入</AlertTitle>
          <AlertDescription>
            当前 React 管理端只保留业务入口，暂不显示未验证的空队列。
          </AlertDescription>
        </Alert>
      </AdminPanel>
    </div>
  )
}
