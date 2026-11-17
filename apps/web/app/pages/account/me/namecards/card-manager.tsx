import { FileImageIcon, PlusIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import type { FudabaOwnerCard, NamecardCardLayout } from "~/lib/api"
import { cn } from "~/lib/utils"
import {
  applyLayout,
  buildCardGroups,
  cardGroupKey,
  cardSettingsToPatches,
  collectCardSettings,
  effectiveCardVisible,
  effectiveExchangeMode,
  flattenCardGroups,
  quickCardIdSet,
  type CardManagerCardPatches,
} from "./card-manager-model"
import { CardTile, cardTileGridClassName } from "./card-tile"
import { CardBulkActions } from "./components/card-bulk-actions"
import { CardGroupSection } from "./components/card-group-section"
import {
  CardManagerToolbar,
  type CardManagerViewMode,
} from "./components/card-manager-toolbar"
import { useCardManagerDraft } from "./hooks/use-card-manager-draft"
import { useCardManagerSave } from "./hooks/use-card-manager-save"
import { useCollapsedCardGroups } from "./hooks/use-collapsed-card-groups"

/**
 * 属主名片管理器：工具栏 + 批量操作 + 分组 + 瓦片。
 *
 * 分组与顺序都以服务端归一后的布局为准（§4.1）：这里只做展示合成，不改数据。
 * 分组模式下每个分组有组头与折叠；经典模式只是不渲染组头、把同一份顺序展平，
 * 两种状态的切换走 View Transition（不支持时立即切换，见 `applyLayout`）。
 *
 * 编辑模式是草稿会话（§12）：勾选与批量操作先落 `useCardManagerDraft`，显式保存才发一次
 * `PUT /me/cards/layout`；保存成功后用响应覆盖布局、清脏并退出编辑。
 */
export function CardManager({
  cards,
  layout,
  accountId,
  selectedCardId,
  readOnly,
  onSelect,
  onCreate,
  onLayoutSaved,
  onDirtyChange,
}: {
  cards: FudabaOwnerCard[]
  /** 服务端归一后的布局；读失败时为 `null`，退化成「只有默认分组」。 */
  layout: NamecardCardLayout | null
  /** 折叠状态按账号隔离存在本地。 */
  accountId: string | null
  selectedCardId: string | null
  readOnly: boolean
  onSelect: (cardId: string) => void
  onCreate: () => void
  /**
   * 保存成功后把服务端归一后的布局与**只含差异**的卡片字段写回上层；
   * 上层用函数式合并套到最新列表上，请求在飞期间新建/删除的卡不受影响。
   */
  onLayoutSaved: (
    layout: NamecardCardLayout,
    patches: CardManagerCardPatches
  ) => void
  /** 草稿有没有未保存改动；上层用它决定「刷新/重载前先确认」。 */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [mode, setMode] = useState<CardManagerViewMode>("grouped")
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmQuickJoin, setConfirmQuickJoin] = useState(false)

  const draft = useCardManagerDraft({ cards, layout })
  const save = useCardManagerSave({
    source: {
      buildRequest: draft.buildRequest,
      quickCount: draft.quickCardNumbers.length,
      limit: draft.limit,
      hasChanges: draft.hasChanges,
    },
    onSaved: (saved) => {
      // 布局响应不带批量字段，所以把请求里那份差异交给上层合并（不要用卡片快照整份覆盖）。
      const patches = cardSettingsToPatches(
        collectCardSettings(cards, draft.cardSettings)
      )
      draft.resetDraft(saved)
      onLayoutSaved(saved, patches)
    },
  })

  useEffect(() => {
    onDirtyChange?.(draft.hasChanges)
  }, [draft.hasChanges, onDirtyChange])

  const groups = useMemo(() => buildCardGroups(cards, layout), [cards, layout])
  const flatCards = useMemo(() => flattenCardGroups(groups), [groups])
  // 角标跟草稿走：加入/移出与改交换模式立刻反映到瓦片上，不必等保存。
  const quickCardIds = useMemo(
    () => quickCardIdSet(cards, draft.quickCardNumbers),
    [cards, draft.quickCardNumbers]
  )
  const { collapsedKeys, toggleCollapsed } = useCollapsedCardGroups(accountId)

  const renderTile = (card: FudabaOwnerCard) => (
    <CardTile
      key={card.id}
      card={card}
      inQuickExchange={quickCardIds.has(card.id)}
      hidden={!effectiveCardVisible(card, draft.cardSettings)}
      exchangeMode={effectiveExchangeMode(card, draft.cardSettings)}
      selected={selectedCardId === card.id}
      editing={draft.editing}
      checked={draft.selectedCardIds.has(card.id)}
      onSelect={() => {
        if (draft.editing) draft.toggleSelected(card.id)
        else onSelect(card.id)
      }}
    />
  )

  // 布局读不到时不许进编辑模式：保存会把 `groups: []` / `defaultCardNumbers: []` 整份
  // 覆盖到服务端，清空用户已有的分组与顺序，而且 `limit` 未知、超限阻断也失效。
  const editDisabledReason =
    layout === null ? "读不到名片布局，刷新页面后再试。" : null
  // 解构出稳定的引用：`draft` 每次渲染都是新对象，直接读成员会让下面的 useCallback
  // 每帧都换新（依赖告警也来自这里）。
  const {
    editing,
    hasChanges,
    resetDraft,
    startEditing: beginEditing,
  } = draft
  const startEditing = useCallback(() => {
    if (layout === null) return
    beginEditing()
  }, [beginEditing, layout])

  function changeMode(next: CardManagerViewMode) {
    // 用函数式更新读取「当前」模式：View Transition 会把提交推迟到回调里，
    // 同一帧内连点两下时闭包里的 `mode` 还是旧值，闭包守卫会误判。
    applyLayout(() => setMode((current) => (current === next ? current : next)))
  }

  function toggleGroup(key: string) {
    applyLayout(() => toggleCollapsed(key))
  }

  /** 退出编辑（§7.1）：有未保存改动时先确认，没有就直接清选择并退出。 */
  const exitEditing = useCallback(() => {
    if (save.saving) return
    if (hasChanges) {
      setConfirmDiscard(true)
      return
    }
    resetDraft(layout)
  }, [hasChanges, layout, resetDraft, save.saving])

  // `Esc` 退出编辑（§7.1）。任何弹框打开或正在保存时都不响应，免得和
  // AlertDialog 自己的 Esc 处理打架、或在半路写请求时把草稿丢掉。
  useEffect(() => {
    if (!editing) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (confirmDiscard || confirmQuickJoin || save.overLimit || save.saving) {
        return
      }
      exitEditing()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    confirmDiscard,
    confirmQuickJoin,
    editing,
    exitEditing,
    save.overLimit,
    save.saving,
  ])

  /**
   * 加入快速清单（§8）：选中里有 `manual`/`none` 时先弹确认，确认后把它们改成
   * 自动交换再一并加入；取消则整批不加入。
   */
  function addSelectedToQuickList() {
    if (draft.quickJoinNeedsAutoCount > 0) {
      setConfirmQuickJoin(true)
      return
    }
    draft.addSelectionToQuickList()
  }

  function confirmAddToQuickList() {
    draft.applyCardSettings(draft.selectedCardIds, { exchangeMode: "auto" })
    draft.addSelectionToQuickList()
    setConfirmQuickJoin(false)
  }

  // 分组模式保留组头与折叠；经典模式只换容器，瓦片顺序（`flattenCardGroups`）不变。
  // 两种模式共用一个具名容器：e2e 与读屏都靠「我的名片清单」找到整个列表。
  const cardList =
    mode === "grouped" ? (
      <nav className="mt-4 flex flex-col gap-6" aria-label="我的名片清单">
        {groups.map((group) => {
          const key = cardGroupKey(group)
          return (
            <CardGroupSection
              key={key}
              group={group}
              collapsed={collapsedKeys.has(key)}
              onToggleCollapsed={() => toggleGroup(key)}
            >
              {group.cards.map(renderTile)}
            </CardGroupSection>
          )
        })}
      </nav>
    ) : (
      <nav
        className={cn("mt-4", cardTileGridClassName)}
        aria-label="我的名片清单"
      >
        {flatCards.map(renderTile)}
      </nav>
    )

  return (
    <section aria-labelledby="owned-card-list-title">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="owned-card-list-title" className="text-base font-medium">
            我的名片
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {cards.length} 张名片
          </p>
        </div>
        {cards.length ? (
          <CardManagerToolbar
            mode={mode}
            onModeChange={changeMode}
            readOnly={readOnly}
            onCreate={onCreate}
            editing={draft.editing}
            onStartEditing={startEditing}
            onExitEditing={exitEditing}
            selectedCount={draft.selectedCards.length}
            selectableCount={draft.selectableCount}
            onSelectAll={draft.selectAll}
            onClearSelection={draft.clearSelection}
            onSave={save.save}
            saving={save.saving}
            canSave={draft.hasChanges && !save.saving}
            editDisabledReason={editDisabledReason}
          />
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={readOnly}
            onClick={onCreate}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            新建名片
          </Button>
        )}
      </div>

      {draft.editing ? (
        <CardBulkActions
          selectedCount={draft.selectedCards.length}
          quickCount={draft.quickCardNumbers.length}
          limit={draft.limit}
          skippedGroupCardCount={draft.selectedGroupCardCount}
          onSetVisibility={(visible) =>
            draft.applyCardSettings(draft.selectedCardIds, { visible })
          }
          onSetExchangeMode={(exchangeMode) =>
            draft.applyCardSettings(draft.selectedCardIds, { exchangeMode })
          }
          onQuickAdd={addSelectedToQuickList}
          onQuickRemove={draft.removeSelectionFromQuickList}
        />
      ) : null}

      {cards.length ? (
        cardList
      ) : (
        <Empty className="mt-4 min-h-44 border-y">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileImageIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>还没有交换名片</EmptyTitle>
            <EmptyDescription>
              {readOnly
                ? "名片创建开放后，可以在这里建立双面名片。"
                : "建立第一张双面名片，保存后会先进入草稿状态。"}
            </EmptyDescription>
          </EmptyHeader>
          {!readOnly ? (
            <Button type="button" variant="outline" onClick={onCreate}>
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              新建名片
            </Button>
          ) : null}
        </Empty>
      )}

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的改动？</AlertDialogTitle>
            <AlertDialogDescription>
              退出编辑模式后，本次的批量改动与快速清单调整都会丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              onClick={() => {
                draft.resetDraft(layout)
                setConfirmDiscard(false)
              }}
            >
              放弃改动
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmQuickJoin} onOpenChange={setConfirmQuickJoin}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>先改成自动确认？</AlertDialogTitle>
            <AlertDialogDescription>
              {`已选名片中有 ${draft.quickJoinNeedsAutoCount} 张不是自动交换，加入快速交换清单前会把它们改为自动确认。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={confirmAddToQuickList}>
              确认加入
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {save.overLimit ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) save.dismissOverLimit()
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {`快速交换最多 ${save.overLimit.limit} 张`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {`当前 ${save.overLimit.count} 张，请先移出一些名片再保存。`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                type="button"
                onClick={save.dismissOverLimit}
              >
                返回调整
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  )
}
