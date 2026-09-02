import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PullToRefresh } from "~/components/shared/pull-to-refresh"

// jsdom ships no TouchEvent constructor, and the hook only reads `touches`.
function touchEvent(type: "touchstart" | "touchmove" | "touchend", y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientY: y }],
  })
  return event
}

function pull(toY: number) {
  act(() => {
    window.dispatchEvent(touchEvent("touchstart", 0))
  })
  act(() => {
    window.dispatchEvent(touchEvent("touchmove", toY))
  })
}

function band() {
  return screen
    .getByText(/下拉刷新|松开立即刷新|正在刷新|已是最新/)
    .closest('[role="status"]')?.parentElement
}

describe("PullToRefresh", () => {
  it("stays out of the way until the finger moves", () => {
    render(
      <PullToRefresh onRefresh={vi.fn()}>
        <p>列表</p>
      </PullToRefresh>
    )

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.getByText("列表")).toBeVisible()
  })

  it("arms only past the threshold and reports each stage", async () => {
    let settle: () => void = () => undefined
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve
        })
    )
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>列表</p>
      </PullToRefresh>
    )

    // 0.6 of the finger travel, so 40px of drag opens a 24px band.
    pull(40)
    expect(screen.getByText("下拉刷新")).toBeVisible()
    expect(band()?.style.transform).toBe("translateY(24px)")

    act(() => {
      window.dispatchEvent(touchEvent("touchmove", 140))
    })
    expect(screen.getByText("松开立即刷新")).toBeVisible()
    expect(onRefresh).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(touchEvent("touchend", 140))
    })
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(screen.getByText("正在刷新")).toBeVisible()
    // Held open at the threshold for the length of the request.
    expect(band()?.style.transform).toBe("translateY(72px)")

    await act(async () => {
      settle()
    })
    expect(screen.getByText("已是最新")).toBeVisible()
    expect(band()?.style.transform).toBe("translateY(0px)")
  })

  it("releases a short pull without refreshing", () => {
    const onRefresh = vi.fn()
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>列表</p>
      </PullToRefresh>
    )

    pull(60)
    act(() => {
      window.dispatchEvent(touchEvent("touchend", 60))
    })

    expect(onRefresh).not.toHaveBeenCalled()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("ignores the gesture entirely when disabled", () => {
    const onRefresh = vi.fn()
    render(
      <PullToRefresh onRefresh={onRefresh} enabled={false}>
        <p>列表</p>
      </PullToRefresh>
    )

    pull(140)
    act(() => {
      window.dispatchEvent(touchEvent("touchend", 140))
    })

    expect(onRefresh).not.toHaveBeenCalled()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("anchors the pill to the band rather than the viewport", () => {
    render(
      <PullToRefresh onRefresh={vi.fn()}>
        <p>列表</p>
      </PullToRefresh>
    )
    pull(40)

    const pill = screen.getByRole("status")

    // Both layouts wrap the page in a z-10 stacking context, so a pill
    // anchored to the viewport resolves below the z-40 header whatever
    // z-index it claims. Riding the band is what keeps it visible.
    expect(pill.className).toContain("absolute")
    expect(pill.className).toContain("bottom-full")
    expect(pill.className).not.toContain("fixed")

    // The band already carries the pull distance; a second transform here
    // would move the pill twice as far as the list it belongs to.
    expect(pill.style.transform).toBe("")
  })
})
