import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  getCardLayout,
  getExchangeCandidates,
  type NamecardCardLayout,
} from "~/lib/api"

import {
  autoSelectPickerCards,
  groupPickerCards,
  togglePickerCard,
  type PickerCandidate,
  type PickerGroup,
} from "./exchange-card-picker-model"

export type ExchangeCardPickerStatus = "loading" | "ready" | "error"

export interface ExchangeCardPickerState {
  status: ExchangeCardPickerStatus
  /** 拉取成功但一张候选都没有（自己还没有已发布的名片）。 */
  isEmpty: boolean
  groups: PickerGroup[]
  selected: readonly number[]
  /** 快速交换的上限；候选回来之前是 null，计数先不显示。 */
  limit: number | null
  /** 我有、对方还没有的张数；没传目标或接口省略时是 0。 */
  targetMissingCount: number
  toggle: (cardNumber: number) => void
  clear: () => void
  retry: () => void
}

/**
 * 选卡窗口的状态：挂载时并行拉候选与布局，维护选择集。
 *
 * 窗口只在打开时挂载它（调用方用 `{open ? <PickerPanel/> : null}` 挂），所以「重开窗口
 * 回到初始勾选」不需要在 effect 里清状态 —— 每次打开都是一个新实例，选择只活在窗口
 * 生命周期里。布局只影响展示，拉失败就退化成「只有默认分组」（与 `getCardLayout` 的
 * 注释同一口径），候选失败才是真的失败。
 */
export function useExchangeCardPicker({
  target,
  targetCard,
  autoSelect = true,
}: {
  target?: string | undefined
  /** 目标卡号：名片墙 / 主页拿不到账号 ID 时用它（与 `target` 只传一个）。 */
  targetCard?: number | undefined
  /**
   * 是否把快速清单预勾上。默认交换沿用快速清单；送片（gift）要用户自己挑，
   * 从零开始才不会「点开就带着一串要送出去的名片」。
   */
  autoSelect?: boolean | undefined
}): ExchangeCardPickerState {
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<ExchangeCardPickerStatus>("loading")
  const [candidates, setCandidates] = useState<PickerCandidate[]>([])
  const [layout, setLayout] = useState<NamecardCardLayout | null>(null)
  const [limit, setLimit] = useState<number | null>(null)
  const [targetMissingCount, setTargetMissingCount] = useState(0)
  const [selected, setSelected] = useState<readonly number[]>([])

  useEffect(() => {
    let active = true
    // 两个目标参数互斥：有卡号就只传卡号，否则只传账号标志。
    const request = targetCard !== undefined ? { targetCard } : { target }
    void getExchangeCandidates(request)
      .send()
      .then((settings) => {
        if (!active) return
        setCandidates(settings.cards)
        setLimit(settings.limit)
        setTargetMissingCount(settings.targetMissingCount ?? 0)
        setSelected(
          autoSelect ? autoSelectPickerCards(settings.cards, settings.limit) : []
        )
        setStatus("ready")
      })
      .catch(() => {
        if (active) setStatus("error")
      })

    void getCardLayout()
      .send()
      .then((next) => {
        if (active) setLayout(next)
      })
      .catch(() => {
        if (active) setLayout(null)
      })

    return () => {
      active = false
    }
  }, [target, targetCard, autoSelect, attempt])

  const groups = useMemo(
    () => groupPickerCards(candidates, layout),
    [candidates, layout]
  )

  const toggle = useCallback(
    (cardNumber: number) => {
      if (limit === null) return
      const result = togglePickerCard(selected, cardNumber, limit)
      if (result.limited) {
        toast(`一次最多给出 ${limit} 张名片`)
        return
      }
      setSelected(result.selected)
    },
    [limit, selected]
  )

  const clear = useCallback(() => setSelected([]), [])

  const retry = useCallback(() => {
    setStatus("loading")
    setAttempt((value) => value + 1)
  }, [])

  return {
    status,
    isEmpty: status === "ready" && candidates.length === 0,
    groups,
    selected,
    limit,
    targetMissingCount,
    toggle,
    clear,
    retry,
  }
}
