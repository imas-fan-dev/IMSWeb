import {
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  Share2Icon,
} from "lucide-react"
import { useId, useState, type Ref } from "react"

import { Button } from "~/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { quickShareTarget, SHARE_EMPTY_HINT } from "../card-share-model"
import { CardShareDialog } from "./card-share-dialog"

/**
 * 分组模式渲染组头与折叠；经典模式不渲染组头，瓦片按**创建时间降序**排
 * （`sortCardsByCreatedAtDesc`；不是分组顺序展平）。
 */
export type CardManagerViewMode = "grouped" | "classic"

/**
 * 「分组 / 经典」切换。位置**由调用方决定**：移动端在标题行（我的名片 + N 张名片 那一行），
 * 桌面在控件区最左侧（动作按钮靠右）。**编辑模式下不渲染**（不是禁用）——编辑只发生在分组
 * 视图里，经典模式点「编辑模式」会先自动切回分组（见 `CardManager.startEditing`）。
 */
export function CardManagerModeToggle({
  mode,
  onModeChange,
}: {
  mode: CardManagerViewMode
  onModeChange: (mode: CardManagerViewMode) => void
}) {
  return (
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
  )
}

/**
 * 管理器的动作区：新建名片，以及编辑模式下的选择集操作与显式保存。
 *
 * 编辑模式是草稿会话（§12）：切换由调用方负责脏标记确认，这里只发意图。
 * 编辑模式里**不渲染**「新建名片」（会话里新建的卡不进这次草稿，默认分组里的落点会整体错位，
 * 所以不是禁用而是不给入口）。
 */
export function CardManagerToolbar({
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
  editButtonRef,
  shareHandle,
  quickCount,
}: {
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
  /** 保存成功后焦点要回到这个按钮（设计 §11）。 */
  editButtonRef?: Ref<HTMLButtonElement>
  /** 分享链接里的 handle（公开主页地址或数字编号）。 */
  shareHandle: string
  /** 生效的快速清单张数；为 0 时分享按钮只出引导 tooltip。 */
  quickCount: number
}) {
  const editReasonId = useId()
  const editBlocked = Boolean(editDisabledReason)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareHintOpen, setShareHintOpen] = useState(false)
  const shareable = quickCount > 0
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
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
            清空
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
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
            ref={editButtonRef}
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
          {/*
            分享入口**只在读模式出现**：编辑模式那一支里没有它（不是禁用）——会话里的布局与
            快速清单还是草稿，此刻扫出去的清单会与用户马上要保存的结果不一致。
            快速清单为空时没有可分享的清单，按钮只出引导 tooltip（hover/focus/click 都能出），
            点了也不开面板。
          */}
          {shareable ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShareOpen(true)}
            >
              <Share2Icon data-icon="inline-start" aria-hidden="true" />
              分享名片
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip open={shareHintOpen} onOpenChange={setShareHintOpen}>
                <TooltipTrigger
                  // 点一下也算「想看引导」：有些浏览器（如 macOS Safari）点击按钮不会聚焦，
                  // 只靠 focus 触发的话点了没反应。`closeOnClick={false}` 让这次点击不会
                  // 立刻把 tooltip 关掉。
                  closeOnClick={false}
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShareHintOpen(true)}
                    />
                  }
                >
                  <Share2Icon data-icon="inline-start" aria-hidden="true" />
                  分享名片
                </TooltipTrigger>
                <TooltipContent>{SHARE_EMPTY_HINT}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button
            type="button"
            size="sm"
            disabled={readOnly}
            onClick={onCreate}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            新建名片
          </Button>
        </>
      )}
      <CardShareDialog
        target={quickShareTarget(shareHandle)}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </div>
  )
}
