import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  createScanSession,
  getScanSession,
  isApiError,
  type NamecardScanSession,
  type NamecardScanSessionStatusResponse,
} from "~/lib/api"
import { notifyNamecardDataChanged } from "~/lib/namecards/data-refresh"

import {
  EXCHANGE_COMPLETED_MESSAGE,
  EXCHANGE_EXPIRED_MESSAGE,
  EXCHANGE_FAILED_MESSAGE,
} from "./use-exchange-submit"

/** 出示方轮询会话状态的间隔：够快让对方「扫完就看到结果」，又不至于打满接口。 */
export const SCAN_STATUS_POLL_MS = 1500

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
 * 出示侧扫码交换：建会话 → 展示二维码 → 轮询到 `committed`。
 *
 * 只在窗口打开时挂载（调用方用 `{open ? <Panel /> : null}`），关闭即卸载，
 * 轮询随 cleanup 停止；重新打开就是一次全新的会话，不需要在 effect 里清状态。
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
    let active = true
    let timer: number | undefined

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
      const message = isApiError(error) ? error.message : EXCHANGE_FAILED_MESSAGE
      setErrorMessage(message)
      toast.error(message)
    }

    const poll = (token: string) => {
      timer = window.setTimeout(() => {
        if (!active) return
        void getScanSession(token)
          .send()
          .then((status: NamecardScanSessionStatusResponse) => {
            if (!active) return
            if (status.status === "committed") {
              settleCommitted()
              return
            }
            if (status.status === "expired") {
              settleExpired()
              return
            }
            poll(token)
          })
          .catch((error: unknown) => {
            if (active) settleFailed(error)
          })
      }, SCAN_STATUS_POLL_MS)
    }

    void createScanSession(cardNumbers)
      .send()
      .then((created) => {
        if (!active) return
        setSession(created)
        setPhase("waiting")
        poll(created.token)
      })
      .catch((error: unknown) => {
        if (active) settleFailed(error)
      })

    return () => {
      active = false
      clearTimeout(timer)
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
