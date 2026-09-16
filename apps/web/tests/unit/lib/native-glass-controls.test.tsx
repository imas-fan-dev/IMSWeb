import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  NativeGlassControlsProvider,
  useNativeGlassControl,
} from "~/lib/native-glass-controls"
import {
  NATIVE_GLASS_CONTROL_EVENT,
  type NativeGlassControl,
  type NativeGlassControlEvent,
} from "~/lib/native-glass-panel"
import { NATIVE_TAB_BAR_SUPPRESSION_EVENT } from "~/lib/native-tab-bar-suppression"

const mocks = vi.hoisted(() => ({
  admitted: true,
  sync: vi.fn(),
}))

vi.mock("~/lib/native-glass-panel", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/lib/native-glass-panel")>()
  return {
    ...actual,
    shouldUseNativeGlassControls: () => mocks.admitted,
    syncNativeGlassControls: (...args: unknown[]) => mocks.sync(...args),
  }
})

/**
 * jsdom lays nothing out, so every element reports a zero rectangle. The
 * provider measures the DOM twin, so each test states the geometry it wants to
 * see travel to the plugin instead of fighting the missing layout engine.
 */
let rects = new WeakMap<Element, DOMRect>()
let widths = new WeakMap<Element, number>()

function measure(element: Element, rect: DOMRectInit) {
  rects.set(element, DOMRect.fromRect(rect))
}

/**
 * jsdom's cascade does not resolve `border-radius`, so the radius the provider
 * reads back has to be supplied for the measured element only; every other
 * lookup still reaches the real implementation.
 */
function measureCornerRadius(element: Element, radius: string) {
  const original = window.getComputedStyle.bind(window)
  vi.spyOn(window, "getComputedStyle").mockImplementation((target, pseudo) => {
    if (target === element) {
      return { borderTopLeftRadius: radius } as CSSStyleDeclaration
    }
    return original(target as Element, pseudo)
  })
}

let frames: FrameRequestCallback[] = []

async function settle() {
  const pending = frames.splice(0)
  await act(async () => {
    for (const callback of pending) callback(0)
  })
  await waitFor(() => {})
}

function LocateTwin({
  onEvent,
}: {
  onEvent?: (event: NativeGlassControlEvent) => void
}) {
  const { controlRef } = useNativeGlassControl(
    "locate",
    { kind: "icon-button", icon: "locate-fixed", label: "回到我的位置" },
    onEvent
  )

  return (
    <button
      ref={controlRef}
      type="button"
      data-native-glass-control="locate"
      style={{ borderRadius: "10px" }}
    >
      回到我的位置
    </button>
  )
}

function MenuTwin() {
  const { controlRef, panelRef } = useNativeGlassControl("map-tools", {
    kind: "menu",
    icon: "menu",
    label: "展开地图工具",
    expanded: true,
    items: [
      { id: "filter", icon: "list-filter", label: "筛选" },
      { id: "attribution", icon: "info", label: "数据来源" },
    ],
  })

  return (
    <>
      <button
        ref={controlRef}
        type="button"
        data-native-glass-control="map-tools"
      >
        地图工具
      </button>
      <div ref={panelRef} data-native-glass-twin="map-tools" />
    </>
  )
}

function locateButton() {
  return screen.getByRole("button", { name: "回到我的位置" })
}

function lastControls(): NativeGlassControl[] {
  const call = mocks.sync.mock.calls.at(-1)
  return (call?.[0] ?? []) as NativeGlassControl[]
}

beforeEach(() => {
  mocks.admitted = true
  mocks.sync.mockReset()
  mocks.sync.mockResolvedValue({ supported: true })
  rects = new WeakMap()
  widths = new WeakMap()
  frames = []

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return (
        rects.get(this) ?? DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 })
      )
    }
  )
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: Element) {
      return widths.get(this) ?? 0
    },
  })
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback)
    return frames.length
  })
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
})

