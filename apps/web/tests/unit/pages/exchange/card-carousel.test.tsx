import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CardCarousel } from "~/pages/exchange/card-carousel"
import { CAROUSEL_AUTO_ADVANCE_MS } from "~/pages/exchange/card-carousel-model"

function slide(position: number, badge?: string | null) {
  return {
    key: `page-${position}`,
    url: `/cards/${position}.jpg`,
    alt: `名片 ${position}`,
    badge,
  }
}

const SLIDES = [slide(1), slide(2), slide(3)]

/** `useMediaQuery` 只读 `matches`；jsdom 的 matchMedia 只认查询串。 */
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(
      (query: string) =>
        ({
          matches,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(() => true),
        }) as unknown as MediaQueryList
    )
  )
}

function carousel() {
  return screen.getByRole("group", { name: "名片预览" })
}

function shownImage(name: string) {
  return screen.getByRole("img", { name })
}

/** 推进自动播放：定时器回调里 setState，必须包在 act 里。 */
async function advanceCarousel(ms = CAROUSEL_AUTO_ADVANCE_MS) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  stubMatchMedia(false)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("CardCarousel auto play", () => {
  it("advances every 4s and wraps back to the first page", async () => {
    render(<CardCarousel slides={SLIDES} />)

    expect(shownImage("名片 1")).toBeTruthy()
    expect(screen.getByText("1/3")).toBeTruthy()

    await advanceCarousel()
    expect(shownImage("名片 2")).toBeTruthy()
    expect(screen.getByText("2/3")).toBeTruthy()

    await advanceCarousel()
    expect(shownImage("名片 3")).toBeTruthy()

    await advanceCarousel()
    expect(shownImage("名片 1")).toBeTruthy()
  })

  it("pauses while the pointer hovers and resumes after it leaves", async () => {
    render(<CardCarousel slides={SLIDES} />)
    const region = carousel()

    fireEvent.pointerOver(region, { pointerType: "mouse" })
    await advanceCarousel(6000)
    expect(shownImage("名片 1")).toBeTruthy()

    fireEvent.pointerOut(region, { pointerType: "mouse" })
    await advanceCarousel()
    expect(shownImage("名片 2")).toBeTruthy()
  })

  it("stays paused while a touch is held down", async () => {
    render(<CardCarousel slides={SLIDES} />)
    const region = carousel()

    fireEvent.pointerDown(region, { clientX: 10 })
    await advanceCarousel(6000)
    expect(shownImage("名片 1")).toBeTruthy()

    fireEvent.pointerUp(region)
    await advanceCarousel()
    expect(shownImage("名片 2")).toBeTruthy()
  })

  it("does not auto play under prefers-reduced-motion", async () => {
    stubMatchMedia(true)
    render(<CardCarousel slides={SLIDES} />)

    await advanceCarousel(20_000)
    expect(shownImage("名片 1")).toBeTruthy()
  })

  it("renders no controls when there is only one page", async () => {
    render(<CardCarousel slides={[slide(1, "已拥有")]} />)

    expect(shownImage("名片 1")).toBeTruthy()
    // 单张时控件与计数都不渲染，但「已拥有」这类内容角标照旧。
    expect(screen.queryByRole("button", { name: "下一张" })).toBeNull()
    expect(screen.queryByRole("button", { name: "上一张" })).toBeNull()
    expect(screen.queryByText("1/1")).toBeNull()
    expect(screen.getByText("已拥有")).toBeTruthy()

    await advanceCarousel(20_000)
    expect(shownImage("名片 1")).toBeTruthy()
  })
})

describe("CardCarousel manual switching", () => {
  it("clamps the arrows at both ends", () => {
    render(<CardCarousel slides={SLIDES} />)

    expect(screen.getByRole("button", { name: "上一张" })).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "下一张" }))
    fireEvent.click(screen.getByRole("button", { name: "下一张" }))
    expect(shownImage("名片 3")).toBeTruthy()
    expect(screen.getByRole("button", { name: "下一张" })).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "上一张" }))
    expect(shownImage("名片 2")).toBeTruthy()
  })

  it("switches with the arrow keys on the focused region", () => {
    render(<CardCarousel slides={SLIDES} />)
    const region = carousel()

    fireEvent.keyDown(region, { key: "ArrowRight" })
    expect(shownImage("名片 2")).toBeTruthy()

    fireEvent.keyDown(region, { key: "ArrowLeft" })
    expect(shownImage("名片 1")).toBeTruthy()
  })

  it("jumps to the page picked by the indicator dots", () => {
    render(<CardCarousel slides={SLIDES} />)

    fireEvent.click(screen.getByRole("button", { name: "第 3 张，共 3 张" }))
    expect(shownImage("名片 3")).toBeTruthy()
    expect(screen.getByText("3/3")).toBeTruthy()
  })

  it("switches on a horizontal swipe and ignores a short drag", () => {
    render(<CardCarousel slides={SLIDES} />)
    const region = carousel()

    fireEvent.pointerDown(region, { clientX: 200 })
    fireEvent.pointerMove(region, { clientX: 180 })
    expect(shownImage("名片 1")).toBeTruthy()

    fireEvent.pointerMove(region, { clientX: 120 })
    expect(shownImage("名片 2")).toBeTruthy()

    fireEvent.pointerMove(region, { clientX: 40 })
    expect(shownImage("名片 3")).toBeTruthy()

    // 到头后继续划也不越界。
    fireEvent.pointerMove(region, { clientX: 0 })
    expect(shownImage("名片 3")).toBeTruthy()

    fireEvent.pointerUp(region)
    fireEvent.pointerDown(region, { clientX: 0 })
    fireEvent.pointerMove(region, { clientX: 120 })
    expect(shownImage("名片 2")).toBeTruthy()
  })
})
