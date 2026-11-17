import { DndContext, DragOverlay } from "@dnd-kit/core"
import {
  rectSortingStrategy,
  SortableContext,
  verticalListSortingStrategy,
  type SortingStrategy,
} from "@dnd-kit/sortable"
import { NAMECARD_PROFILE_GROUP_LIMIT } from "@imsweb/contracts/namecards/runtime"
import { FileImageIcon, PlusIcon } from "lucide-react"
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

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
  buildDraftCardGroups,
  canCreateCardGroup,
  cardGroupKey,
  cardGroupSortableId,
  cardSettingsToPatches,
  collectCardSettings,
  DEFAULT_CARD_GROUP_KEY,
  effectiveCardVisible,
  effectiveExchangeMode,
  flattenCardGroups,
  isCardSelectable,
  quickCardIdSet,
  type CardGroupView,
  type CardManagerCardPatches,
  type DraftCardGroup,
} from "./card-manager-model"
import { cardTileGridClassName } from "./card-tile"
import { CardBulkActions } from "./components/card-bulk-actions"
import { CardDragLayer } from "./components/card-drag-layer"
import {
  CardDragGhostSlots,
  CardDragGhostStack,
} from "./components/card-drag-ghost"
import { CardGroupSection } from "./components/card-group-section"
import { CardGroupTitleInput } from "./components/card-group-title-input"
import {
  CardManagerToolbar,
  type CardManagerViewMode,
} from "./components/card-manager-toolbar"
import { SortableCardTile } from "./components/sortable-card-tile"
import { useCardGridFlip } from "./hooks/use-card-grid-flip"
import { useCardManagerDraft } from "./hooks/use-card-manager-draft"
import { useCardManagerDrag } from "./hooks/use-card-manager-drag"
import { useCardManagerSave } from "./hooks/use-card-manager-save"
import { useCollapsedCardGroups } from "./hooks/use-collapsed-card-groups"

/**
 * 卡片网格的「不位移」排序策略：多选拖动（批次 ≥ 2）时它就位——因为那一刻整批名片已经从
 * 列表里移出去、落点位置由一个真的 ghost 占住了，位移的唯一来源必须是 ghost。
 * 两套位移叠加的表现就是「瓦片前后各有一处空白」、列表错位甚至溢出（2026-11-17 用户实测）。
 *
 * 单张拖动仍用 `rectSortingStrategy`：那种情况下不插 ghost，让出的空位由 dnd-kit 负责。
 */
const NO_SHIFT_SORTING_STRATEGY: SortingStrategy = () => null

/**
 * 属主名片管理器：工具栏 + 批量操作 + 分组 + 瓦片。
 *
 * 只读模式的分组与顺序以服务端归一后的布局为准（§4.1）；编辑模式改的是**布局草稿**
 * （`useCardManagerDraft` 里的 `layoutDraft`），拖拽与建组都先落草稿，点保存才整份提交。
 * 分组模式下每个分组有组头与折叠；经典模式只是不渲染组头、把同一份顺序展平，两种状态的
 * 切换走 View Transition（不支持时立即切换，见 `applyLayout`）。
 *
 * 拖拽只在**分组模式**里开（§7.3）：经典模式没有分组落点，展平列表里的落点含义不明确，
 * 所以那一侧只保留勾选与批量操作。拖动期间不起 View Transition（设计 §10.1），落位后由
 * React 按新顺序直接渲染。
 */
