import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: mocks.isTauri }))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

import {
  isBlockedTauriShortcut,
  TauriInteractionGuard,
} from "~/components/shared/tauri-interaction-guard"

describe("TauriInteractionGuard", () => {
  beforeEach(() => {
    mocks.isTauri.mockReset()
    mocks.isTauri.mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(["contextmenu", "copy", "cut", "paste", "dragstart", "selectstart"])(
    "prevents %s events in Tauri",
    (eventName) => {
      render(<TauriInteractionGuard />)
      const event = new Event(eventName, { bubbles: true, cancelable: true })

      document.body.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
    }
  )

  it("prevents blocked keyboard shortcuts", () => {
    render(<TauriInteractionGuard />)
    const blocked = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "c",
    })
    const allowed = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "k",
    })

    document.body.dispatchEvent(blocked)
    document.body.dispatchEvent(allowed)

    expect(blocked.defaultPrevented).toBe(true)
    expect(allowed.defaultPrevented).toBe(false)
  })

  it("does not install event handlers outside Tauri", () => {
    mocks.isTauri.mockReturnValue(false)
    render(<TauriInteractionGuard />)
    const event = new Event("contextmenu", { bubbles: true, cancelable: true })

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it("removes event handlers when unmounted", () => {
    const { unmount } = render(<TauriInteractionGuard />)
    unmount()
    const event = new Event("copy", { bubbles: true, cancelable: true })

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })
})

describe("isBlockedTauriShortcut", () => {
  it.each([
    [{ key: "F12" }, true],
    [{ ctrlKey: true, key: "v" }, true],
    [{ key: "x", metaKey: true }, true],
    [{ altKey: true, ctrlKey: true, key: "c" }, false],
    [{ ctrlKey: true, key: "k" }, false],
  ])("returns %s for %#", (event, expected) => {
    expect(
      isBlockedTauriShortcut({
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        ...event,
      })
    ).toBe(expected)
  })
})