describe("native glass control overlay", () => {
  it("does not reach the plugin after a viewport change when not admitted", async () => {
    mocks.admitted = false
    render(
      <NativeGlassControlsProvider>
        <LocateTwin />
      </NativeGlassControlsProvider>
    )

    await settle()
    act(() => {
      window.dispatchEvent(new Event("resize"))
    })
    await settle()

    expect(mocks.sync).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.nativeGlass).toBeUndefined()
  })

  it("registers nothing when no provider owns the page", async () => {
    render(<LocateTwin />)
    await settle()

    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it("hides the DOM twin only after the plugin accepts the measured set", async () => {
    render(
      <NativeGlassControlsProvider>
        <LocateTwin />
      </NativeGlassControlsProvider>
    )
    measure(locateButton(), { x: 12, y: 400, width: 40, height: 40 })
    measureCornerRadius(locateButton(), "10px")

    await settle()

    expect(lastControls()).toEqual([
      {
        id: "locate",
        kind: "icon-button",
        icon: "locate-fixed",
        label: "回到我的位置",
        frame: { x: 12, y: 400, width: 40, height: 40 },
        cornerRadius: 10,
        active: false,
        disabled: false,
      },
    ])
    await waitFor(() =>
      expect(document.documentElement.dataset.nativeGlass).toBe("controls")
    )
  })

  it("keeps the twins when the plugin declines the control set", async () => {
    mocks.sync.mockResolvedValue({ supported: false })
    render(
      <NativeGlassControlsProvider>
        <LocateTwin />
      </NativeGlassControlsProvider>
    )
    measure(locateButton(), { x: 12, y: 400, width: 40, height: 40 })

    await settle()

    expect(mocks.sync).toHaveBeenCalledTimes(1)
    expect(document.documentElement.dataset.nativeGlass).toBeUndefined()
  })

  it("treats a rejected plugin call as an unsupported platform", async () => {
    mocks.sync.mockRejectedValue(new Error("no such command"))
    render(
      <NativeGlassControlsProvider>
        <LocateTwin />
      </NativeGlassControlsProvider>
    )
    measure(locateButton(), { x: 12, y: 400, width: 40, height: 40 })

    await settle()

    expect(document.documentElement.dataset.nativeGlass).toBeUndefined()
  })

  it("sends an empty set while a modal suppresses the native tab bar", async () => {
    render(
      <NativeGlassControlsProvider>
        <LocateTwin />
      </NativeGlassControlsProvider>
    )
    measure(locateButton(), { x: 12, y: 400, width: 40, height: 40 })
    await settle()
    expect(lastControls()).toHaveLength(1)

    act(() => {
      window.dispatchEvent(
        new CustomEvent(NATIVE_TAB_BAR_SUPPRESSION_EVENT, {
          detail: { suppressed: true },
        })
      )
    })
    await settle()

    expect(lastControls()).toEqual([])
  })

  it("forwards the menu panel width and items", async () => {
    render(
      <NativeGlassControlsProvider>
        <MenuTwin />
      </NativeGlassControlsProvider>
    )
    const trigger = screen.getByRole("button", { name: "地图工具" })
    const panel = document.querySelector('[data-native-glass-twin="map-tools"]')
    measure(trigger, { x: 300, y: 640, width: 40, height: 40 })
    if (panel) widths.set(panel, 144)

    await settle()

    expect(lastControls()).toEqual([
      {
        id: "map-tools",
        kind: "menu",
        icon: "menu",
        label: "展开地图工具",
        frame: { x: 300, y: 640, width: 40, height: 40 },
        cornerRadius: 0,
        expanded: true,
        panelWidth: 144,
        items: [
          { id: "filter", icon: "list-filter", label: "筛选" },
          { id: "attribution", icon: "info", label: "数据来源" },
        ],
      },
    ])
  })

  it("routes a native press to the registered control and ignores the rest", async () => {
    const onEvent = vi.fn()
    render(
      <NativeGlassControlsProvider>
        <LocateTwin onEvent={onEvent} />
      </NativeGlassControlsProvider>
    )
    measure(locateButton(), { x: 12, y: 400, width: 40, height: 40 })
    await settle()

    const dispatch = (detail: unknown) => {
      act(() => {
        window.dispatchEvent(
          new CustomEvent(NATIVE_GLASS_CONTROL_EVENT, { detail })
        )
      })
    }

    dispatch({ id: "locate", action: "press" })
    expect(onEvent).toHaveBeenCalledWith({ id: "locate", action: "press" })

    onEvent.mockClear()
    dispatch({ id: "refresh", action: "press" })
    dispatch({ id: "locate", action: "menu-item" })
    dispatch({ id: "locate", action: "press", itemId: 7 })
    dispatch(null)
    expect(onEvent).not.toHaveBeenCalled()
  })

  it("re-syncs on a viewport change", async () => {
    render(
      <NativeGlassControlsProvider>
        <LocateTwin />
      </NativeGlassControlsProvider>
    )
    measure(locateButton(), { x: 12, y: 400, width: 40, height: 40 })
    await settle()

    act(() => {
      window.dispatchEvent(new Event("resize"))
    })
    await settle()

    expect(mocks.sync).toHaveBeenCalledTimes(2)
  })

  it("clears the native set and the marker on unmount", async () => {
    const view = render(
      <NativeGlassControlsProvider>
        <LocateTwin />
      </NativeGlassControlsProvider>
    )
    measure(locateButton(), { x: 12, y: 400, width: 40, height: 40 })
    await settle()
    await waitFor(() =>
      expect(document.documentElement.dataset.nativeGlass).toBe("controls")
    )

    view.unmount()
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(2))

    expect(lastControls()).toEqual([])
    expect(document.documentElement.dataset.nativeGlass).toBeUndefined()
  })
})
