import { receiveInboxChanges } from "~/lib/api"
import {
  invalidateNamecardInbox,
  setNamecardInboxAccount,
} from "~/lib/use-namecard-unread"

const MIN_RETRY_MS = 5_000
const MAX_RETRY_MS = 60_000
const FALLBACK_MS = 60_000

export function startInboxLive(accountId: string): () => void {
  setNamecardInboxAccount(accountId)
  let connection: AbortController | undefined
  let reconnect: ReturnType<typeof setTimeout> | undefined
  let retryMs = MIN_RETRY_MS
  let healthy = false
  let stopped = false

  const disconnect = () => {
    clearTimeout(reconnect)
    reconnect = undefined
    connection?.abort()
    connection = undefined
    healthy = false
  }
  const foreground = () => document.visibilityState === "visible"
  const connect = () => {
    if (
      stopped ||
      connection ||
      reconnect ||
      !foreground() ||
      navigator.onLine === false
    )
      return
    const attempt = new AbortController()
    connection = attempt
    void receiveInboxChanges(accountId, attempt.signal, () => {
      if (connection !== attempt) return
      retryMs = MIN_RETRY_MS
      healthy = true
      invalidateNamecardInbox()
    })
      .catch(() => {
        // An unavailable stream does not break the REST inbox.
      })
      .finally(() => {
        if (connection !== attempt) return
        connection = undefined
        healthy = false
        reconnect = setTimeout(
          () => {
            reconnect = undefined
            connect()
          },
          retryMs * (1 + Math.random() * 0.2)
        )
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
      })
  }
  const resume = () => {
    if (!foreground()) {
      disconnect()
      return
    }
    invalidateNamecardInbox()
    clearTimeout(reconnect)
    reconnect = undefined
    connect()
  }
  const fallback = setInterval(() => {
    if (!healthy && foreground() && navigator.onLine !== false) {
      invalidateNamecardInbox()
    }
  }, FALLBACK_MS)
  document.addEventListener("visibilitychange", resume)
  window.addEventListener("online", resume)
  window.addEventListener("offline", disconnect)
  invalidateNamecardInbox()
  connect()

  return () => {
    stopped = true
    disconnect()
    clearInterval(fallback)
    document.removeEventListener("visibilitychange", resume)
    window.removeEventListener("online", resume)
    window.removeEventListener("offline", disconnect)
    setNamecardInboxAccount(null)
  }
}
