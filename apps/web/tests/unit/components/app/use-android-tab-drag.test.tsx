import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useAndroidTabDrag } from "~/components/app/use-android-tab-drag"
import { blockNativeTabBarInteraction } from "~/lib/native-tab-bar-suppression"

function setup(enabled = true) {
  const select = vi.fn()
  function Harness({ index = 0, route = "/" }) {
    const drag = useAndroidTabDrag({
      enabled,
      selectedIndex: index,
      count: 5,
      routeKey: route,
      onSelect: select,
    })
    return (
      <div {...drag} data-testid="bar">
        <a href="/apps" onClick={(event) => event.preventDefault()}>
          Tab
        </a>
      </div>
    )
  }
  const view = render(<Harness />)
  const bar = screen.getByTestId("bar")
  bar.style.padding = "4px"
  vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
    left: 0,
    width: 508,
  } as DOMRect)
  bar.setPointerCapture = vi.fn()
  bar.hasPointerCapture = vi.fn(() => true)
  bar.releasePointerCapture = vi.fn()
  const pointer = (x: number, y = 20, extra = {}) => ({
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
    ...extra,
  })
  const down = (x = 54, y = 20, extra = {}) =>
    fireEvent.pointerDown(bar, pointer(x, y, extra))
  const move = (x: number, y = 20, extra = {}) =>
    fireEvent.pointerMove(bar, pointer(x, y, extra))
  const up = (x: number) => fireEvent.pointerUp(bar, pointer(x))
  return { bar, select, view, Harness, down, move, up }
}

