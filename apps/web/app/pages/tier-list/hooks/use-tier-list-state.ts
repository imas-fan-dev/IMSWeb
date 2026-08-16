import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  addItems,
  addTier,
  clearTier,
  createTierListDocument,
  moveItem,
  moveTier,
  removeItem,
  removeTier,
  renameTier,
  setTierColor,
  setTitle,
  TIER_COLOR_PRESETS,
  type TierItem,
  type TierListContainer,
  type TierListDocument,
} from "../tier-list-model"
import {
  clearTierListDocument,
  loadTierListDocument,
  saveTierListDocument,
} from "../tier-list-storage"

const SAVE_DEBOUNCE_MS = 800

function nextTierColor(tiers: TierListDocument["tiers"]) {
  return TIER_COLOR_PRESETS[tiers.length % TIER_COLOR_PRESETS.length]
}

export function useTierListState() {
  const [document, setDocument] = useState<TierListDocument>(
    () => loadTierListDocument() ?? createTierListDocument()
  )
  const lastSaveFailed = useRef(false)
  const isInitialDocument = useRef(true)

  useEffect(() => {
    if (isInitialDocument.current) {
      isInitialDocument.current = false
      return
    }
    let idleId: number | null = null
    const timer = window.setTimeout(() => {
      const save = () => {
        const result = saveTierListDocument(document)
        if (result.saved) {
          lastSaveFailed.current = false
          return
        }
        if (!lastSaveFailed.current) {
          lastSaveFailed.current = true
          toast.error("进度无法保存", {
            description:
              "浏览器本地存储空间不足，本次改动刷新后将丢失，请删减一些本地图片。",
          })
        }
      }
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(save, { timeout: 1_500 })
      } else {
        save()
      }
    }, SAVE_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      if (idleId !== null) window.cancelIdleCallback(idleId)
    }
  }, [document])

  const handleSetTitle = useCallback((title: string) => {
    setDocument((doc) => setTitle(doc, title))
  }, [])

  const handleAddTier = useCallback(() => {
    setDocument((doc) => addTier(doc, "新层级", nextTierColor(doc.tiers)))
  }, [])

  const handleRenameTier = useCallback((tierId: string, label: string) => {
    setDocument((doc) => renameTier(doc, tierId, label))
  }, [])

  const handleSetTierColor = useCallback((tierId: string, color: string) => {
    setDocument((doc) => setTierColor(doc, tierId, color))
  }, [])

  const handleMoveTier = useCallback((tierId: string, direction: -1 | 1) => {
    setDocument((doc) => moveTier(doc, tierId, direction))
  }, [])

  const handleRemoveTier = useCallback((tierId: string) => {
    setDocument((doc) => removeTier(doc, tierId))
  }, [])

  const handleClearTier = useCallback((tierId: string) => {
    setDocument((doc) => clearTier(doc, tierId))
  }, [])

  const handleAddItems = useCallback((items: readonly TierItem[]) => {
    setDocument((doc) => addItems(doc, items))
  }, [])

  const handleRemoveItem = useCallback((itemId: string) => {
    setDocument((doc) => removeItem(doc, itemId))
  }, [])

  const handleMoveItem = useCallback(
    (itemId: string, container: TierListContainer, index: number) => {
      setDocument((doc) => moveItem(doc, itemId, container, index))
    },
    []
  )

  const handleClearAll = useCallback(() => {
    clearTierListDocument()
    setDocument(createTierListDocument())
    toast.success("已清空", { description: "新的排行榜已就绪。" })
  }, [])

  return {
    document,
    setTitle: handleSetTitle,
    addTier: handleAddTier,
    renameTier: handleRenameTier,
    setTierColor: handleSetTierColor,
    moveTier: handleMoveTier,
    removeTier: handleRemoveTier,
    clearTier: handleClearTier,
    addItems: handleAddItems,
    removeItem: handleRemoveItem,
    moveItem: handleMoveItem,
    clearAll: handleClearAll,
  }
}

export type TierListActions = Omit<
  ReturnType<typeof useTierListState>,
  "document"
>