export function CardManager({
  cards,
  layout,
  accountId,
  selectedCardId,
  readOnly,
  shareHandle,
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
  /** 分享链接里的 handle（公开主页地址或数字编号）。 */
  shareHandle: string
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
  /** 「+ 新建分组」按下之后，默认分组下方出现标题输入区（§7.2）。 */
  const [creatingGroup, setCreatingGroup] = useState(false)
  /** 瓦片清单容器：批量插入的 FLIP（`useCardGridFlip`）要在它里面量瓦片位置。 */
  const cardGridRef = useRef<HTMLElement | null>(null)

  const draft = useCardManagerDraft({ cards, layout })
  const { collapsedKeys, toggleCollapsed, pruneCollapsedKeys } =
    useCollapsedCardGroups(accountId)
  // 解构出稳定的引用：`draft` 每次渲染都是新对象，直接读成员会让 useCallback
  // 每帧都换新（依赖告警也来自这里）。
  const { editing, hasChanges, resetDraft, startEditing: beginEditing } = draft

  /**
   * 退出 / 重置编辑会话：折叠态收窄到**服务端已保存的分组**。新建分组用的 `local:N`
   * 键每会话都从 1 重号，上一会话留下的折叠态不清掉，这一会话新建的组会一出生就折叠着。
   */
  const endEditingSession = useCallback(
    (nextLayout: NamecardCardLayout | null) => {
      if (nextLayout) {
        pruneCollapsedKeys(nextLayout.groups.map((group) => group.id))
      }
      resetDraft(nextLayout)
    },
    [pruneCollapsedKeys, resetDraft]
  )

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
      endEditingSession(saved)
      onLayoutSaved(saved, patches)
    },
  })

  useEffect(() => {
    onDirtyChange?.(draft.hasChanges)
  }, [draft.hasChanges, onDirtyChange])

  /** 编辑模式下的布局草稿渲染结构；不在编辑模式时为 `null`。 */
  const draftGroups = useMemo<DraftCardGroup[] | null>(
    () =>
      draft.layoutDraft ? buildDraftCardGroups(cards, draft.layoutDraft) : null,
    [cards, draft.layoutDraft]
  )
  const readGroups = useMemo(
    () => buildCardGroups(cards, layout),
    [cards, layout]
  )
  const groups: readonly CardGroupView[] = draftGroups ?? readGroups
  const flatCards = useMemo(() => flattenCardGroups(groups), [groups])
  // 角标跟草稿走：加入/移出与改交换模式立刻反映到瓦片上，不必等保存。
  const quickCardIds = useMemo(
    () => quickCardIdSet(cards, draft.quickCardNumbers),
    [cards, draft.quickCardNumbers]
  )

  // 布局读不到时不许进编辑模式：保存会把 `groups: []` / `defaultCardNumbers: []` 整份
  // 覆盖到服务端，清空用户已有的分组与顺序，而且 `limit` 未知、超限阻断也失效。
  const editDisabledReason =
    layout === null ? "读不到名片布局，刷新页面后再试。" : null
  const startEditing = useCallback(() => {
    if (layout === null) return
    // 每次进编辑模式都从「没有在建组」开始：退出/切换模式时会丢掉这个输入区，
    // 状态也就跟着会话一起重置，不必再用 effect 去追状态。
    setCreatingGroup(false)
    // 上一会话留下的 `local:N` 折叠态会串到这一会话新建的分组上，进来先清掉。
    pruneCollapsedKeys(layout.groups.map((group) => group.id))
    beginEditing()
  }, [beginEditing, layout, pruneCollapsedKeys])

  /** 拖拽、建组、折叠只发生在分组模式；经典模式是同一顺序的展平视图。 */
  const layoutEditing = editing && mode === "grouped"
  const canAddGroup = canCreateCardGroup(draft.layoutDraft?.groups ?? [])

  const drag = useCardManagerDrag({
    cards,
    groups: draftGroups ?? [],
    // 指针追踪只在「编辑模式的分组视图」里挂着（拖着卡片才需要落点几何）。
    enabled: layoutEditing,
    selectedCardIds: draft.selectedCardIds,
    onMoveCards: draft.moveCards,
    onReorderCardGroups: draft.reorderCardGroups,
  })

  /**
   * 批量插入时的瓦片位移（手写 FLIP）。多选拖动那一刻没有 dnd-kit 的排序位移
   * （`NO_SHIFT_SORTING_STRATEGY`），被顶开的瓦片得自己动起来：会话边界就是
   * 「整批真的在拖」（`draggedCardIds`）。
   */
  useCardGridFlip({
    rootRef: cardGridRef,
    enabled: layoutEditing,
    active: drag.draggedCardIds.size > 0,
  })

  function changeMode(next: CardManagerViewMode) {
    // 经典模式没有分组界面，没提交的建组输入区跟着收起（草稿本身留着）。
    setCreatingGroup(false)
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
    endEditingSession(layout)
  }, [endEditingSession, hasChanges, layout, save.saving])

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

  const renderTile = (card: FudabaOwnerCard) => (
    <SortableCardTile
      key={card.id}
      // 可拖拽资格与可勾选一致（§8）：整卡 `published`、在编辑模式的分组视图里。
      draggable={layoutEditing && isCardSelectable(card)}
      card={card}
      inQuickExchange={quickCardIds.has(card.id)}
      hidden={!effectiveCardVisible(card, draft.cardSettings)}
      exchangeMode={effectiveExchangeMode(card, draft.cardSettings)}
      selected={selectedCardId === card.id}
      editing={editing}
      checked={draft.selectedCardIds.has(card.id)}
      onSelect={() => {
        if (editing) draft.toggleSelected(card.id)
        else onSelect(card.id)
      }}
    />
  )

  /**
   * 多选拖动（批次 ≥ 2）时的落点 ghost：那一批名片已经整体移出列表
   * （`drag.draggedCardIds`），所以在落点下标处插一个合集 ghost 占住位置。
   * `preview.index` 的口径与 `moveCards` 一致（**整批移出之后**的列表下标，解析落点时
   * 已经按同一份列表算过），所以 ghost 插在哪儿、松手就落在哪儿，不再需要夹取。
   *
   * 未展开时是一摞真实缩略图（占 1 格），停顿后展开成 N 个瓦片副本（占 N 格）。
   */
  function renderDropGhost(
    groupKey: string
  ): { index: number; nodes: ReactNode; cells: number } | null {
    const preview = drag.cardDropPreview
    if (!preview || preview.groupKey !== groupKey) return null
    const cards = drag.activeCards
    if (!cards.length) return null
    return {
      index: preview.index,
      // 插进 keyed 的瓦片数组里，所以自己也得有 key（一个分组里最多一个落点 ghost）。
      nodes: preview.expanded ? (
        <CardDragGhostSlots key="drop-ghost" cards={cards} />
      ) : (
        <CardDragGhostStack key="drop-ghost" cards={cards} />
      ),
      cells: preview.expanded ? cards.length : 1,
    }
  }

  /**
   * 分组放置区里的瓦片。
   *
   * 单张拖动沿用 dnd-kit 的排序位移（`rectSortingStrategy`），这里只渲染真实瓦片。
   * 多选拖动时整批名片已经移出列表、落点位置由 ghost 占住（`renderDropGhost`），
   * 因此换成**不位移**的策略：ghost 是那一刻唯一的位移来源，两套叠加必然错位
   * （2026-11-17 用户实测「瓦片前后各有一处空白」、列表错位甚至溢出）。
   */
  function renderGroupTiles(
    visibleCards: readonly FudabaOwnerCard[],
    ghost: { index: number; nodes: ReactNode } | null
  ): ReactNode {
    const tiles: ReactNode[] = visibleCards.map(renderTile)
    if (ghost) tiles.splice(ghost.index, 0, ghost.nodes)
    return layoutEditing ? (
      <SortableContext
        items={visibleCards.map((card) => card.id)}
        strategy={ghost ? NO_SHIFT_SORTING_STRATEGY : rectSortingStrategy}
      >
        {tiles}
      </SortableContext>
    ) : (
      tiles
    )
  }

  // 分组模式保留组头与折叠；经典模式只换容器，瓦片顺序（`flattenCardGroups`）不变。
  // 两种模式共用一个具名容器：e2e 与读屏都靠「我的名片清单」找到整个列表。
  const groupedGroups = draftGroups ?? readGroups
  const groupSortableIds = layoutEditing
    ? groupedGroups
        .filter((group) => group.title !== null)
        .map((group) => cardGroupSortableId(cardGroupKey(group)))
    : []

  const cardList =
    mode === "grouped" ? (
      <nav
        ref={cardGridRef}
        className="mt-4 flex flex-col gap-6"
        aria-label="我的名片清单"
      >
        <SortableContext
          items={groupSortableIds}
          strategy={verticalListSortingStrategy}
        >
          {groupedGroups.map((group) => {
            // 草稿渲染结构里默认分组永远第一，所以「新建分组」的输入区插在它下面（§7.2）。
            const key = cardGroupKey(group)
            const named = group.title !== null
            // 多选拖动中整批名片已经离开每一张列表（`draggedCardIds`），落点由 ghost 占位。
            const visibleCards = group.cards.filter(
              (card) => !drag.draggedCardIds.has(card.id)
            )
            const ghost = renderDropGhost(key)
            return (
              <Fragment key={key}>
                <CardGroupSection
                  group={group}
                  // 计数就是这一刻真的渲染出来的瓦片数（拖动中批次已整体移出）。
                  tileCount={visibleCards.length}
                  // 落点 ghost 也和真实瓦片一样撑起放置区，所以有它时不该再出空分组提示。
                  ghostCount={ghost?.cells ?? 0}
                  collapsed={collapsedKeys.has(key)}
                  onToggleCollapsed={() => toggleGroup(key)}
                  editing={layoutEditing}
                  onRename={
                    named
                      ? (title) => draft.renameCardGroup(key, title)
                      : undefined
                  }
                  onRemove={
                    // 删组不是破坏性操作：组内名片退回默认分组，且只是草稿，没保存就还在。
                    named ? () => draft.removeCardGroup(key) : undefined
                  }
                >
                  {renderGroupTiles(visibleCards, ghost)}
                </CardGroupSection>
                {layoutEditing &&
                creatingGroup &&
                key === DEFAULT_CARD_GROUP_KEY ? (
                  <CardGroupTitleInput
                    autoFocus
                    label="新分组名称"
                    placeholder="输入分组名称"
                    onSubmit={(title) => {
                      draft.createCardGroup(title)
                      setCreatingGroup(false)
                    }}
                    onCancel={() => setCreatingGroup(false)}
                  />
                ) : null}
              </Fragment>
            )
          })}
        </SortableContext>
      </nav>
    ) : (
      <nav
        className={cn("mt-4", cardTileGridClassName)}
        aria-label="我的名片清单"
      >
        {flatCards.map(renderTile)}
      </nav>
    )

  /** 编辑模式下才需要 dnd 上下文（落点、Overlay、读屏播报都在里面）。 */
  const dndList = editing ? (
    <DndContext {...drag.dnd}>
      {cardList}
      <DragOverlay>
        {drag.activeCards.length ? (
          <CardDragLayer cards={drag.activeCards} />
        ) : null}
      </DragOverlay>
    </DndContext>
  ) : (
    cardList
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
            shareHandle={shareHandle}
            quickCount={draft.quickCardNumbers.length}
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

      {layoutEditing ? (
        creatingGroup ? null : (
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full border-dashed"
            disabled={!canAddGroup}
            title={
              canAddGroup
                ? undefined
                : `最多 ${NAMECARD_PROFILE_GROUP_LIMIT} 个分组`
            }
            onClick={() => setCreatingGroup(true)}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            新建分组
          </Button>
        )
      ) : null}

      {cards.length ? (
        // 只读模式不挂 `DndContext`：没有拖拽可做，页面结构也就和改造前逐字一致
        // （dnd-kit 的钩子在context 之外是安全的空实现，见 `SortableCardTile`）。
        dndList
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
              退出编辑模式后，本次的分组、顺序、批量改动与快速清单调整都会丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              onClick={() => {
                endEditingSession(layout)
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
              <AlertDialogAction type="button" onClick={save.dismissOverLimit}>
                返回调整
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  )
}
