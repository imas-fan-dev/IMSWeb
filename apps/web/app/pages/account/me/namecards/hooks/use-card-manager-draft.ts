import { useCallback, useEffect, useMemo, useState } from "react"

import type { FudabaOwnerCard, NamecardCardLayout } from "~/lib/api"
import {
  buildCardLayoutRequest,
  effectiveExchangeMode,
  effectiveQuickCardNumbers,
  isCardManagerDraftDirty,
  selectableCardIds,
  type CardManagerCardSetting,
  type CardManagerCardSettings,
} from "../card-manager-model"

/**
 * 编辑模式是**草稿会话**（§12）：布局不动，快速清单与批量字段先落本地，
 * 点保存才整份提交。这里只管草稿，请求与失败处理在 `use-card-manager-save`。
 *
 * 布局结构与本片（S3）无关，所以草稿不带 `groups`/`defaultCardNumbers`——保存时用已加载的
 * 布局原样回传，避免前端复算顺序。
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

  const hasChanges = useMemo(
    () =>
      isCardManagerDraftDirty({ cards, layout, quickCardNumbers, cardSettings }),
    [cards, layout, quickCardNumbers, cardSettings]
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
          !card.isGroupCard && effectiveExchangeMode(card, cardSettings) !== "auto"
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

  const startEditing = useCallback(() => setEditing(true), [])

  /**
   * 用一份布局重置草稿并退出编辑：保存成功时传响应（服务端归一后的布局），
   * 放弃改动时传当前布局。
   */
  const resetDraft = useCallback((nextLayout: NamecardCardLayout | null) => {
    setQuickCardNumbers(nextLayout?.quickCardNumbers ?? [])
    setCardSettings({})
    setRawSelectedCardIds(new Set())
    setEditing(false)
  }, [])

  const toggleSelected = useCallback((cardId: string) => {
    setRawSelectedCardIds((current) => {
      const next = new Set(current)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }, [])

  const selectAll = useCallback(
    () => setRawSelectedCardIds(new Set(selectableIds)),
    [selectableIds]
  )

  const clearSelection = useCallback(() => setRawSelectedCardIds(new Set()), [])

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
      }),
    [cards, layout, quickCardNumbers, cardSettings]
  )

  return {
    editing,
    startEditing,
    resetDraft,
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
    selectAll,
    clearSelection,
    applyCardSettings,
    addSelectionToQuickList,
    removeSelectionFromQuickList,
    buildRequest,
  }
}
