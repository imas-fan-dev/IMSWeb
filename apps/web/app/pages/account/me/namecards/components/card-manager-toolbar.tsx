import { PlusIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"

/** 分组模式渲染组头与折叠；经典模式只按同一顺序展平，不渲染组头。 */
export type CardManagerViewMode = "grouped" | "classic"

/**
 * 管理器的操作区。S2 只有「新建名片」与「分组 / 经典」两态切换；
 * 编辑模式、分享与批量操作是 S3 / S5 的事，这里不预留占位。
 */
export function CardManagerToolbar({
  mode,
  onModeChange,
  readOnly,
  onCreate,
}: {
  mode: CardManagerViewMode
  onModeChange: (mode: CardManagerViewMode) => void
  readOnly: boolean
  onCreate: () => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ToggleGroup
        value={[mode]}
        variant="outline"
        spacing={0}
        aria-label="名片展示方式"
        onValueChange={(values) => {
          const next = values[0]
          if (next === "grouped" || next === "classic") onModeChange(next)
        }}
      >
        <ToggleGroupItem value="grouped">分组</ToggleGroupItem>
        <ToggleGroupItem value="classic">经典</ToggleGroupItem>
      </ToggleGroup>
      <Button type="button" size="sm" disabled={readOnly} onClick={onCreate}>
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        新建名片
      </Button>
    </div>
  )
}
