import { useEffect, useState } from "react"

import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import {
  getHeldCardMedia,
  getOwnerCardMedia,
  heldCardMediaRequiresAuth,
  ownerCardMediaRequiresAuth,
} from "~/lib/api"

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
  const [result, setResult] = useState<{
    source: string
    session: typeof session
    attempt: number
    url: string | null
    failed: boolean
  } | null>(null)

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
    let objectUrl: string | null = null
    void method
      .send()
      .then((blob) => {
        if (disposed) return
        objectUrl = URL.createObjectURL(blob)
        setResult({ source, session, attempt, url: objectUrl, failed: false })
      })
      .catch(() => {
        if (!disposed)
          setResult({ source, session, attempt, url: null, failed: true })
      })
    return () => {
      disposed = true
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
    retry: () => setAttempt((value) => value + 1),
  }
}