describe("useAndroidTabDrag", () => {
  it("follows fractional positions without layout reads per move and commits once at the nearest release slot", () => {
    const { bar, select, down, move, up } = setup()
    down()
    move(214)
    expect(bar.style.getPropertyValue("--android-tab-index")).toBe("1.6")
    move(254)
    expect(bar.getBoundingClientRect).toHaveBeenCalledTimes(1)
    expect(select).not.toHaveBeenCalled()
    up(314)
    expect(select).toHaveBeenCalledExactlyOnceWith(3)
    expect(bar).not.toHaveAttribute("data-tab-dragging")
    expect(bar.style.getPropertyValue("--android-tab-index")).toBe("")
    expect(fireEvent.click(screen.getByRole("link"), { detail: 1 })).toBe(false)
    up(314)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it("aligns fractional lens centers with measured asymmetric padding", () => {
    const { bar, select, down, move, up } = setup()
    bar.style.paddingLeft = "6px"
    bar.style.paddingRight = "14px"
    vi.mocked(bar.getBoundingClientRect).mockReturnValue({
      left: 30,
      width: 520,
    } as DOMRect)
    const computedStyle = vi.spyOn(window, "getComputedStyle")
    down(86)
    // Content starts at 36px and has five 100px slots. Slot 1.75's
    // center must follow the pointer at 36 + (1.75 + 0.5) * 100.
    move(261)
    expect(bar.style.getPropertyValue("--android-tab-index")).toBe("1.75")
    move(286)
    expect(bar.style.getPropertyValue("--android-tab-index")).toBe("2")
    expect(bar.getBoundingClientRect).toHaveBeenCalledTimes(1)
    expect(computedStyle).toHaveBeenCalledTimes(1)
    expect(select).not.toHaveBeenCalled()
    up(286)
    expect(select).toHaveBeenCalledExactlyOnceWith(2)
  })

  it.each(["resize", "orientationchange"])(
    "cancels on %s instead of committing with stale geometry",
    (event) => {
      const { bar, down, move, up, select } = setup()
      down()
      move(254)
      fireEvent(window, new Event(event))
      expect(bar).not.toHaveAttribute("data-tab-dragging")
      expect(bar.style.getPropertyValue("--android-tab-index")).toBe("")
      expect(bar.releasePointerCapture).toHaveBeenCalledWith(1)
      up(454)
      expect(select).not.toHaveBeenCalled()
      // A new gesture measures the resized capsule and can navigate again.
      vi.mocked(bar.getBoundingClientRect).mockReturnValue({
        left: 0,
        width: 258,
      } as DOMRect)
      down(29)
      move(179)
      up(179)
      expect(select).toHaveBeenCalledExactlyOnceWith(3)
      expect(bar.getBoundingClientRect).toHaveBeenCalledTimes(2)
    }
  )

  it.each([
    [-200, 0],
    [1000, 4],
  ])("clamps release %s to slot %s", (x, index) => {
    const { select, down, move, up } = setup()
    down()
    move(x)
    up(x)
    expect(select).toHaveBeenCalledExactlyOnceWith(index)
  })

  it.each(["pointerCancel", "lostPointerCapture"])(
    "restores selection on %s without navigation",
    (event) => {
      const { bar, select, down, move, up } = setup()
      down()
      move(454)
      fireEvent[event as "pointerCancel"](bar, { pointerId: 1 })
      up(454)
      expect(bar).not.toHaveAttribute("data-tab-dragging")
      expect(select).not.toHaveBeenCalled()
    }
  )

  it("ignores the link's bubbling capture loss when touch capture transfers to the capsule", () => {
    const { down, move, up, select } = setup()
    down()
    move(254)
    fireEvent.lostPointerCapture(screen.getByRole("link"), { pointerId: 1 })
    up(254)
    expect(select).toHaveBeenCalledExactlyOnceWith(2)
  })

  it("rejects vertical intent and leaves taps to the links", () => {
    const { bar, select, down, move, up } = setup()
    down()
    move(56, 60)
    move(454)
    up(454)
    expect(bar).not.toHaveAttribute("data-tab-dragging")
    down()
    up(54)
    expect(select).not.toHaveBeenCalled()
    expect(bar.setPointerCapture).not.toHaveBeenCalled()
  })

  it("ignores disabled, modified, non-primary and secondary pointer starts", () => {
    const disabled = setup(false)
    disabled.down()
    disabled.move(454)
    disabled.up(454)
    expect(disabled.select).not.toHaveBeenCalled()
    disabled.view.unmount()
    const { down, move, up, select } = setup()
    for (const extra of [
      { ctrlKey: true },
      { button: 1 },
      { isPrimary: false },
    ]) {
      down(54, 20, extra)
      move(454)
      up(454)
    }
    expect(select).not.toHaveBeenCalled()
    down()
    move(454, 20, { pointerId: 2 })
    up(54)
    expect(select).not.toHaveBeenCalled()
  })

  it("cancels synchronously when the interaction lease starts and rejects blocked starts", () => {
    const { bar, down, move, up, select } = setup()
    down()
    move(254)
    let release!: () => void
    act(() => {
      release = blockNativeTabBarInteraction()
    })
    expect(bar).not.toHaveAttribute("data-tab-dragging")
    up(454)
    down()
    move(454)
    up(454)
    expect(select).not.toHaveBeenCalled()
    act(() => release())
    down()
    move(454)
    up(454)
    expect(select).toHaveBeenCalledExactlyOnceWith(4)
  })

  it("cancels on route change and releases capture on teardown", () => {
    const { bar, down, move, up, select, view, Harness } = setup()
    down()
    move(254)
    view.rerender(<Harness route="/community" />)
    up(454)
    expect(select).not.toHaveBeenCalled()
    down()
    move(254)
    view.unmount()
    expect(bar.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it("suppresses only the post-drag pointer click, preserving keyboard and modifier clicks", () => {
    const { bar, down, move, up } = setup()
    const clicks = vi.fn()
    bar.addEventListener("click", clicks)
    down()
    move(254)
    up(254)
    fireEvent.click(bar, { detail: 0 })
    fireEvent.click(bar, { detail: 1, ctrlKey: true })
    expect(clicks).toHaveBeenCalledTimes(2)
    fireEvent.click(bar, { detail: 1 })
    expect(clicks).toHaveBeenCalledTimes(2)
    fireEvent.click(bar, { detail: 1 })
    expect(clicks).toHaveBeenCalledTimes(3)
  })
})
