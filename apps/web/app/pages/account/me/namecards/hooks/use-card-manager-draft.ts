import { useCallback, useEffect, useMemo, useState } from "react"

import type { FudabaOwnerCard, NamecardCardLayout } from "~/lib/api"
import {
  addPendingCardGroup as addPendingCardGroupInDraft,
  buildCardLayoutRequest,
  createCardLayoutDraft,
  effectiveExchangeMode,
  effectiveQuickCardNumbers,
  isCardManagerDraftDirty,
  moveCards as moveCardsInDraft,
  removeCardGroup as removeCardGroupInDraft,
  renameCardGroup as renameCardGroupInDraft,
  reorderCardGroups as reorderCardGroupsInDraft,
  sameCardLayoutDraft,
  selectableCardIds,
  settleCardGroupTitle as settleCardGroupTitleInDraft,
  type CardManagerCardSetting,
  type CardManagerCardSettings,
  type CardManagerLayoutDraft,
  type CardMoveTarget,
} from "../card-manager-model"

/**
 * 编辑模式是**草稿会话**（§12）：布局、快速清单与批量字段先落本地，点保存才整份提交。
 * 这里只管草稿，请求与失败处理在 `use-card-manager-save`。
 *
 * 布局草稿（`layoutDraft`）在**进入编辑模式时**由「已加载的布局 + 手上的卡」materialize 出来：
 * 结构与只读渲染逐字一致（含「布局里还没出现过的卡补进默认分组最前」），所以拖拽落点下标
 * 可以直接用在草稿上。同时留一份 `baselineDraft` 做脏标记基准——草稿一开始就跟服务端布局
 * 有字形上的差别（那批补进默认分组的卡），拿服务端布局当基准会一进编辑模式就「有改动」。
 */
