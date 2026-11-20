import { useCallback, useEffect, useRef, useState } from "react"

import {
  commitCardShare,
  commitQuickExchange,
  commitScanSession,
  isApiError,
} from "~/lib/api"
import { notifyNamecardDataChanged } from "~/lib/namecards/data-refresh"
import {
  isRetryableScanExchangeFailure,
  scanExchangeQueue,
} from "~/lib/namecards/scan-exchange-queue"
import {
  cancelExchangeScan,
  exchangeTargetFromText,
  isMobileScanRuntime,
  ScanCancelledError,
  ScanInvalidCodeError,
  ScanPermissionError,
  SCAN_FAILED_MESSAGE,
  SCAN_INVALID_CODE_MESSAGE,
  SCAN_PERMISSION_MESSAGE,
  scanExchangeCode,
} from "~/lib/scan/mobile-scan"
import type { ScannedExchangeTarget } from "~/lib/scan/mobile-scan"
import { decodeQrFromImage } from "~/lib/scan/qr-image"

import {
  EXCHANGE_FAILED_MESSAGE,
  useExchangeSubmit,
} from "./use-exchange-submit"

export type ScanExchangePhase =
  | "unsupported"
  | "scanning"
  /** 相册图片正在解码；取景遮罩保留，提交后切走。 */
  | "decoding"
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
  /** 相册图片：先关原生取景，再在 WebView 里解出令牌并提交。 */
  submitImage: (file: File) => Promise<void>
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
  const aliveRef = useRef(true)
  /** 相册提交会主动取消取景；这次取消不能当成用户返回。 */
  const handoffRef = useRef(false)

  useEffect(() => {
    cancelRef.current = onCancel
  }, [onCancel])

  const { submit } = useExchangeSubmit({
    onSettled: () => notifyNamecardDataChanged(),
    // 网络类失败由本钩子入队并给出「已保存到本地」的提示，钩子不再弹兜底文案。
    onFailure: (failure) => isRetryableScanExchangeFailure(failure),
  })

  const commitTarget = useCallback(
    async (target: ScannedExchangeTarget) => {
      setPhase("committing")
      let cause: unknown = null
      // 幂等锚点由提交钩子生成；入队要沿用同一把，重放才是同一次交换。
      const exchange: { clientExchangeId: string | null } = {
        clientExchangeId: null,
      }
      const giveCardNumbers = [...cardNumbers]
      const result = await submit(async (clientExchangeId) => {
        exchange.clientExchangeId = clientExchangeId
        try {
          // 三类二维码走各自的提交：一次性令牌 / 单卡分享 / 快速清单。
          return target.kind === "token"
            ? await commitScanSession(target.token, {
                clientExchangeId,
                giveCardNumbers,
              })
            : target.kind === "card-share"
              ? await commitCardShare(target.slug, {
                  clientExchangeId,
                  giveCardNumbers,
                })
              : await commitQuickExchange(target.handle, {
                  clientExchangeId,
                  giveCardNumbers,
                })
        } catch (failure) {
          cause = failure
          throw failure
        }
      })
      if (!aliveRef.current) return

      if (result) {
        setPhase("committed")
        return
      }

      // 离线队列按令牌录入；分享二维码没有令牌可重放，失败直接给回执。
      if (
        target.kind === "token" &&
        exchange.clientExchangeId &&
        isRetryableScanExchangeFailure(cause)
      ) {
        const queued = await scanExchangeQueue.enqueue({
          token: target.token,
          clientExchangeId: exchange.clientExchangeId,
          giveCardNumbers: cardNumbers,
        })
        if (!aliveRef.current) return
        if (queued) {
          setPhase("queued")
          return
        }
      }

      setPhase("error")
      setErrorMessage(
        isApiError(cause) ? cause.message : EXCHANGE_FAILED_MESSAGE
      )
    },
    [cardNumbers, submit]
  )

  // 卸载即收相机：原生取景不能留在 WebView 后面。
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      void cancelExchangeScan()
    }
  }, [])

  useEffect(() => {
    if (!isMobileScanRuntime()) return

    let active = true

    const run = async () => {
      let target: ScannedExchangeTarget
      try {
        target = await scanExchangeCode()
      } catch (failure) {
        if (!active || !aliveRef.current) return
        if (failure instanceof ScanCancelledError) {
          // 相册提交先取消取景再解码：这不是用户返回。
          if (handoffRef.current) return
          cancelRef.current()
          return
        }
        setPhase("error")
        setErrorMessage(
          failure instanceof ScanPermissionError
            ? SCAN_PERMISSION_MESSAGE
            : failure instanceof ScanInvalidCodeError
              ? SCAN_INVALID_CODE_MESSAGE
              : SCAN_FAILED_MESSAGE
        )
        return
      }
      if (!active) return
      await commitTarget(target)
    }

    void run()
    return () => {
      active = false
    }
  }, [attempt, commitTarget])

  const retry = useCallback(() => {
    handoffRef.current = false
    setErrorMessage(null)
    setPhase(isMobileScanRuntime() ? "scanning" : "unsupported")
    setAttempt((current) => current + 1)
  }, [])

  const submitImage = useCallback(
    async (file: File) => {
      handoffRef.current = true
      setPhase("decoding")
      await cancelExchangeScan()
      const text = await decodeQrFromImage(file).catch(() => null)
      if (!aliveRef.current) return
      const target = exchangeTargetFromText(text)
      if (!target) {
        setPhase("error")
        setErrorMessage(SCAN_INVALID_CODE_MESSAGE)
        return
      }
      await commitTarget(target)
    },
    [commitTarget]
  )

  return { phase, errorMessage, retry, submitImage }
}
