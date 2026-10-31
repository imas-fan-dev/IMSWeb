import { useEffect, useState } from "react"
import { useLocation } from "react-router"

import { getNamecardNotifications, hasPlatformSessionHint } from "~/lib/api"

let cachedUnread: number | null = null
let inFlight: Promise<void> | null = null
const listeners = new Set<(unread: number) => void>()

function publish(unread: number) {
  cachedUnread = unread
  for (const listener of listeners) listener(unread)
}

function loadUnread(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = getNamecardNotifications()
    .send()
    .then((result) => {
      publish(result.unread)
    })
    .catch(() => {
      // Signed out or offline: no badge rather than a broken header.
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/**
 * Publishes a new count to every mounted badge.
 *
 * Call this after marking notifications read so the header avatar, the header
 * menu entry, the App tab bar and the message panel all agree immediately.
 */
export function setNamecardUnread(unread: number) {
  publish(unread)
}

/**
 * Refetches the count and republishes it.
 *
 * The badges live in persistently mounted chrome (header, App tab bar), so they
 * never remount on navigation; whoever changes the recipient's inbox elsewhere
 * - another device, a reviewer, the scheduler - is only noticed when this runs.
 */
export function refreshNamecardUnread(): Promise<void> {
  return loadUnread()
}

/**
 * Unread in-app notification count.
 *
 * Shared by the header account menu (avatar badge), the App tab bar and the
 * message panel so they agree without each triggering its own request for the
 * same payload. Refreshes on every navigation and when the window regains
 * focus, because a badge that only loads once lies after the first message.
 */
export function useNamecardUnread(): number {
  const { pathname } = useLocation()
  const [unread, setUnread] = useState(cachedUnread ?? 0)

  useEffect(() => {
    listeners.add(setUnread)
    return () => {
      listeners.delete(setUnread)
    }
  }, [])

  // Anonymous visitors have no inbox; asking would only produce a 401 on every
  // page load, and the header renders without a badge either way. The hint is a
  // cookie/storage read instead of the session context so the badge still works
  // in chrome rendered outside the session provider.
  useEffect(() => {
    if (!hasPlatformSessionHint()) {
      publish(0)
      return
    }
    void loadUnread()
  }, [pathname])

  useEffect(() => {
    const refresh = () => {
      if (!hasPlatformSessionHint()) return
      void loadUnread()
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