export function useCardManagerDraft({
  cards,
  layout,
}: {
  cards: readonly FudabaOwnerCard[]
  /** 服务端归一后的布局；读失败时为 `null`。 */
  layout: NamecardCardLayout | null
}) {
  const [editing, setEditing] = useState(false)
  const [quickCardNumbers, setQuickCardNumbers] = useState<readonly number[]>(
    () => layout?.quickCardNumbers ?? []
  )
  const [cardSettings, setCardSettings] = useState<CardManagerCardSettings>({})
  const [rawSelectedCardIds, setRawSelectedCardIds] = useState<
    ReadonlySet<string>
  >(() => new Set())
  /** 编辑会话里的布局草稿；不在编辑模式时为 `null`。 */
  const [layoutDraft, setLayoutDraft] = useState<CardManagerLayoutDraft | null>(
    null
  )
  /** 进入编辑模式那一刻的布局草稿：脏标记只比较它，不比较服务端布局（见上）。 */
  const [baselineDraft, setBaselineDraft] =
    useState<CardManagerLayoutDraft | null>(null)

  const selectableIds = useMemo(
    () => new Set(selectableCardIds(cards)),
    [cards]
  )
  const selectableCount = selectableIds.size

  // 「生效选择集」直接派生：列表刷新（新建、删除、状态变化）后失效的 id 自然不生效，
  // 不需要在 effect 里同步修剪（那样会触发级联渲染）。
  const selectedCardIds = useMemo(
    () =>
      new Set(
        [...rawSelectedCardIds].filter((cardId) => selectableIds.has(cardId))
      ),
    [rawSelectedCardIds, selectableIds]
  )

  const effectiveQuick = useMemo(
    () => effectiveQuickCardNumbers(quickCardNumbers, cards, cardSettings),
    [quickCardNumbers, cards, cardSettings]
  )

  const layoutChanged = useMemo(
    () =>
      layoutDraft !== null &&
      baselineDraft !== null &&
      !sameCardLayoutDraft(layoutDraft, baselineDraft),
    [baselineDraft, layoutDraft]
  )

  const hasChanges = useMemo(
    () =>
      isCardManagerDraftDirty({
        cards,
        layout,
        quickCardNumbers,
        cardSettings,
        layoutChanged,
      }),
    [cards, layout, layoutChanged, quickCardNumbers, cardSettings]
  )

  const selectedCards = useMemo(
    () => cards.filter((card) => selectedCardIds.has(card.id)),
    [cards, selectedCardIds]
  )
  const selectedGroupCardCount = useMemo(
    () => selectedCards.filter((card) => card.isGroupCard).length,
    [selectedCards]
  )
  /** 选中里不是自动交换的卡：加入快速清单前要弹窗确认并改成 `auto`。 */
  const quickJoinNeedsAutoCount = useMemo(
    () =>
      selectedCards.filter(
        (card) =>
          !card.isGroupCard &&
          effectiveExchangeMode(card, cardSettings) !== "auto"
      ).length,
    [cardSettings, selectedCards]
  )

  // 有未保存改动时拦住关页/刷新（§12）。路由内的离开由退出确认弹窗负责。
  useEffect(() => {
    if (!hasChanges) return
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Chrome 只有设置了 `returnValue` 才会弹原生确认框。
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", guard)
    return () => window.removeEventListener("beforeunload", guard)
  }, [hasChanges])

  /**
   * 进入编辑模式：以当前的布局 + 卡片 materialize 一份布局草稿（连同它的基准副本）。
   * 每次都重建，这样别处刷新过卡片/布局之后进来拿到的仍是最新的一份。
   */
  const startEditing = useCallback(() => {
    const draft = createCardLayoutDraft(cards, layout)
    setLayoutDraft(draft)
    setBaselineDraft(draft)
    setEditing(true)
  }, [cards, layout])

  /**
   * 用一份布局重置草稿并退出编辑：保存成功时传响应（服务端归一后的布局），
   * 放弃改动时传当前布局。
   */
  const resetDraft = useCallback((nextLayout: NamecardCardLayout | null) => {
    setQuickCardNumbers(nextLayout?.quickCardNumbers ?? [])
    setCardSettings({})
    setRawSelectedCardIds(new Set())
    setLayoutDraft(null)
    setBaselineDraft(null)
    setEditing(false)
  }, [])

  /**
   * 布局草稿的写入口：不在编辑模式（没有草稿）时原样不动，调用方不必自己判空。
   */
  const updateLayoutDraft = useCallback(
    (update: (draft: CardManagerLayoutDraft) => CardManagerLayoutDraft) => {
      setLayoutDraft((current) => (current ? update(current) : current))
    },
    []
  )

  /**
   * 一步新建（§7.2）：**立刻**在 `afterKey` 下方插一个标题为空的待命名分组（真实分组，沿用
   * `local:N` key），返回它的 key；调用方拿它标记「谁是待命名的那个」。上一个还没命名的先按
   * 同一条规则丢掉（空标题不建组），所以同一时刻只会有一个。
   *
   * 两次变更都在同一份快照上算，避免「先丢后建」读到一个已经把旧待命名分组写回去的草稿。
   */
  const startPendingCardGroup = useCallback(
    (previousKey: string | null, afterKey: string): string | null => {
      const current = layoutDraft
      if (!current) return null
      const base = previousKey
        ? removeCardGroupInDraft(current, previousKey)
        : current
      const created = addPendingCardGroupInDraft(base.groups, afterKey)
      if (!created) return null
      setLayoutDraft({ ...base, groups: created.groups })
      return created.key
    },
    [layoutDraft]
  )

  /** 待命名分组的标题落地：非空即命名；空标题 / `Esc` 丢弃这一组（卡片退回默认分组）。 */
  const commitPendingCardGroupTitle = useCallback(
    (key: string, title: string) => {
      updateLayoutDraft((draft) => settleCardGroupTitleInDraft(draft, key, title))
    },
    [updateLayoutDraft]
  )

  const renameCardGroup = useCallback(
    (key: string, title: string) => {
      updateLayoutDraft((draft) => ({
        ...draft,
        groups: renameCardGroupInDraft(draft.groups, key, title),
      }))
    },
    [updateLayoutDraft]
  )

  const removeCardGroup = useCallback(
    (key: string) => {
      updateLayoutDraft((draft) => removeCardGroupInDraft(draft, key))
    },
    [updateLayoutDraft]
  )

  const reorderCardGroups = useCallback(
    (fromKey: string, toKey: string) => {
      updateLayoutDraft((draft) => ({
        ...draft,
        groups: reorderCardGroupsInDraft(draft.groups, fromKey, toKey),
      }))
    },
    [updateLayoutDraft]
  )

  /** 拖拽落位：把一批编号整体搬到目标分组的目标下标（§7.3）。 */
  const moveCards = useCallback(
    (cardNumbers: readonly number[], target: CardMoveTarget) => {
      updateLayoutDraft((draft) => moveCardsInDraft(draft, cardNumbers, target))
    },
    [updateLayoutDraft]
  )

  const toggleSelected = useCallback((cardId: string) => {
    setRawSelectedCardIds((current) => {
      const next = new Set(current)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }, [])

  /** 全选：所有可勾选的卡（`published`），没有数量上限。 */
  const selectAll = useCallback(
    () => setRawSelectedCardIds(new Set(selectableIds)),
    [selectableIds]
  )

  const clearSelection = useCallback(() => setRawSelectedCardIds(new Set()), [])

  /**
   * 整份替换选择集（鼠标框选，§8）：与 `toggleSelected` 一样只写**原始** id 集合，
   * 失效的 id 由「生效选择集」那层派生过滤掉。
   */
  const setSelectedCards = useCallback(
    (cardIds: Iterable<string>) => setRawSelectedCardIds(new Set(cardIds)),
    []
  )

  /**
   * 批量写可见性 / 交换模式。团体名片整体跳过：服务端把它们的这两个字段固定成
   * `auto + visible`，带上改动会让整份保存 400（§8）。
   */
  const applyCardSettings = useCallback(
    (cardIds: ReadonlySet<string>, patch: CardManagerCardSetting) => {
      setCardSettings((current) => {
        const next = { ...current }
        for (const card of cards) {
          if (!cardIds.has(card.id) || card.isGroupCard) continue
          next[card.id] = { ...next[card.id], ...patch }
        }
        return next
      })
    },
    [cards]
  )

  /** 把选中的编号加入快速清单（按清单顺序追加，同一批卡每次得到同样的顺序）。 */
  const addSelectionToQuickList = useCallback(() => {
    const numbers = new Set(selectedCards.map((card) => card.cardNumber))
    setQuickCardNumbers((current) => {
      const present = new Set(current)
      const next = [...current]
      for (const card of cards) {
        if (!numbers.has(card.cardNumber) || present.has(card.cardNumber)) {
          continue
        }
        present.add(card.cardNumber)
        next.push(card.cardNumber)
      }
      return next
    })
  }, [cards, selectedCards])

  const removeSelectionFromQuickList = useCallback(() => {
    const numbers = new Set(selectedCards.map((card) => card.cardNumber))
    setQuickCardNumbers((current) =>
      current.filter((number) => !numbers.has(number))
    )
  }, [selectedCards])

  const buildRequest = useCallback(
    () =>
      buildCardLayoutRequest({
        cards,
        layout,
        quickCardNumbers,
        cardSettings,
        layoutDraft,
      }),
    [cards, layout, layoutDraft, quickCardNumbers, cardSettings]
  )

  return {
    editing,
    startEditing,
    resetDraft,
    /**
     * 编辑会话里的布局草稿（分组 / 默认分组顺序）；不在编辑模式时为 `null`。
     * 渲染由 `buildDraftCardGroups` 合成，不要直接读 `groups[].cardNumbers` 去渲染。
     */
    layoutDraft,
    /** 生效后的快速清单编号（已按服务端口径收窄到 `published + auto`）。 */
    quickCardNumbers: effectiveQuick,
    /** 布局响应里的上限；布局读失败时为 `null`。 */
    limit: layout?.limit ?? null,
    /**
     * 按卡片 id 记的改动意图（原始值，不是保存请求里的形状）；
     * 保存请求由 `buildRequest` 组装成「只含有变化的卡」。
     */
    cardSettings,
    hasChanges,
    selectedCardIds,
    selectedCards,
    /** 可勾选的卡有几张（`published`）；「全选」没有可选项时禁用。 */
    selectableCount,
    selectedGroupCardCount,
    quickJoinNeedsAutoCount,
    toggleSelected,
    setSelectedCards,
    selectAll,
    clearSelection,
    applyCardSettings,
    addSelectionToQuickList,
    removeSelectionFromQuickList,
    startPendingCardGroup,
    commitPendingCardGroupTitle,
    renameCardGroup,
    removeCardGroup,
    reorderCardGroups,
    moveCards,
    buildRequest,
  }
}
