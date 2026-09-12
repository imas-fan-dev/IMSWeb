import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

import {
  configureNativeGlass,
  destroyNativeGlass,
  isIosRuntimeIdentity,
  nativeTabRoute,
  shouldAttemptNativeGlass,
  updateNativeGlass,
} from "~/lib/native-glass"

describe("native glass bridge", () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.isTauri.mockReset()
    mocks.isTauri.mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    {
      identity: {
        maxTouchPoints: 5,
        platform: "iPhone",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)",
      },
      expected: true,
    },
    {
      identity: {
        maxTouchPoints: 5,
        platform: "MacIntel",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      },
      expected: true,
    },
    {
      identity: {
        maxTouchPoints: 5,
        platform: "Linux armv8l",
        userAgent: "Mozilla/5.0 (Linux; Android 16)",
      },
      expected: false,
    },
  ])(
    "identifies Apple mobile runtimes: $expected",
    ({ identity, expected }) => {
      expect(isIosRuntimeIdentity(identity)).toBe(expected)
    }
  )

  it("does not attempt native glass outside a Tauri runtime", () => {
    mocks.isTauri.mockReturnValue(false)
    expect(shouldAttemptNativeGlass()).toBe(false)
  })

  it("uses the scoped plugin commands", async () => {
    mocks.invoke.mockResolvedValue({ supported: true })
    const selectedColor = {
      red: 1,
      green: 23 / 255,
      blue: 79 / 255,
      alpha: 1,
    }
    const options = {
      dark: false,
      hidden: false,
      items: [{ route: "/", lucideIcon: "house", title: "首页" }],
      selectedColor,
      selectedIndex: 0,
    }

    await expect(configureNativeGlass(options)).resolves.toEqual({
      supported: true,
    })
    await updateNativeGlass({
      dark: true,
      hidden: true,
      selectedColor,
      selectedIndex: 1,
    })
    await destroyNativeGlass()

    expect(mocks.invoke).toHaveBeenNthCalledWith(
      1,
      "plugin:native-glass|configure",
      { options }
    )
    expect(mocks.invoke).toHaveBeenNthCalledWith(
      2,
      "plugin:native-glass|update",
      {
        options: { dark: true, hidden: true, selectedColor, selectedIndex: 1 },
      }
    )
    expect(mocks.invoke).toHaveBeenNthCalledWith(
      3,
      "plugin:native-glass|destroy"
    )
  })

  it("accepts only string routes from the native event", () => {
    expect(
      nativeTabRoute(
        new CustomEvent("ims:native-tab-select", {
          detail: { route: "/events" },
        })
      )
    ).toBe("/events")
    expect(nativeTabRoute(new CustomEvent("ims:native-tab-select"))).toBeNull()
    expect(nativeTabRoute(new Event("ims:native-tab-select"))).toBeNull()
  })
})
