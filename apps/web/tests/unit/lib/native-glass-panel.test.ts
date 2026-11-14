import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  isAppTarget: true,
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))
vi.mock("~/lib/app-target", () => ({
  get IS_APP_TARGET() {
    return mocks.isAppTarget
  },
}))

import {
  NATIVE_GLASS_CONTROL_EVENT,
  nativeGlassControlEvent,
  shouldUseNativeGlassControls,
  syncNativeGlassControls,
} from "~/lib/native-glass-panel"

function stubIdentity(identity: {
  maxTouchPoints: number
  platform: string
  userAgent: string
}) {
  vi.stubGlobal("navigator", identity)
}

describe("native glass panel bridge", () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.isTauri.mockReset()
    mocks.isTauri.mockReturnValue(true)
    mocks.isAppTarget = true
  })

  it.each([
    {
      identity: {
        maxTouchPoints: 5,
        platform: "iPhone",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)",
      },
      isTauri: true,
      expected: true,
    },
    {
      identity: {
        maxTouchPoints: 5,
        platform: "Linux armv8l",
        userAgent: "Mozilla/5.0 (Linux; Android 16)",
      },
      isTauri: true,
      expected: false,
    },
    {
      identity: {
        maxTouchPoints: 0,
        platform: "Win32",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      isTauri: false,
      expected: false,
    },
    {
      identity: {
        maxTouchPoints: 0,
        platform: "Win32",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      isTauri: true,
      expected: false,
    },
  ])(
    "gates the native control path: $expected",
    ({ identity, isTauri, expected }) => {
      stubIdentity(identity)
      mocks.isTauri.mockReturnValue(isTauri)
      expect(shouldUseNativeGlassControls()).toBe(expected)
    }
  )

  it("stays on the DOM path outside the App target", () => {
    mocks.isAppTarget = false
    stubIdentity({
      maxTouchPoints: 5,
      platform: "iPhone",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)",
    })
    expect(shouldUseNativeGlassControls()).toBe(false)
  })

  it("sends the full control set through the scoped command", async () => {
    mocks.invoke.mockResolvedValue({ supported: true })
    const controls = [
      {
        id: "locate",
        kind: "icon-button" as const,
        icon: "locate-fixed",
        label: "回到我的位置",
        frame: { x: 1, y: 2, width: 40, height: 40 },
        cornerRadius: 8,
        disabled: true,
      },
      {
        id: "map-tools",
        kind: "menu" as const,
        icon: "menu",
        label: "展开地图工具",
        frame: { x: 3, y: 4, width: 40, height: 40 },
        cornerRadius: 8,
        expanded: true,
        panelWidth: 144,
        panelCornerRadius: 12,
        items: [
          { id: "filter", icon: "list-filter", label: "筛选", badge: true },
        ],
      },
    ]

    await expect(syncNativeGlassControls(controls, true)).resolves.toEqual({
      supported: true,
    })
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.invoke).toHaveBeenCalledWith(
      "plugin:native-glass|set_controls",
      { args: { controls, dark: true } }
    )
  })

  it("accepts press and menu-item events", () => {
    expect(
      nativeGlassControlEvent(
        new CustomEvent(NATIVE_GLASS_CONTROL_EVENT, {
          detail: { id: "locate", action: "press" },
        })
      )
    ).toEqual({ id: "locate", action: "press" })
    expect(
      nativeGlassControlEvent(
        new CustomEvent(NATIVE_GLASS_CONTROL_EVENT, {
          detail: { id: "map-tools", action: "menu-item", itemId: "filter" },
        })
      )
    ).toEqual({ id: "map-tools", action: "menu-item", itemId: "filter" })
  })

  it("rejects malformed control events", () => {
    const malformed = [
      new Event(NATIVE_GLASS_CONTROL_EVENT),
      new CustomEvent(NATIVE_GLASS_CONTROL_EVENT),
      new CustomEvent(NATIVE_GLASS_CONTROL_EVENT, { detail: null }),
      new CustomEvent(NATIVE_GLASS_CONTROL_EVENT, { detail: "press" }),
      new CustomEvent(NATIVE_GLASS_CONTROL_EVENT, {
        detail: { id: "", action: "press" },
      }),
      new CustomEvent(NATIVE_GLASS_CONTROL_EVENT, {
        detail: { id: 7, action: "press" },
      }),
      new CustomEvent(NATIVE_GLASS_CONTROL_EVENT, {
        detail: { id: "locate", action: "toggle" },
      }),
      new CustomEvent(NATIVE_GLASS_CONTROL_EVENT, {
        detail: { id: "map-tools", action: "menu-item", itemId: 3 },
      }),
      new CustomEvent(NATIVE_GLASS_CONTROL_EVENT, {
        detail: { id: "map-tools", action: "menu-item" },
      }),
    ]

    for (const event of malformed) {
      expect(nativeGlassControlEvent(event)).toBeNull()
    }
  })
})
