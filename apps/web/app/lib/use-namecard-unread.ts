import { useEffect, useSyncExternalStore } from "react"
import { useLocation } from "react-router"

import { getNamecardNotifications, hasPlatformSessionHint } from "~/lib/api"

type InboxSnapshot = Awaited<
  ReturnType<ReturnType<typeof getNamecardNotifications>["send"]>
>

let accountId: string | null = null
let generation = 0
let cachedUnread = 0
let inFlight: Promise<InboxSnapshot> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | undefined
const badgeListeners = new Set<() => void>()
const inboxListeners = new Set<() => void>()

function subscribeBadge(listener: () => void) {
  badgeListeners.add(listener)
  return () => {
    badgeListeners.delete(listener)
  }
}

export function subscribeNamecardInbox(listener: () => void) {
  inboxListeners.add(listener)
  return () => {
    inboxListeners.delete(listener)
  }
}

export function setNamecardUnread(unread: number) {
  cachedUnread = unread
  for (const listener of badgeListeners) listener()
}

export function setNamecardInboxAccount(next: string | null) {
  if (next === accountId) return
  accountId = next
  generation++
  inFlight = null
  clearTimeout(refreshTimer)
  refreshTimer = undefined
  setNamecardUnread(0)
}

export function captureNamecardInboxScope(): () => boolean {
  const current = generation
  return () => current === generation
}

export function loadNamecardInbox(): Promise<InboxSnapshot> {
  if (inFlight) return inFlight
  const current = generation
  const pending = getNamecardNotifications()
    .send()
    .then((result) => {
      if (current !== generation) throw new Error("Inbox account changed")
      setNamecardUnread(result.unread)
      return result
    })
    .finally(() => {
      if (inFlight === pending) inFlight = null
    })
  inFlight = pending
  return pending
}

export async function refreshNamecardUnread(): Promise<void> {
  try {
    await loadNamecardInbox()
  } catch {
    // Offline or signed out: preserve the last known count for this account.
  }
}

export function invalidateNamecardInbox() {
  if (refreshTimer !== undefined) return
  const current = generation
  refreshTimer = setTimeout(() => {
    // An invalidation during a GET must trigger one trailing snapshot, not
    // reuse a request that may have started before the database commit.
    const refresh = () => {
      if (generation !== current) return
      refreshTimer = undefined
      for (const listener of inboxListeners) listener()
      if (inboxListeners.size === 0) void refreshNamecardUnread()
    }
    if (inFlight) void inFlight.then(refresh, refresh)
    else refresh()
  }, 100)
}

export function useNamecardUnread(): number {
  const { key } = useLocation()
  const unread = useSyncExternalStore(
    subscribeBadge,
    () => cachedUnread,
    () => 0
  )

  useEffect(() => {
    if (!hasPlatformSessionHint()) {
      setNamecardUnread(0)
      return
    }
    void refreshNamecardUnread()
  }, [key])

  useEffect(() => {
    const refresh = () => {
      if (hasPlatformSessionHint()) void refreshNamecardUnread()
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  return unread
}
