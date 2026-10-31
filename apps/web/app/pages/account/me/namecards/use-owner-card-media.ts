import { useEffect, useState } from "react"

import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { getOwnerCardMedia, ownerCardMediaRequiresAuth } from "~/lib/api"

export function useOwnerCardMedia(source: string | null) {
  const { session, status } = useOptionalPlatformSession()
  const privateMedia = ownerCardMediaRequiresAuth(source)
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
    const method = getOwnerCardMedia(source)
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
  }, [attempt, privateMedia, session, source, status])

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
