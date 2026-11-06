export function meta() {
  return [{ title: "页面不存在 | IMSWeb" }]
}

export default function AdminNotFound() {
  return (
    <Empty className="min-h-112 border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestionIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>管理页面不存在</EmptyTitle>
        <EmptyDescription>
          这个地址没有对应的管理业务，返回工作台继续操作。
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button render={<NavigationLink to="/admin" />} nativeButton={false}>
          <ArrowLeftIcon data-icon="inline-start" />
          返回工作台
        </Button>
      </EmptyContent>
    </Empty>
  )
}
import { ArrowLeftIcon, FileQuestionIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { NavigationLink } from "~/components/navigation/navigation-link"
