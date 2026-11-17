import { afterEach, describe, expect, it, vi } from "vitest"

import {
  canvasPngBlob,
  copyText,
  downloadBlob,
  drawQrCode,
  qrMatrix,
  QR_CANVAS_SIZE,
  selectText,
  shareHandleFor,
  shareImageFileName,
  shareLinkFor,
} from "~/pages/account/me/namecards/card-share-model"

const HANDLE = "haruka"

function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value,
  })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard")
})

describe("shareHandleFor", () => {
  it("prefers the public page slug and falls back to the numeric uid", () => {
    expect(shareHandleFor({ pageSlug: HANDLE, uid: 42 })).toBe(HANDLE)
    expect(shareHandleFor({ pageSlug: null, uid: 42 })).toBe("42")
  })
})

describe("shareLinkFor", () => {
  it("builds the placeholder /exchange/<handle> link from the shareable origin", () => {
    expect(shareLinkFor(HANDLE, "https://idol-master.top/")).toBe(
      `https://idol-master.top/exchange/${HANDLE}`
    )
  })

  it("defaults to the shareable origin of the current runtime", () => {
    expect(shareLinkFor(HANDLE)).toBe(
      `${window.location.origin}/exchange/${HANDLE}`
    )
  })

  it("escapes the handle so odd values cannot break the URL", () => {
    expect(shareLinkFor("a b", "https://idol-master.top")).toBe(
      "https://idol-master.top/exchange/a%20b"
    )
  })
})

describe("shareImageFileName", () => {
  it("names the download after the handle", () => {
    expect(shareImageFileName(HANDLE)).toBe(`imsweb-exchange-${HANDLE}.png`)
  })
})

describe("qrMatrix", () => {
  it("returns a square, non-empty module matrix", () => {
    const matrix = qrMatrix(shareLinkFor(HANDLE))
    const count = matrix.length

    expect(count).toBeGreaterThanOrEqual(21)
    for (const row of matrix) expect(row).toHaveLength(count)
    const dark = matrix.flat().filter(Boolean).length
    // 全黑/全白都不是二维码：两种模块都得有。
    expect(dark).toBeGreaterThan(0)
    expect(dark).toBeLessThan(count * count)
  })

  it("is deterministic for the same link", () => {
    expect(qrMatrix("https://idol-master.top/exchange/x")).toEqual(
      qrMatrix("https://idol-master.top/exchange/x")
    )
  })
})

function fakeCanvas() {
  const context = {
    fillStyle: "",
    fillRect: vi.fn(),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement
  return { canvas, context }
}

describe("drawQrCode", () => {
  it("sizes the canvas and paints a light background plus the dark modules", () => {
    const { canvas, context } = fakeCanvas()
    const matrix = qrMatrix(shareLinkFor(HANDLE))

    drawQrCode(canvas, matrix)

    expect(canvas.width).toBe(QR_CANVAS_SIZE)
    expect(canvas.height).toBe(QR_CANVAS_SIZE)
    // 背景一次 + 每个黑色模块一次。
    expect(context.fillRect).toHaveBeenCalledTimes(
      matrix.flat().filter(Boolean).length + 1
    )
  })

  it("does nothing when the runtime has no 2d context", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    const canvas = document.createElement("canvas")

    drawQrCode(canvas, qrMatrix(shareLinkFor(HANDLE)))

    expect(canvas.width).toBe(300)
  })
})

describe("canvasPngBlob", () => {
  it("resolves with the PNG the canvas produced", async () => {
    const blob = new Blob(["png"], { type: "image/png" })
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(blob)
    )
    const canvas = document.createElement("canvas")

    await expect(canvasPngBlob(canvas)).resolves.toBe(blob)
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/png"
    )
  })

  it("rejects when the runtime cannot produce a blob", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(null)
    )

    await expect(
      canvasPngBlob(document.createElement("canvas"))
    ).rejects.toThrow("导出分享图片失败")
  })
})

describe("downloadBlob", () => {
  it("downloads through an object URL and revokes it afterwards", () => {
    const blob = new Blob(["png"], { type: "image/png" })
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:share")
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined)
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloads.push(this.download)
    })

    downloadBlob(blob, shareImageFileName(HANDLE))

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(downloads).toEqual([`imsweb-exchange-${HANDLE}.png`])
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:share")
  })
})

describe("copyText", () => {
  it("writes to the clipboard and reports success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard({ writeText })

    await expect(copyText("https://idol-master.top/exchange/x")).resolves.toBe(
      true
    )
    expect(writeText).toHaveBeenCalledWith("https://idol-master.top/exchange/x")
  })

  it("reports failure when the clipboard rejects or is missing", async () => {
    stubClipboard({
      writeText: vi.fn().mockRejectedValue(new Error("denied")),
    })
    await expect(copyText("x")).resolves.toBe(false)

    Reflect.deleteProperty(navigator, "clipboard")
    await expect(copyText("x")).resolves.toBe(false)
  })
})

describe("selectText", () => {
  it("selects the node contents as the clipboard fallback", () => {
    const node = document.createElement("p")
    node.textContent = "https://idol-master.top/exchange/x"
    // jsdom 只接受挂在文档里的范围。
    document.body.append(node)

    selectText(node)

    // jsdom 的 `Selection.toString()` 不实现文本拼接，改看「范围落在哪个节点上」。
    const selection = window.getSelection()
    expect(selection?.rangeCount).toBe(1)
    expect(selection?.anchorNode).toBe(node)
    expect(selection?.isCollapsed).toBe(false)
  })
})
