import { act, render, screen } from "@testing-library/react"
import { useRef, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LONG_PRESS_DURATION_MS, useLongPress } from "~/lib/use-long-press"

/** 一个「瓦片」：容器里一个直接子按钮（真实瓦片就是这个形状）+ 一个更深的嵌套链接。 */
function Harness({
  enabled = true,
  onLongPress,
  onTap,
}: {
  enabled?: boolean
  onLongPress: () => void
  onTap?: () => void
}) {
  const targetRef = useRef<HTMLDivElement | null>(null)
  useLongPress({ targetRef, enabled, onLongPress })
  return (
    <div ref={targetRef} data-testid="press-area">
      <button type="button" onClick={onTap}>
        瓦片
      </button>
      <div>
        <a href="#nested">嵌套链接</a>
      </div>
    </div>
  )
}

/** jsdom 里没有 `PointerEvent`：用 `MouseEvent` 加挂指针字段（钩子只读这几项）。 */
function pointerLike(
  type: string,
  clientX: number,
  clientY: number,
  pointerType = "touch"
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    button: 0,
  })
  const extra = { isPrimary: true, pointerId: 1, pointerType }
  for (const [key, value] of Object.entries(extra)) {
    Object.defineProperty(event, key, { value })
  }
  return event
}

function press(target: Element, clientX = 10, clientY = 10, pointerType = "touch") {
  target.dispatchEvent(pointerLike("pointerdown", clientX, clientY, pointerType))
}

function tileButton(): HTMLElement {
  return screen.getByRole("button", { name: "瓦片" })
}

/** 推进长按计时（假定时器）：到点才算触发。 */
async function advanceHold(ms = LONG_PRESS_DURATION_MS) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

function clickOn(target: Element) {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("useLongPress", () => {
  it("fires only after the full 450ms hold on the container's own control", async () => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)

    press(tileButton())
    await advanceHold(LONG_PRESS_DURATION_MS - 1)
    expect(onLongPress).not.toHaveBeenCalled()

    await advanceHold(1)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it("ignores mouse pointers: the desktop toolbar button is the entry there", async () => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)

    press(tileButton(), 10, 10, "mouse")
    await advanceHold(LONG_PRESS_DURATION_MS * 2)

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it("cancels past 8px of movement and survives a smaller wobble", async () => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)
    const tile = tileButton()

    press(tile)
    tile.dispatchEvent(pointerLike("pointermove", 19, 10))
    await advanceHold()
    expect(onLongPress, "9px 已超出容差").not.toHaveBeenCalled()

    // 同一根手指再来一次：抖动 4px 仍然是长按。
    press(tile)
    tile.dispatchEvent(pointerLike("pointermove", 14, 10))
    await advanceHold()
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it("cancels on pointerup, pointercancel, wheel, window blur and visibilitychange", async () => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)
    const area = screen.getByTestId("press-area")

    const cancels: Array<[string, () => void]> = [
      ["pointerup", () => tileButton().dispatchEvent(pointerLike("pointerup", 10, 10))],
      [
        "pointercancel",
        () => tileButton().dispatchEvent(pointerLike("pointercancel", 10, 10)),
      ],
      ["wheel", () => area.dispatchEvent(new Event("wheel"))],
      ["blur", () => window.dispatchEvent(new Event("blur"))],
      ["visibilitychange", () => document.dispatchEvent(new Event("visibilitychange"))],
    ]

    for (const [name, cancel] of cancels) {
      press(tileButton())
      cancel()
      await advanceHold()
      expect(onLongPress, name).not.toHaveBeenCalled()
    }
  })

  it("keeps a nested interactive control out of the gesture", async () => {
    const onLongPress = vi.fn()
    render(<Harness onLongPress={onLongPress} />)

    press(screen.getByRole("link", { name: "嵌套链接" }))
    await advanceHold()

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it("does nothing while disabled", async () => {
    const onLongPress = vi.fn()
    render(<Harness enabled={false} onLongPress={onLongPress} />)

    press(tileButton())
    await advanceHold(LONG_PRESS_DURATION_MS * 2)

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it("swallows the click the browser adds after a long press", async () => {
    const onLongPress = vi.fn()
    const onTap = vi.fn()
    render(<Harness onLongPress={onLongPress} onTap={onTap} />)
    const tile = tileButton()

    press(tile)
    await advanceHold()
    expect(onLongPress).toHaveBeenCalledTimes(1)

    clickOn(tile)
    expect(onTap).not.toHaveBeenCalled()
  })

  it("still swallows that click when the trigger turned the gesture off", async () => {
    // 真实接线就是这样：长按回调把 `enabled` 翻掉（进编辑模式），而浏览器补的 click 在之后。
    const onTap = vi.fn()
    function TriggerHarness() {
      const targetRef = useRef<HTMLDivElement | null>(null)
      const [enabled, setEnabled] = useState(true)
      useLongPress({
        targetRef,
        enabled,
        onLongPress: () => setEnabled(false),
      })
      return (
        <div ref={targetRef} data-testid="press-area">
          <button type="button" onClick={onTap}>
            瓦片
          </button>
        </div>
      )
    }
    render(<TriggerHarness />)
    const tile = tileButton()

    press(tile)
    await advanceHold()
    await act(async () => {})

    clickOn(tile)
    expect(onTap).not.toHaveBeenCalled()
  })

  it("lets the next tap through when the long press never produced a click", async () => {
    const onLongPress = vi.fn()
    const onTap = vi.fn()
    render(<Harness onLongPress={onLongPress} onTap={onTap} />)
    const tile = tileButton()

    // 长按触发；Android 的长按会吃掉浏览器补的 click，窗口于是留在那儿。
    press(tile)
    await advanceHold()
    expect(onLongPress).toHaveBeenCalledTimes(1)

    // 紧接着的一次正常轻点：新的按下作废上一趟的窗口，这一下必须照常生效。
    press(tile)
    clickOn(tile)
    expect(onTap).toHaveBeenCalledTimes(1)
  })
})
