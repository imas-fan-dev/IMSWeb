import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  computeTierListLayout,
  drawTierList,
  exportTierListPng,
  prepareExportImages,
  type TierListExportOptions,
} from "~/pages/tier-list/tier-list-export"
import {
  addItems,
  createTierItem,
  createTierListDocument,
  moveItem,
} from "~/pages/tier-list/tier-list-model"
import type {
  Tier,
  TierItem,
  TierListDocument,
} from "~/pages/tier-list/tier-list-model"

const defaultOptions: TierListExportOptions = {
  includePool: true,
  darkBackground: false,
}

function tier(id: string, label: string, color = "#ff7f7f"): Tier {
  return { id, label, color }
}

function item(id: string, src: string): TierItem {
  return { id, src, label: id, origin: "wiki" }
}

function makeDoc(overrides: Partial<TierListDocument> = {}): TierListDocument {
  return {
    version: 1,
    title: "测试",
    tiers: [],
    items: {},
    rows: {},
    pool: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

describe("computeTierListLayout", () => {
  it("lays out the title and empty template rows", () => {
    const doc = createTierListDocument()
    const layout = computeTierListLayout(doc, defaultOptions)

    expect(layout.width).toBe(1200)
    expect(layout.title).toEqual({ x: 24, y: 24, width: 1152, height: 96 })
    expect(layout.rows).toHaveLength(5)
    expect(layout.pool).toBeNull()

    const first = layout.rows[0]
    expect(first.label).toMatchObject({ x: 24, y: 120, width: 96 })
    expect(first.content).toMatchObject({ x: 128, y: 120, width: 1048 })
    // One empty row: one tile row plus vertical padding.
    expect(first.content.height).toBe(120)
    expect(first.tiles).toEqual([])

    // Rows stack with the 12px section gap; total height accounts for it.
    const second = layout.rows[1]
    expect(second.content.y).toBe(120 + 120 + 12)
    expect(layout.height).toBe(120 + 5 * (120 + 12) + 24 - 12)
  })

  it("wraps tiles into multiple rows of nine", () => {
    const doc = createTierListDocument()
    const tierId = doc.tiers[0].id
    const items = Array.from({ length: 10 }, (_, index) =>
      createTierItem(
        `/image/765/idol-${index}/icon.webp`,
        `偶像${index}`,
        "wiki"
      )
    )
    const placed = items.reduce(
      (acc, entry) => moveItem(addItems(acc, [entry]), entry.id, tierId, 0),
      doc
    )

    const layout = computeTierListLayout(placed, defaultOptions)
    const row = layout.rows[0]
    expect(row.tiles).toHaveLength(10)

    // Two tile rows: 96 + 12 gap + vertical padding.
    expect(row.content.height).toBe(96 * 2 + 12 + 12 * 2)

    const [first, tenth] = [row.tiles[0], row.tiles[9]]
    expect(first).toMatchObject({
      x: row.content.x + 12,
      y: row.content.y + 12,
      size: 96,
    })
    // Tenth tile starts a new row.
    expect(tenth).toMatchObject({
      x: row.content.x + 12,
      y: row.content.y + 12 + 96 + 12,
    })
  })

  it("keeps tiles horizontally aligned within a row", () => {
    const doc = createTierListDocument()
    const tierId = doc.tiers[0].id
    const items = [0, 1].map((index) =>
      createTierItem(
        `/image/765/idol-${index}/icon.webp`,
        `偶像${index}`,
        "wiki"
      )
    )
    const placed = items.reduce(
      (acc, entry) => moveItem(addItems(acc, [entry]), entry.id, tierId, 0),
      doc
    )

    const layout = computeTierListLayout(placed, defaultOptions)
    const [a, b] = layout.rows[0].tiles
    expect(b.x - a.x).toBe(96 + 12)
    expect(a.y).toBe(b.y)
  })

  it("adds the pool section only when requested and non-empty", () => {
    const doc = createTierListDocument()
    const entry = createTierItem("/image/765/idol/icon.webp", "偶像", "wiki")
    const withItem = addItems(doc, [entry])

    const included = computeTierListLayout(withItem, {
      includePool: true,
      darkBackground: false,
    })
    expect(included.pool).not.toBeNull()
    expect(included.pool?.tiles).toHaveLength(1)
    expect(included.pool?.content.y).toBeGreaterThan(included.rows[4].content.y)

    const excluded = computeTierListLayout(withItem, {
      includePool: false,
      darkBackground: false,
    })
    expect(excluded.pool).toBeNull()
    expect(excluded.height).toBeLessThan(included.height)
  })

  it("does not include a pool section when the pool is empty", () => {
    const doc = createTierListDocument()
    const layout = computeTierListLayout(doc, defaultOptions)
    expect(layout.pool).toBeNull()
  })

  it("treats a tier without a rows entry as an empty row", () => {
    const doc = makeDoc({
      tiers: [tier("a", "夯"), tier("b", "顶级")],
      rows: { a: [] },
    })

    const layout = computeTierListLayout(doc, defaultOptions)
    expect(layout.rows).toHaveLength(2)
    expect(layout.rows[1].tiles).toEqual([])
    expect(layout.rows[1].content.height).toBe(120)
    expect(layout.rows[1].content.y).toBe(
      layout.rows[0].content.y + layout.rows[0].content.height + 12
    )
  })

  it("positions pool tiles inside the pool content box", () => {
    const doc = makeDoc({
      tiers: [tier("a", "夯")],
      pool: ["one", "two"],
      items: { one: item("one", "/one.png"), two: item("two", "/two.png") },
    })

    const layout = computeTierListLayout(doc, defaultOptions)
    expect(layout.pool).not.toBeNull()
    const pool = layout.pool!
    expect(pool.content).toMatchObject({ x: 128, width: 1048 })
    expect(pool.tiles).toEqual([
      {
        itemId: "one",
        x: pool.content.x + 12,
        y: pool.content.y + 12,
        size: 96,
      },
      {
        itemId: "two",
        x: pool.content.x + 12 + 96 + 12,
        y: pool.content.y + 12,
        size: 96,
      },
    ])
  })

  it("keeps the pool visible when a tier list has no tiers", () => {
    const doc = makeDoc({ pool: ["a"], items: { a: item("a", "/a.png") } })
    const layout = computeTierListLayout(doc, defaultOptions)

    expect(layout.rows).toEqual([])
    expect(layout.pool?.content.y).toBe(120)
    expect(layout.height).toBe(120 + 120 + 12 + 24 - 12)
  })
})

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

type RecordedText = {
  text: string
  x: number
  y: number
  font: string
  fillStyle: string
  textAlign: string
  textBaseline: string
}

function createFakeContext(measure = (text: string) => text.length * 10) {
  const fills: string[] = []
  const strokes: string[] = []
  const texts: RecordedText[] = []
  const images: unknown[][] = []
  const lineDashes: number[][] = []
  const fillRects: Array<{ color: string; args: number[] }> = []

  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "" as CanvasTextAlign,
    textBaseline: "" as CanvasTextBaseline,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      fillRects.push({ color: ctx.fillStyle, args: [x, y, width, height] })
    }),
    scale: vi.fn(),
    fill: vi.fn(() => {
      fills.push(ctx.fillStyle)
    }),
    stroke: vi.fn(() => {
      strokes.push(ctx.strokeStyle)
    }),
    setLineDash: vi.fn((dash: number[]) => {
      lineDashes.push([...dash])
    }),
    measureText: vi.fn(
      (text: string) => ({ width: measure(text) }) as TextMetrics
    ),
    fillText: vi.fn((text: string, x: number, y: number) => {
      texts.push({
        text,
        x,
        y,
        font: ctx.font,
        fillStyle: ctx.fillStyle,
        textAlign: ctx.textAlign,
        textBaseline: ctx.textBaseline,
      })
    }),
    drawImage: vi.fn((...args: unknown[]) => {
      images.push(args)
    }),
  }

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    fillRect: ctx.fillRect,
    scale: ctx.scale,
    save: ctx.save,
    clip: ctx.clip,
    restore: ctx.restore,
    fills,
    strokes,
    texts,
    images,
    lineDashes,
    fillRects,
  }
}

