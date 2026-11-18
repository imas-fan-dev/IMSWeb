import { LibraryIcon } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"

/**
 * 名片册：交换得来的名片会收在这里。
 *
 * 界面方案由产品后续给出；当前只落标题与空态，不接数据，避免先钉一套
 * 会被方案推翻的列表结构。
 */
export function NamecardCollection() {
  return (
    <div>
      <div className="flex items-end justify-between gap-3 border-b pb-5">
        <div className="min-w-0">
          <h2
            id="profile-workspace-collection-title"
            className="text-xl font-semibold"
          >
            名片册
          </h2>
          <p className="mt-2 text-sm/6 text-muted-foreground">
            交换得来的名片会收在这里。
          </p>
        </div>
      </div>

      <Empty className="mt-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LibraryIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>名片册还是空的</EmptyTitle>
          <EmptyDescription>
            通过交换得到名片后，它会出现在这里。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
