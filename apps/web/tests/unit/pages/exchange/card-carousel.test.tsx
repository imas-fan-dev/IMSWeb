import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CardCarousel } from "~/pages/exchange/card-carousel"
import {
  CAROUSEL_AUTO_ADVANCE_MS,
  CAROUSEL_TRANSITION_MS,
} from "~/pages/exchange/card-carousel-model"

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

function counter() {
  return screen.getByText(/^\d+\/\d+$/).textContent
}

function trackTransform() {
  const track = document.querySelector('[data-slot="carousel-track"]')
  return track instanceof HTMLElement ? track.style.transform : ""
}

/** 循环落位后要等一次瞬移，否则停在克隆格上（真身那张此时没挂载）。 */
async function settleTrack() {
  await act(async () => {
    vi.advanceTimersByTime(CAROUSEL_TRANSITION_MS + 20)
  })
}

/** 推进自动播放：定时器回调里 setState，必须包在 act 里。 */
async function advanceCarousel(ms = CAROUSEL_AUTO_ADVANCE_MS) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

function drag(from: number, to: number) {
  const region = carousel()
  fireEvent.pointerDown(region, { clientX: from })
  fireEvent.pointerMove(region, { clientX: to })
}

beforeEach(() => {
  // 划动判据读 `performance.now()`（拨动速度），所以计时器要连带把 performance 一起接管。
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "performance",
    ],
  })
  stubMatchMedia(false)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("CardCarousel auto play", () => {
  it("advances every 4s and wraps from the last page back to the first", async () => {
    render(<CardCarousel slides={SLIDES} />)

    expect(screen.getByRole("img", { name: "名片 1" })).toBeTruthy()
    expect(counter()).toBe("1/3")

    await advanceCarousel()
    expect(counter()).toBe("2/3")
    await settleTrack()

    await advanceCarousel()
    expect(counter()).toBe("3/3")
    await settleTrack()

    // 末张再走一张：落到首张的克隆格，停稳后回到真身。
    await advanceCarousel()
    expect(counter()).toBe("1/3")
    await settleTrack()
    expect(screen.getByRole("img", { name: "名片 1" })).toBeTruthy()
  })

  it("pauses while the pointer hovers and resumes after it leaves", async () => {
    render(<CardCarousel slides={SLIDES} />)
    const region = carousel()

    fireEvent.pointerOver(region, { pointerType: "mouse" })
    await advanceCarousel(6000)
    expect(counter()).toBe("1/3")

    fireEvent.pointerOut(region, { pointerType: "mouse" })
    await advanceCarousel()
    expect(counter()).toBe("2/3")
  })

  it("stays paused while a touch is held down", async () => {
    render(<CardCarousel slides={SLIDES} />)
    const region = carousel()

    fireEvent.pointerDown(region, { clientX: 10 })
    await advanceCarousel(6000)
    expect(counter()).toBe("1/3")

    fireEvent.pointerUp(region)
    await advanceCarousel()
    expect(counter()).toBe("2/3")
  })

  it("does not auto play under prefers-reduced-motion", async () => {
    stubMatchMedia(true)
    render(<CardCarousel slides={SLIDES} />)

    await advanceCarousel(20_000)
    expect(counter()).toBe("1/3")
  })

  it("renders no controls when there is only one page", async () => {
    render(<CardCarousel slides={[slide(1, "已拥有")]} />)

    expect(screen.getByRole("img", { name: "名片 1" })).toBeTruthy()
    // 单张时控件与计数都不渲染，但「已拥有」这类内容角标照旧。
    expect(screen.queryByRole("button", { name: "下一张" })).toBeNull()
    expect(screen.queryByRole("button", { name: "上一张" })).toBeNull()
    expect(screen.queryByText(/^\d+\/\d+$/)).toBeNull()
    expect(screen.getByText("已拥有")).toBeTruthy()

    await advanceCarousel(20_000)
    expect(screen.getByRole("img", { name: "名片 1" })).toBeTruthy()
  })
})

