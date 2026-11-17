import { isTauri } from "@tauri-apps/api/core"
import { useEffect } from "react"

import { IS_APP_TARGET } from "~/lib/app-target"

const blockedShortcutKeys = new Set(["a", "c", "p", "s", "u", "v", "x"])

function preventDefault(event: Event) {
  event.preventDefault()
}

export function isBlockedTauriShortcut(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey">
) {
  if (event.key === "F12") return true

  return (
    !event.altKey &&
    (event.ctrlKey || event.metaKey) &&
    blockedShortcutKeys.has(event.key.toLowerCase())
  )
}

/**
 * Disables browser-style document interaction in the packaged desktop shell.
 * The public Web build intentionally retains its normal browser behavior.
 */
export function TauriInteractionGuard() {
  useEffect(() => {
    if (!IS_APP_TARGET || !isTauri()) return

    const preventShortcut = (event: KeyboardEvent) => {
      if (isBlockedTauriShortcut(event)) event.preventDefault()
    }

    const events = [
      "contextmenu",
      "copy",
      "cut",
      "paste",
      "dragstart",
      "selectstart",
    ] as const

    for (const eventName of events) {
      document.addEventListener(eventName, preventDefault, true)
    }
    document.addEventListener("keydown", preventShortcut, true)

    return () => {
      for (const eventName of events) {
        document.removeEventListener(eventName, preventDefault, true)
      }
      document.removeEventListener("keydown", preventShortcut, true)
    }
  }, [])

  return null
}
