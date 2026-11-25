import {
  getScanSession,
  isApiError,
  receiveScanChanges,
  sendWithAbort,
  type NamecardScanSessionStatusResponse,
} from "~/lib/api"

const POLL_MS = 1_500
const FIRST_HINT_GRACE_MS = 3_000
const MIN_RECONNECT_MS = 5_000
const MAX_RECONNECT_MS = 60_000

type TerminalStatus = Exclude<
  NamecardScanSessionStatusResponse["status"],
  "active"
>

/** The stream is only a hint. REST remains authoritative, including after a reconnect. */
export function watchScanSession(
  token: string,
  settled: (status: TerminalStatus) => void,
  failed: (error: unknown) => void
): () => void {
  let stopWatching: (() => void) | undefined

  function sync() {
    if (document.visibilityState === "hidden" || !navigator.onLine) {
      stopWatching?.()
      stopWatching = undefined
      return
    }
    if (stopWatching) return

    const ctrl = new AbortController()
    const { signal } = ctrl
    let pollTimer: number | undefined
    let reconnectTimer: number | undefined
    let reconnectMs = MIN_RECONNECT_MS
    let healthy = false
    let checking = false
    let needsCheck = false

    stopWatching = () => {
      ctrl.abort()
      window.clearTimeout(pollTimer)
      window.clearTimeout(reconnectTimer)
    }

    function poll(delay: number) {
      window.clearTimeout(pollTimer)
      if (!signal.aborted) pollTimer = window.setTimeout(check, delay)
    }

    async function check() {
      if (signal.aborted) return
      if (checking) {
        needsCheck = true
        return
      }
      checking = true
      let retry = false
      try {
        const status = await sendWithAbort(getScanSession(token), signal)
        if (signal.aborted) return
        if (status.status !== "active") {
          dispose()
          settled(status.status)
        }
      } catch (error) {
        if (signal.aborted) return
        if (
          isApiError(error) &&
          (error.status === 401 || error.status === 403 || error.status === 404)
        ) {
          dispose()
          failed(error)
        } else {
          retry = true
        }
      } finally {
        checking = false
        if (!signal.aborted) {
          if (needsCheck) {
            needsCheck = false
            void check()
          } else if (!healthy || retry) {
            // If a hint arrived but its snapshot failed, keep retrying until a read succeeds.
            poll(POLL_MS)
          }
        }
      }
    }

    async function connect() {
      const started = Date.now()
      try {
        await receiveScanChanges(token, signal, () => {
          if (signal.aborted) return
          healthy = true
          window.clearTimeout(pollTimer)
          void check()
        })
      } catch {
        // A disconnected stream or an older API both fall back to the same JSON endpoint.
      }
      if (signal.aborted) return
      if (healthy && Date.now() - started >= MAX_RECONNECT_MS)
        reconnectMs = MIN_RECONNECT_MS
      healthy = false
      void check()
      reconnectTimer = window.setTimeout(
        connect,
        reconnectMs * (1 + Math.random() * 0.2)
      )
      reconnectMs = Math.min(reconnectMs * 2, MAX_RECONNECT_MS)
    }

    poll(FIRST_HINT_GRACE_MS)
    void connect()
  }

  function dispose() {
    stopWatching?.()
    stopWatching = undefined
    document.removeEventListener("visibilitychange", sync)
    window.removeEventListener("online", sync)
    window.removeEventListener("offline", sync)
  }

  document.addEventListener("visibilitychange", sync)
  window.addEventListener("online", sync)
  window.addEventListener("offline", sync)
  sync()
  return dispose
}
