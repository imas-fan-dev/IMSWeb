import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  createScanSession,
  isApiError,
  sendWithAbort,
  type NamecardScanSession,
} from "~/lib/api"
import { notifyNamecardDataChanged } from "~/lib/namecards/data-refresh"

import {
  EXCHANGE_COMPLETED_MESSAGE,
  EXCHANGE_EXPIRED_MESSAGE,
  EXCHANGE_FAILED_MESSAGE,
} from "./use-exchange-submit"

import { watchScanSession } from "./watch-scan-session"

export type ScanSharePhase =
  | "creating"
  | "waiting"
  | "committed"
  | "expired"
  | "error"

export interface ScanShareState {
  phase: ScanSharePhase
  /** 二维码内容；`creating` / 失败时为 null。 */
  token: string | null
  /** 服务端给的到期时间，仅用于展示。 */
  expiresAt: string | null
  /** 创建或轮询失败时的文案（后端文案优先）。 */
  errorMessage: string | null
  /** 重新创建会话（过期 / 失败后的「重试」）。 */
  retry: () => void
}

/**
 * 出示侧扫码交换：建会话 → 展示二维码 → 订阅状态变化。
 *
 * 只在窗口打开时挂载，关闭即停止请求与订阅；重新打开会创建新会话。
 *
 * 对方提交成功时广播一次名片册变更（见 `notifyNamecardDataChanged`），
 * 让已挂载的列表在下一帧重新取数，同时刷新未读角标。
 */
export function useScanShare({
  cardNumbers,
  onCommitted,
}: {
  cardNumbers: readonly number[]
  onCommitted?: (() => void) | undefined
}): ScanShareState {
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<ScanSharePhase>("creating")
  const [session, setSession] = useState<NamecardScanSession | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const committedRef = useRef(onCommitted)

  useEffect(() => {
    committedRef.current = onCommitted
  }, [onCommitted])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    let stopWatching: (() => void) | undefined

    const settleCommitted = () => {
      setPhase("committed")
      toast.success(EXCHANGE_COMPLETED_MESSAGE)
      notifyNamecardDataChanged()
      committedRef.current?.()
    }

    const settleExpired = () => {
      setPhase("expired")
      toast.error(EXCHANGE_EXPIRED_MESSAGE)
    }

    const settleFailed = (error: unknown) => {
      setPhase("error")
      const message = isApiError(error)
        ? error.message
        : EXCHANGE_FAILED_MESSAGE
      setErrorMessage(message)
      toast.error(message)
    }

    void sendWithAbort(createScanSession(cardNumbers), signal)
      .then((created) => {
        if (signal.aborted) return
        setSession(created)
        setPhase("waiting")
        stopWatching = watchScanSession(
          created.token,
          (status) =>
            status === "committed" ? settleCommitted() : settleExpired(),
          settleFailed
        )
      })
      .catch((error: unknown) => {
        if (!signal.aborted) settleFailed(error)
      })

    return () => {
      controller.abort()
      stopWatching?.()
    }
  }, [attempt, cardNumbers])

  const retry = useCallback(() => {
    setPhase("creating")
    setSession(null)
    setErrorMessage(null)
    setAttempt((current) => current + 1)
  }, [])

  return {
    phase,
    token: session?.token ?? null,
    expiresAt: session?.expiresAt ?? null,
    errorMessage,
    retry,
  }
}