class FakeImageBitmap {
  constructor(
    public width: number,
    public height: number
  ) {}
}

function stubImageBitmap() {
  vi.stubGlobal("ImageBitmap", FakeImageBitmap)
}

function stubImageElement() {
  const created: FakeImage[] = []
  class FakeImage {
    static pending = 0
    static maxPending = 0

    crossOrigin: string | null = null
    decoding = ""
    onload: (() => void) | null = null
    onerror: ((error?: unknown) => void) | null = null
    private _src = ""

    constructor() {
      created.push(this)
    }

    set src(value: string) {
      this._src = value
      FakeImage.pending += 1
      FakeImage.maxPending = Math.max(FakeImage.maxPending, FakeImage.pending)
      queueMicrotask(() => {
        FakeImage.pending -= 1
        if (value.startsWith("fail:")) {
          this.onerror?.(new Error(`boom: ${value}`))
        } else {
          this.onload?.()
        }
      })
    }

    get src() {
      return this._src
    }
  }
  vi.stubGlobal("Image", FakeImage)
  return { created, FakeImage }
}

// ---------------------------------------------------------------------------
// Image preparation
// ---------------------------------------------------------------------------

describe("prepareExportImages", () => {
  beforeEach(() => {
    stubImageBitmap()
  })

  it("deduplicates sources and keys the result by item id", async () => {
    const { created } = stubImageElement()
    const createImageBitmap = vi.fn(async (image: { src: string }) => ({
      width: 40,
      height: 40,
      image,
    }))
    vi.stubGlobal("createImageBitmap", createImageBitmap)

    const shared = item("shared-a", "https://cdn.example.com/a.png")
    const sameSource = item("shared-b", "https://cdn.example.com/a.png")
    const local = item("local", "/uploads/local.png")

    const images = await prepareExportImages([shared, sameSource, local])

    // Two unique sources, two decodes.
    expect(created).toHaveLength(2)
    expect(createImageBitmap).toHaveBeenCalledTimes(2)
    expect(images.size).toBe(3)
    expect(images.get("shared-a")).toBe(images.get("shared-b"))
    expect(images.get("local")).not.toBe(images.get("shared-a"))
  })

  it("opts network images into anonymous CORS and leaves local URLs alone", async () => {
    const { created } = stubImageElement()
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({}))

    await prepareExportImages([
      item("https", "HTTPS://cdn.example.com/a.png"),
      item("data", "data:image/png;base64,AAAA"),
      item("blob", "blob:https://example.com/123"),
    ])

    const [network, ...local] = created
    expect(network.crossOrigin).toBe("anonymous")
    expect(network.decoding).toBe("async")
    for (const entry of local) expect(entry.crossOrigin).toBeNull()
  })

  it("maps failed loads and decodes to null", async () => {
    stubImageElement()
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (image: { src: string }) => {
        if (image.src.startsWith("decode:")) throw new Error("decode failed")
        return {}
      })
    )

    const images = await prepareExportImages([
      item("ok", "/ok.png"),
      item("load-fail", "fail:/missing.png"),
      item("decode-fail", "decode:/broken.png"),
    ])

    expect(images.get("ok")).not.toBeNull()
    expect(images.get("load-fail")).toBeNull()
    expect(images.get("decode-fail")).toBeNull()
  })

  it("returns an empty map for an empty item list", async () => {
    const { created } = stubImageElement()
    const createImageBitmap = vi.fn()
    vi.stubGlobal("createImageBitmap", createImageBitmap)

    const images = await prepareExportImages([])

    expect(images.size).toBe(0)
    expect(created).toHaveLength(0)
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it("never loads more than eight images at once", async () => {
    const { FakeImage } = stubImageElement()
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({}))

    const items = Array.from({ length: 20 }, (_, index) =>
      item(`item-${index}`, `fail:/missing-${index}.png`)
    )
    const images = await prepareExportImages(items)

    expect(images.size).toBe(20)
    for (const value of images.values()) expect(value).toBeNull()
    expect(FakeImage.maxPending).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

describe("drawTierList", () => {
  beforeEach(() => {
    stubImageBitmap()
  })

  it("draws the light background, title, tier labels and cover-cropped images", () => {
    const bitmap = new FakeImageBitmap(200, 100)
    const entry = item("a", "/a.png")
    const doc = makeDoc({
      title: '偶像/排名 <2026> & "同伴"',
      tiers: [
        tier("a", "夯"),
        tier("b", "长标签名称"),
        tier("c", "超长的等级标签名称"),
      ],
      rows: { a: [entry.id], b: [], c: [] },
      items: { [entry.id]: entry },
      pool: ["pooled"],
    })

    const options: TierListExportOptions = {
      includePool: false,
      darkBackground: false,
    }
    const layout = computeTierListLayout(doc, options)
    const fake = createFakeContext()
    const images = new Map<string, CanvasImageSource | null>([
      [entry.id, bitmap as unknown as CanvasImageSource],
    ])

    drawTierList(fake.ctx, layout, images, doc.title, options)

    // Light palette.
    expect(fake.fillRects[0]).toEqual({
      color: "#ffffff",
      args: [0, 0, layout.width, layout.height],
    })
    expect(fake.fills).toContain("#f4f4f5")

    // The title is passed through verbatim: the exporter performs no escaping.
    expect(fake.texts[0]).toMatchObject({
      text: doc.title,
      fillStyle: "#18181b",
      textAlign: "center",
      textBaseline: "middle",
    })
    expect(fake.texts[0].font).toContain("700 40px")

    // Short labels use the larger font, longer labels the smaller one.
    const shortLabel = fake.texts.find((entry) => entry.text === "夯")
    const longLabel = fake.texts.find((entry) => entry.text === "长标签名称")
    expect(shortLabel?.font).toContain("700 22px")
    expect(shortLabel?.fillStyle).toBe("#ffffff")
    expect(longLabel?.font).toContain("700 15px")

    // A label wider than the 96px column wraps onto several lines.
    const wrapped = fake.texts.filter(
      (entry) =>
        !["夯", "长标签名称", doc.title].includes(entry.text)
    )
    expect(wrapped.length).toBe(2)
    expect(wrapped.map((entry) => entry.text).join("")).toBe(
      "超长的等级标签名称"
    )
    expect(new Set(wrapped.map((entry) => entry.y)).size).toBe(wrapped.length)

    // Cover crop of a 200x100 bitmap into a 96px tile.
    expect(fake.images).toHaveLength(1)
    const tile = layout.rows[0].tiles[0]
    expect(fake.images[0]).toEqual([
      bitmap,
      50,
      0,
      100,
      100,
      tile.x,
      tile.y,
      96,
      96,
    ])
    expect(fake.save).toHaveBeenCalled()
    expect(fake.clip).toHaveBeenCalled()
    expect(fake.restore).toHaveBeenCalled()
  })

  it("draws the dark palette and the dashed unranked pool", () => {
    const pooled = item("pooled", "/pooled.png")
    const doc = makeDoc({
      title: "",
      tiers: [tier("a", "夯")],
      rows: { a: [] },
      pool: [pooled.id],
      items: { [pooled.id]: pooled },
    })
    const options: TierListExportOptions = {
      includePool: true,
      darkBackground: true,
    }
    const layout = computeTierListLayout(doc, options)

    const nativeImage = document.createElement("img")
    Object.defineProperty(nativeImage, "naturalWidth", { value: 50 })
    Object.defineProperty(nativeImage, "naturalHeight", { value: 100 })

    const fake = createFakeContext()
    const images = new Map<string, CanvasImageSource | null>([
      [pooled.id, nativeImage],
    ])

    drawTierList(fake.ctx, layout, images, doc.title, options)

    expect(fake.fillRects[0].color).toBe("#1c1c1e")
    expect(fake.fills).toContain("#2a2a2e")
    expect(fake.strokes).toContain("#52525b")

    // An empty title still produces one (empty) fillText call.
    expect(fake.texts[0]).toMatchObject({ text: "", fillStyle: "#f4f4f5" })

    const poolLabel = fake.texts.find((entry) => entry.text === "未分类")
    expect(poolLabel).toMatchObject({ fillStyle: "#a1a1aa" })
    expect(poolLabel?.font).toContain("700 16px")

    // Dashes are enabled for the pool outline and reset afterwards.
    expect(fake.lineDashes).toEqual([
      [8, 6],
      [],
    ])

    const poolTile = layout.pool!.tiles[0]
    expect(fake.images[0]).toEqual([
      nativeImage,
      0,
      25,
      50,
      50,
      poolTile.x,
      poolTile.y,
      96,
      96,
    ])
  })

  it("uses placeholders for missing, empty and unsupported images", () => {
    const zeroSized = document.createElement("img")
    Object.defineProperty(zeroSized, "naturalWidth", { value: 0 })
    Object.defineProperty(zeroSized, "naturalHeight", { value: 0 })
    const unsupported = document.createElement("canvas")

    const doc = makeDoc({
      tiers: [tier("a", "夯")],
      rows: { a: ["missing", "zero", "unsupported"] },
      items: {
        zero: item("zero", "/zero.png"),
        unsupported: item("unsupported", "/canvas.png"),
      },
      pool: ["missing-pool"],
    })
    const options: TierListExportOptions = {
      includePool: true,
      darkBackground: false,
    }
    const layout = computeTierListLayout(doc, options)
    const fake = createFakeContext()
    const images = new Map<string, CanvasImageSource | null>([
      ["zero", zeroSized],
      ["unsupported", unsupported],
    ])

    drawTierList(fake.ctx, layout, images, "标题", options)

    // `missing` (row), the zero-sized image, the canvas and the pool item
    // that is absent from the map all render as placeholders.
    expect(fake.images).toHaveLength(0)
    expect(fake.fills.filter((color) => color === "#a1a1aa")).toHaveLength(4)
  })

  it("draws an empty pool outline when the pool has no tiles", () => {
    const doc = makeDoc({ tiers: [tier("a", "夯")], rows: { a: [] } })
    const options: TierListExportOptions = {
      includePool: true,
      darkBackground: false,
    }
    const layout = computeTierListLayout(doc, options)
    const fake = createFakeContext()

    drawTierList(
      fake.ctx,
      {
        ...layout,
        pool: {
          label: layout.title,
          content: layout.title,
          tiles: [],
        },
      },
      new Map(),
      "标题",
      options
    )

    expect(fake.lineDashes).toEqual([
      [8, 6],
      [],
    ])
    expect(fake.images).toHaveLength(0)
  })

  it("wraps a long title and keeps special characters intact", () => {
    const title = "超长标题".repeat(40) + "/<>?&\"'"
    const doc = makeDoc({ title, tiers: [] })
    const options: TierListExportOptions = {
      includePool: false,
      darkBackground: false,
    }
    const layout = computeTierListLayout(doc, options)
    const fake = createFakeContext()

    drawTierList(fake.ctx, layout, new Map(), title, options)

    expect(fake.texts.length).toBeGreaterThan(1)
    expect(fake.texts.map((entry) => entry.text).join("")).toBe(title)
    for (const entry of fake.texts) {
      expect(entry.font).toContain("700 40px")
      expect(entry.text.length).toBeLessThanOrEqual(114)
    }
  })
})

// ---------------------------------------------------------------------------
// PNG export
// ---------------------------------------------------------------------------

describe("exportTierListPng", () => {
  function stubCanvas(blob: Blob | null = new Blob(["png"], { type: "image/png" })) {
    const canvas = document.createElement("canvas")
    vi.spyOn(document, "createElement").mockReturnValue(canvas)
    const fake = createFakeContext()
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fake.ctx
    )
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(blob))
    return { canvas, fake, toBlob }
  }

  function stubSuccessfulImages() {
    stubImageBitmap()
    stubImageElement()
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => new FakeImageBitmap(80, 80))
    )
  }

  it("encodes a PNG scaled by the requested factor", async () => {
    stubSuccessfulImages()
    const { canvas, fake, toBlob } = stubCanvas()

    const ok = item("ok", "/ok.png")
    const bad = item("bad", "fail:/bad.png")
    const pooled = item("pooled", "/pooled.png")
    const doc = makeDoc({
      title: "导出",
      tiers: [tier("a", "夯")],
      rows: { a: [ok.id, bad.id] },
      items: { [ok.id]: ok, [bad.id]: bad, [pooled.id]: pooled },
      pool: [pooled.id],
    })
    const options: TierListExportOptions = {
      includePool: true,
      darkBackground: false,
    }
    const layout = computeTierListLayout(doc, options)

    const result = await exportTierListPng(doc, options, 2)

    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.blob.type).toBe("image/png")
    expect(result.failedCount).toBe(1)

    expect(canvas.width).toBe(Math.round(layout.width * 2))
    expect(canvas.height).toBe(Math.round(layout.height * 2))
    expect(fake.scale).toHaveBeenCalledWith(2, 2)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png")

    // The pool is part of the drawn document when requested.
    expect(fake.lineDashes).toEqual([
      [8, 6],
      [],
    ])
    // Two loaded images (ok + pool) and one placeholder.
    expect(fake.images).toHaveLength(2)
    expect(fake.fills.filter((color) => color === "#a1a1aa")).toHaveLength(1)
  })

  it("counts rows that reference items missing from the document", async () => {
    stubSuccessfulImages()
    stubCanvas()

    const doc = makeDoc({
      tiers: [tier("a", "夯")],
      rows: { a: ["ghost"] },
      items: {},
    })
    const result = await exportTierListPng(doc, defaultOptions, 1)

    expect(result.failedCount).toBe(1)
  })

  it.each([0, 0.5, 4, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the out-of-range scale %s",
    async (scale) => {
      await expect(
        exportTierListPng(makeDoc(), defaultOptions, scale)
      ).rejects.toThrow("export scale must be between 1 and 3")
    }
  )

  it("rejects a document whose raster would exceed the pixel budget", async () => {
    const tiers = Array.from({ length: 50 }, (_, index) =>
      tier(`t${index}`, "夯")
    )
    const doc = makeDoc({ tiers })

    await expect(exportTierListPng(doc, defaultOptions, 3)).rejects.toThrow(
      "export image is too large"
    )
  })

  it("rejects when the 2d context is unavailable", async () => {
    stubSuccessfulImages()
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)

    await expect(
      exportTierListPng(makeDoc(), defaultOptions, 1)
    ).rejects.toThrow("canvas 2d context unavailable")
  })

  it("rejects when PNG encoding returns no blob", async () => {
    stubSuccessfulImages()
    stubCanvas(null)

    await expect(
      exportTierListPng(makeDoc(), defaultOptions, 1)
    ).rejects.toThrow("png encoding failed")
  })
})
