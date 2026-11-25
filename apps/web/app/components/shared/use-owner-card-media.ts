import { useEffect, useRef, useState } from "react"

import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import {
  getHeldCardMedia,
  isApiError,
  getOwnerCardMedia,
  heldCardMediaRequiresAuth,
  ownerCardMediaRequiresAuth,
} from "~/lib/api"

/** 自动重试上限：瞬时 abort / 网络抖动不应要求用户关窗重开。 */
const AUTO_RETRY_LIMIT = 2
const AUTO_RETRY_DELAY_MS = 250

/**
 * 值得再试一次的错误：请求被 effect 清理 abort、网络断开、5xx，以及
 * 会话刷新瞬间的 401/403。真正的 404 等业务错误直接显示失败。
 */
function isRetryableMediaFailure(error: unknown): boolean {
  if (!isApiError(error)) return true
  if (error.kind === "aborted" || error.kind === "network") return true
  const status = error.status ?? 0
  return status === 0 || status === 401 || status === 403 || status >= 500
}

export function useOwnerCardMedia(
  source: string | null,
  options: { authorize?: boolean } = {}
) {
  const { session, status } = useOptionalPlatformSession()
  // 属主媒体永远要凭据；交换墙媒体只在调用方标明「这张卡对匿名读者不可见」时
  // 才走 Bearer，公开卡保持普通 <img>（浏览器缓存不动）。
  const ownerPrivate = ownerCardMediaRequiresAuth(source)
  const heldPrivate =
    options.authorize === true && heldCardMediaRequiresAuth(source)
  const privateMedia = ownerPrivate || heldPrivate
  const [attempt, setAttempt] = useState(0)
  /** 同一张图已经自动重试过几次；换源或成功时清零。 */
  const autoRetries = useRef(0)
  const [result, setResult] = useState<{
    source: string
    session: typeof session
    attempt: number
    url: string | null
    failed: boolean
  } | null>(null)

  useEffect(() => {
    autoRetries.current = 0
  }, [source])

  useEffect(() => {
    if (
      !privateMedia ||
      !source ||
      !session ||
      (status !== "authenticated" && status !== "restricted")
    )
      return
    const method = ownerPrivate
      ? getOwnerCardMedia(source)
      : getHeldCardMedia(source)
    let disposed = false
    let retryTimer: number | undefined
    let objectUrl: string | null = null
    void method
      .send()
      .then((blob) => {
        if (disposed) return
        objectUrl = URL.createObjectURL(blob)
        autoRetries.current = 0
        setResult({ source, session, attempt, url: objectUrl, failed: false })
      })
      .catch((error) => {
        if (disposed) return
        // 挂载/切源瞬间的 abort 与网络抖动：自动退避重试，不把失败钉死。
        if (
          isRetryableMediaFailure(error) &&
          autoRetries.current < AUTO_RETRY_LIMIT
        ) {
          autoRetries.current += 1
          retryTimer = window.setTimeout(
            () => setAttempt((value) => value + 1),
            AUTO_RETRY_DELAY_MS * autoRetries.current
          )
          return
        }
        setResult({ source, session, attempt, url: null, failed: true })
      })
    return () => {
      disposed = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      method.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attempt, ownerPrivate, privateMedia, session, source, status])

  const current =
    result?.source === source &&
    result.session === session &&
    result.attempt === attempt
  return {
    src: privateMedia ? (current ? result.url : null) : source,
    failed: privateMedia && current && result.failed,
    /** 失败态或用户点重试时用它重新拉取。 */
    retry: () => setAttempt((value) => value + 1),
  }
}