describe("CardCarousel manual switching", () => {
  it("steps over both ends without disabling the arrows", async () => {
    render(<CardCarousel slides={SLIDES} />)

    expect(screen.getByRole("button", { name: "上一张" })).not.toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "下一张" }))
    fireEvent.click(screen.getByRole("button", { name: "下一张" }))
    expect(counter()).toBe("3/3")

    // 末张再点「下一张」回到首张，而不是被禁用。
    fireEvent.click(screen.getByRole("button", { name: "下一张" }))
    expect(counter()).toBe("1/3")
    await settleTrack()

    fireEvent.click(screen.getByRole("button", { name: "上一张" }))
    expect(counter()).toBe("3/3")
  })

  it("switches with the arrow keys on the focused region", () => {
    render(<CardCarousel slides={SLIDES} />)
    const region = carousel()

    fireEvent.keyDown(region, { key: "ArrowRight" })
    expect(counter()).toBe("2/3")

    fireEvent.keyDown(region, { key: "ArrowLeft" })
    expect(counter()).toBe("1/3")
  })

  it("jumps to the page picked by the indicator dots", () => {
    render(<CardCarousel slides={SLIDES} />)

    fireEvent.click(screen.getByRole("button", { name: "第 3 张，共 3 张" }))
    expect(counter()).toBe("3/3")
    expect(screen.getByRole("img", { name: "名片 3" })).toBeTruthy()
  })

  it("follows the pointer while dragging and settles on release", async () => {
    render(<CardCarousel slides={SLIDES} />)

    // 拖动过程中图片跟着走：轨道上带上了像素偏移，但还没换张。
    drag(200, 120)
    expect(counter()).toBe("1/3")
    expect(trackTransform()).toContain("-80px")

    fireEvent.pointerUp(carousel())
    expect(counter()).toBe("2/3")
    await settleTrack()
    expect(trackTransform()).not.toMatch(/-\d+px/)
  })

  it("snaps back when the drag is too short to count", async () => {
    render(<CardCarousel slides={SLIDES} />)

    drag(200, 192)
    expect(trackTransform()).toContain("-8px")

    fireEvent.pointerUp(carousel())
    expect(counter()).toBe("1/3")
    await settleTrack()
    expect(trackTransform()).not.toMatch(/-\d+px/)
  })

  it("steps on a quick flick even when the drag is short", async () => {
    render(<CardCarousel slides={SLIDES} />)

    drag(200, 184)
    fireEvent.pointerUp(carousel())

    expect(counter()).toBe("2/3")
    await settleTrack()
  })

  it("keeps the page when a short drag is slow", async () => {
    render(<CardCarousel slides={SLIDES} />)
    const region = carousel()

    fireEvent.pointerDown(region, { clientX: 200 })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    fireEvent.pointerMove(region, { clientX: 184 })
    fireEvent.pointerUp(region)

    expect(counter()).toBe("1/3")
  })

  it("finishes the drag after the pointer leaves the preview", async () => {
    render(<CardCarousel slides={SLIDES} />)

    drag(200, 100)
    fireEvent.pointerLeave(carousel())
    // 离开预览不等于放弃：还在按住，落位等松手。
    expect(counter()).toBe("1/3")

    fireEvent.pointerUp(carousel())
    expect(counter()).toBe("2/3")
    await settleTrack()
  })

  it("does not start a drag from the arrows", async () => {
    render(<CardCarousel slides={SLIDES} />)
    const next = screen.getByRole("button", { name: "下一张" })

    fireEvent.pointerDown(next, { clientX: 200 })
    fireEvent.pointerMove(next, { clientX: 120 })
    // 没跟随光标：按下点在按钮上时不进拖动（否则指针捕获会把 click 抢走，按钮就点不动）。
    expect(trackTransform()).not.toMatch(/-\d+px/)

    fireEvent.pointerUp(next)
    expect(counter()).toBe("1/3")
  })

  it("wraps when dragging past the first page", async () => {
    render(<CardCarousel slides={SLIDES} />)

    // 首张向右拖：露出末张克隆，松手后落到末张。
    drag(120, 260)
    expect(counter()).toBe("1/3")

    fireEvent.pointerUp(carousel())
    expect(counter()).toBe("3/3")
    await settleTrack()
    expect(screen.getByRole("img", { name: "名片 3" })).toBeTruthy()
  })
})

describe("CardCarousel badges", () => {
  it("keeps the badge on whichever page is active", async () => {
    render(
      <CardCarousel
        slides={[slide(1, "已拥有"), slide(2), slide(3, "已拥有")]}
      />
    )

    const activeBadges = () =>
      within(document.querySelector('[data-active="true"]') as HTMLElement)
        .queryAllByText("已拥有")
        .length

    expect(activeBadges()).toBe(1)

    fireEvent.click(screen.getByRole("button", { name: "下一张" }))
    expect(activeBadges()).toBe(0)

    fireEvent.click(screen.getByRole("button", { name: "下一张" }))
    expect(activeBadges()).toBe(1)
  })
})
