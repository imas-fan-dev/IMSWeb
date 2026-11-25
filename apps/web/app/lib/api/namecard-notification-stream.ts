import { exchangePath } from "@imsweb/contracts/paths"

import { sendWithAbort } from "./abort"
import { getPlatformSession } from "./endpoints/platform"
import { API_ORIGIN } from "./origin"
import { applyApiRequestPolicy } from "./request"

const IDLE_TIMEOUT_MS = 50_000 // The server sends a heartbeat every 20 seconds.
const MAX_FRAME_LENGTH = 8_192

export function receiveInboxChanges(
  accountId: string,
  signal: AbortSignal,
  changed: () => void
): Promise<void> {
  return receiveChanges(
    exchangePath("/me/notifications/stream"),
    "inbox.changed",
    signal,
    changed,
    accountId
  )
}

export function receiveScanChanges(
  token: string,
  signal: AbortSignal,
  changed: () => void
): Promise<void> {
  return receiveChanges(
    exchangePath(`/scan/sessions/${encodeURIComponent(token)}/stream`),
    "scan.changed",
    signal,
    changed
  )
}

async function receiveChanges(
  path: string,
  event: "inbox.changed" | "scan.changed",
  signal: AbortSignal,
  changed: () => void,
  accountId?: string
): Promise<void> {
  signal.throwIfAborted()
  const connection = new AbortController()
  const abort = () => connection.abort()
  signal.addEventListener("abort", abort, { once: true })
  let idle: ReturnType<typeof setTimeout>
  const resetTimeout = () => {
    clearTimeout(idle)
    idle = setTimeout(abort, IDLE_TIMEOUT_MS)
  }
  const open = () => {
    const config: {
      headers: Record<string, string>
      credentials?: RequestCredentials
    } = {
      headers: { Accept: "text/event-stream" },
    }
    applyApiRequestPolicy({ config }, { authRealm: "platform" })
    return fetch(API_ORIGIN + path, {
      ...config,
      redirect: "error",
      cache: "no-store",
      signal: connection.signal,
    })
  }
  resetTimeout()
  try {
    let response = await open()
    if (response.status === 401) {
      await response.body?.cancel()
      // Reuse the platform client's coordinated token rotation, once per attempt.
      const session = await sendWithAbort(
        getPlatformSession(),
        connection.signal
      )
      if (accountId !== undefined && session.account.id !== accountId) return
      response = await open()
    }
    if (
      !response.ok ||
      !response.body ||
      response.headers.get("Content-Type")?.split(";")[0].trim() !==
        "text/event-stream"
    ) {
      await response.body?.cancel()
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ""
    try {
      resetTimeout()
      while (!connection.signal.aborted) {
        const { done, value } = await reader.read()
        if (done || connection.signal.aborted) break
        resetTimeout()
        pending += decoder.decode(value, { stream: true })
        let separator: RegExpExecArray | null
        while ((separator = /\r?\n\r?\n/.exec(pending))) {
          if (separator.index > MAX_FRAME_LENGTH) return
          const frame = pending.slice(0, separator.index)
          pending = pending.slice(separator.index + separator[0].length)
          if (frame.split(/\r?\n/).includes(`event: ${event}`)) changed()
        }
        if (pending.length > MAX_FRAME_LENGTH) return
      }
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  } finally {
    clearTimeout(idle!)
    signal.removeEventListener("abort", abort)
    connection.abort()
  }
}
