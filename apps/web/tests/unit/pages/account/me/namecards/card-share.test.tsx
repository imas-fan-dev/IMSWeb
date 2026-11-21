import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeFudabaOwnerCard } from "@/mocks/data/fudaba"
import { makeNamecardCardLayout } from "@/mocks/data/namecards"
import { CardManager } from "~/pages/account/me/namecards/card-manager"
import { SHARE_EMPTY_HINT } from "~/pages/account/me/namecards/card-share-model"

const HANDLE = "haruka"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function shareLink() {
  return `${window.location.origin}/exchange/${HANDLE}`
}

function card(cardNumber: number, producerName: string) {
  return makeFudabaOwnerCard({
    id: `card-${cardNumber}`,
    cardNumber,
    producerName,
    // 快速清单只收 `published + auto` 且有线上页的卡（服务端读侧同口径）。
    exchangeMode: "auto",
  })
}

const CARDS = [card(1, "名片 A"), card(2, "名片 B")]

function managerProps(
  overrides: Partial<ComponentProps<typeof CardManager>> = {}
): ComponentProps<typeof CardManager> {
  return {
    cards: CARDS,
    layout: makeNamecardCardLayout({ defaultCardNumbers: [1, 2] }),
    accountId: "platform-1",
    selectedCardId: null,
    readOnly: false,
    shareHandle: HANDLE,
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onLayoutSaved: vi.fn(),
    ...overrides,
  }
}

function renderManager(
  overrides: Partial<ComponentProps<typeof CardManager>> = {}
) {
  const props = managerProps(overrides)
  render(<CardManager {...props} />)
  return props
}

/** 只有快速清单非空时才拿得到链接与二维码。 */
function layoutWithQuickList() {
  return makeNamecardCardLayout({
    defaultCardNumbers: [1, 2],
    quickCardNumbers: [1],
  })
}

/** jsdom 的 `matchMedia` 只认查询串，这里按断点给出结果（账号工作区的桌面分叉）。 */
function stubMatchMedia(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(
      (query: string) =>
        ({
          matches: query.includes("(min-width: 1024px)") ? desktop : false,
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

/** jsdom 没有 canvas 实现：给一个只记账的 2D 上下文，绘制路径照常跑完。 */
function stubCanvasContext() {
  const context = { fillStyle: "", fillRect: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  )
  return context
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
  Reflect.deleteProperty(navigator, "clipboard")
})

describe("CardManager share entry", () => {
  it("guides to edit mode instead of opening a panel when the quick list is empty", async () => {
    const user = userEvent.setup()
    stubMatchMedia(true)
    renderManager()

    const share = screen.getByRole("button", { name: "分享名片" })

    await user.hover(share)
    expect(await screen.findByText(SHARE_EMPTY_HINT)).toBeVisible()

    await user.click(share)
    expect(screen.getByText(SHARE_EMPTY_HINT)).toBeVisible()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.queryByRole("button", { name: "下载图片" })).toBeNull()
  })

  it("hides the share entry in editing mode", async () => {
    const user = userEvent.setup()
    stubMatchMedia(true)
    renderManager({ layout: layoutWithQuickList() })

    await user.click(screen.getByRole("button", { name: "编辑模式" }))

    expect(screen.queryByRole("button", { name: "分享名片" })).toBeNull()
  })

  it("opens the desktop panel with a QR canvas and the placeholder link", async () => {
    const user = userEvent.setup()
    stubMatchMedia(true)
    const context = stubCanvasContext()
    renderManager({ layout: layoutWithQuickList() })

    await user.click(screen.getByRole("button", { name: "分享名片" }))

    const panel = await screen.findByRole("dialog")
    expect(within(panel).getByText(shareLink())).toBeVisible()
    const canvas = panel.querySelector("canvas")
    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(canvas).toHaveAttribute("aria-label", "名片交换二维码")
    // 白底 + 每个黑色模块各一次调用，所以肯定不止一次。
    expect(context.fillRect.mock.calls.length).toBeGreaterThan(1)
  })

  it("opens the bottom sheet instead of the dialog on narrow screens", async () => {
    const user = userEvent.setup()
    stubMatchMedia(false)
    stubCanvasContext()
    renderManager({ layout: layoutWithQuickList() })

    await user.click(screen.getByRole("button", { name: "分享名片" }))

    await screen.findByRole("button", { name: "下载图片" })
    expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull()
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
  })
})

describe("CardShareDialog actions", () => {
  it("copies the link through the clipboard API", async () => {
    const user = userEvent.setup()
    stubMatchMedia(true)
    stubCanvasContext()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    renderManager({ layout: layoutWithQuickList() })

    await user.click(screen.getByRole("button", { name: "分享名片" }))
    await user.click(await screen.findByRole("button", { name: "复制链接" }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(shareLink()))
  })

  it("selects the link text when the clipboard is unavailable", async () => {
    const user = userEvent.setup()
    stubMatchMedia(true)
    stubCanvasContext()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    })
    renderManager({ layout: layoutWithQuickList() })

    await user.click(screen.getByRole("button", { name: "分享名片" }))
    await user.click(await screen.findByRole("button", { name: "复制链接" }))

    // jsdom 的 `Selection.toString()` 不实现文本拼接，改看「范围落在链接段落上」。
    await waitFor(() =>
      expect(window.getSelection()?.anchorNode?.textContent).toBe(shareLink())
    )
  })

  it("downloads the QR code as a PNG named after the handle", async () => {
    const user = userEvent.setup()
    stubMatchMedia(true)
    stubCanvasContext()
    const png = new Blob(["qr"], { type: "image/png" })
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(png)
    )
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:qr")
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloads.push(this.download)
    })
    renderManager({ layout: layoutWithQuickList() })

    await user.click(screen.getByRole("button", { name: "分享名片" }))
    await user.click(await screen.findByRole("button", { name: "下载图片" }))

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(png))
    expect(png.type).toBe("image/png")
    expect(downloads).toEqual([`imsweb-exchange-${HANDLE}.png`])
  })
})
