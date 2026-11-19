import { useCallback, useEffect, useRef, useState } from "react"

import { commitScanSession, isApiError } from "~/lib/api"
import { notifyNamecardDataChanged } from "~/lib/namecards/data-refresh"
import {
  isRetryableScanExchangeFailure,
  scanExchangeQueue,
} from "~/lib/namecards/scan-exchange-queue"
import {
  isMobileScanRuntime,
  ScanCancelledError,
  ScanPermissionError,
  SCAN_FAILED_MESSAGE,
  SCAN_PERMISSION_MESSAGE,
  scanExchangeToken,
} from "~/lib/scan/mobile-scan"

import {
  EXCHANGE_FAILED_MESSAGE,
  useExchangeSubmit,
} from "./use-exchange-submit"

export type ScanExchangePhase =
  | "unsupported"
  | "scanning"
  | "committing"
  | "committed"
  /** 网络类失败已存进离线队列，联网后自动重放。 */
  | "queued"
  | "error"

export interface ScanExchangeState {
  phase: ScanExchangePhase
  /** 失败时给窗口展示的文案（后端文案优先）。 */
  errorMessage: string | null
  /** 重新打开相机（也会沿用失败轮次的 `clientExchangeId`）。 */
  retry: () => void
}

/**
 * 扫码提交：打开相机拿令牌 → 用选卡窗口交出的名片调 commit。
 *
 * 只在窗口打开时挂载：关闭即卸载，相机把令牌交回来之后的效果不再落地。
 * 用户返回 / 取消扫码不是错误，直接调 `onCancel` 让窗口收场。
 *
 * 提交复用 `useExchangeSubmit`：幂等锚点、成功提示与后端失败文案都在那里；
 * 网络类失败在这里入队（沿用同一把 `clientExchangeId`），联网后自动重放。
 */
export function useScanExchange({
  cardNumbers,
  onCancel,
}: {
  cardNumbers: readonly number[]
  onCancel: () => void
}): ScanExchangeState {
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<ScanExchangePhase>(() =>
    isMobileScanRuntime() ? "scanning" : "unsupported"
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const cancelRef = useRef(onCancel)

  useEffect(() => {
    cancelRef.current = onCancel
  }, [onCancel])

  const { submit } = useExchangeSubmit({
    onSettled: () => notifyNamecardDataChanged(),
    // 网络类失败由本钩子入队并给出「已保存到本地」的提示，钩子不再弹兜底文案。
    onFailure: (failure) => isRetryableScanExchangeFailure(failure),
  })

  useEffect(() => {
    if (!isMobileScanRuntime()) return

    let active = true

    const run = async () => {
      let token: string
      try {
        token = await scanExchangeToken()
      } catch (failure) {
        if (!active) return
        if (failure instanceof ScanCancelledError) {
          cancelRef.current()
          return
        }
        setPhase("error")
        setErrorMessage(
          failure instanceof ScanPermissionError
            ? SCAN_PERMISSION_MESSAGE
            : SCAN_FAILED_MESSAGE
        )
        return
      }
      if (!active) return

      setPhase("committing")
      let cause: unknown = null
      // 幂等锚点由提交钩子生成；入队要沿用同一把，重放才是同一次交换。
      const exchange: { clientExchangeId: string | null } = {
        clientExchangeId: null,
      }
      const result = await submit(async (clientExchangeId) => {
        exchange.clientExchangeId = clientExchangeId
        try {
          return await commitScanSession(token, {
            clientExchangeId,
            giveCardNumbers: [...cardNumbers],
          })
        } catch (failure) {
          cause = failure
          throw failure
        }
      })
      if (!active) return

      if (result) {
        setPhase("committed")
        return
      }

      if (exchange.clientExchangeId && isRetryableScanExchangeFailure(cause)) {
        const queued = await scanExchangeQueue.enqueue({
          token,
          clientExchangeId: exchange.clientExchangeId,
          giveCardNumbers: cardNumbers,
        })
        if (!active) return
        if (queued) {
          setPhase("queued")
          return
        }
      }

      setPhase("error")
      setErrorMessage(
        isApiError(cause) ? cause.message : EXCHANGE_FAILED_MESSAGE
      )
    }

    void run()
    return () => {
      active = false
    }
  }, [attempt, cardNumbers, submit])

  const retry = useCallback(() => {
    setPhase("scanning")
    setErrorMessage(null)
    setAttempt((current) => current + 1)
  }, [])

  return { phase, errorMessage, retry }
}
