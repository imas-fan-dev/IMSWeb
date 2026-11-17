import { LoaderCircleIcon, PencilIcon, PlusIcon } from "lucide-react"
import { useId } from "react"

import { Button } from "~/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"

/** 分组模式渲染组头与折叠；经典模式只按同一顺序展平，不渲染组头。 */
export type CardManagerViewMode = "grouped" | "classic"

/**
 * 管理器的操作区：展示方式、新建名片，以及编辑模式下的选择集操作与显式保存。
 *
 * 编辑模式是草稿会话（§12）：切换由调用方负责脏标记确认，这里只发意图。
 */
export function CardManagerToolbar({
  mode,
  onModeChange,
  readOnly,
  onCreate,
  editing,
  onStartEditing,
  onExitEditing,
  selectedCount,
  selectableCount,
  onSelectAll,
  onClearSelection,
  onSave,
  saving,
  canSave,
  editDisabledReason,
}: {
  mode: CardManagerViewMode
  onModeChange: (mode: CardManagerViewMode) => void
  readOnly: boolean
  onCreate: () => void
  editing: boolean
  onStartEditing: () => void
  onExitEditing: () => void
  selectedCount: number
  /** 当前可勾选的卡有几张；为 0 时「全选」没有意义。 */
  selectableCount: number
  onSelectAll: () => void
  onClearSelection: () => void
  onSave: () => void
  saving: boolean
  /** 有未保存改动（且不在保存中）时才可保存。 */
  canSave: boolean
  /** 编辑模式不可用时（例如布局读失败）给出原因，禁用按钮并讲清楚。 */
  editDisabledReason?: string | null
}) {
  const editReasonId = useId()
  const editBlocked = Boolean(editDisabledReason)
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
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
      {editing ? (
        <>
          <span className="text-sm text-muted-foreground">
            {`已选 ${selectedCount} 张`}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selectableCount === 0}
            onClick={onSelectAll}
          >
            全选
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selectedCount === 0}
            onClick={onClearSelection}
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={onExitEditing}
          >
            退出编辑
          </Button>
          <Button type="button" size="sm" disabled={!canSave} onClick={onSave}>
            {saving ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : null}
            保存
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={readOnly || editBlocked}
            aria-describedby={editBlocked ? editReasonId : undefined}
            title={editDisabledReason ?? undefined}
            onClick={onStartEditing}
          >
            <PencilIcon data-icon="inline-start" aria-hidden="true" />
            编辑模式
          </Button>
          {editDisabledReason ? (
            <span id={editReasonId} className="sr-only">
              {editDisabledReason}
            </span>
          ) : null}
        </>
      )}
      <Button type="button" size="sm" disabled={readOnly} onClick={onCreate}>
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        新建名片
      </Button>
    </div>
  )
}
