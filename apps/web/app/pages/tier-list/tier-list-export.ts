import type { Tier, TierItem, TierListDocument } from "./tier-list-model"

/**
 * Canvas rendering pipeline for the tier list export. Layout computation is
 * a pure function so it can be unit tested without a canvas; drawing and
 * image loading run in the browser only.
 *
 * Images are loaded through an anonymous Image element and converted to an
 * ImageBitmap. Failed images render as placeholders and are counted.
 */

const LOGICAL_WIDTH = 1200
const PADDING = 24
const TITLE_HEIGHT = 96
const LABEL_WIDTH = 96
const LABEL_GAP = 8
const ROW_PADDING = 12
const TILE_SIZE = 96
const TILE_GAP = 12
const SECTION_GAP = 12

export type TierListExportOptions = {
  /** Include the unranked pool as a dashed section at the bottom. */
  includePool: boolean
  /** Draw on a dark background instead of a light one. */
  darkBackground: boolean
}

export type TierListLayout = {
  width: number
  height: number
  title: { x: number; y: number; width: number; height: number }
  rows: Array<{
    tier: Tier
    label: { x: number; y: number; width: number; height: number }
    content: { x: number; y: number; width: number; height: number }
    tiles: Array<{ itemId: string; x: number; y: number; size: number }>
  }>
  pool: {
    label: { x: number; y: number; width: number; height: number }
    content: { x: number; y: number; width: number; height: number }
    tiles: Array<{ itemId: string; x: number; y: number; size: number }>
  } | null
}

export function computeTierListLayout(
  doc: TierListDocument,
  options: TierListExportOptions
): TierListLayout {
  const contentWidth = LOGICAL_WIDTH - PADDING * 2 - LABEL_WIDTH - LABEL_GAP
  const tilesPerRow = Math.max(
    1,
    Math.floor((contentWidth + TILE_GAP) / (TILE_SIZE + TILE_GAP))
  )

  function gridHeight(count: number) {
    const rows = Math.max(1, Math.ceil(count / tilesPerRow))
    return rows * TILE_SIZE + (rows - 1) * TILE_GAP + ROW_PADDING * 2
  }

  function gridTiles(
    itemIds: readonly string[],
    x: number,
    y: number
  ): Array<{ itemId: string; x: number; y: number; size: number }> {
    return itemIds.map((itemId, index) => {
      const row = Math.floor(index / tilesPerRow)
      const column = index % tilesPerRow
      return {
        itemId,
        x: x + ROW_PADDING + column * (TILE_SIZE + TILE_GAP),
        y: y + ROW_PADDING + row * (TILE_SIZE + TILE_GAP),
        size: TILE_SIZE,
      }
    })
  }

  const rows: TierListLayout["rows"] = doc.tiers.map((tier) => {
    const itemIds = doc.rows[tier.id] ?? []
    const label = {
      x: PADDING,
      y: 0,
      width: LABEL_WIDTH,
      height: gridHeight(itemIds.length),
    }
    const content = {
      x: PADDING + LABEL_WIDTH + LABEL_GAP,
      y: 0,
      width: contentWidth,
      height: gridHeight(itemIds.length),
    }
    return { tier, label, content, tiles: [] }
  })

  let cursorY = PADDING + TITLE_HEIGHT
  for (const row of rows) {
    row.label.y = cursorY
    row.content.y = cursorY
    row.tiles = gridTiles(doc.rows[row.tier.id] ?? [], row.content.x, cursorY)
    cursorY += row.content.height + SECTION_GAP
  }

  let pool: TierListLayout["pool"] = null
  if (options.includePool && doc.pool.length > 0) {
    pool = {
      label: {
        x: PADDING,
        y: cursorY,
        width: LABEL_WIDTH,
        height: gridHeight(doc.pool.length),
      },
      content: {
        x: PADDING + LABEL_WIDTH + LABEL_GAP,
        y: cursorY,
        width: contentWidth,
        height: gridHeight(doc.pool.length),
      },
      tiles: [],
    }
    pool.tiles = gridTiles(doc.pool, pool.content.x, cursorY)
    cursorY += pool.content.height + SECTION_GAP
  }

  return {
    width: LOGICAL_WIDTH,
    height: cursorY + PADDING - SECTION_GAP,
    title: {
      x: PADDING,
      y: PADDING,
      width: LOGICAL_WIDTH - PADDING * 2,
      height: TITLE_HEIGHT,
    },
    rows,
    pool,
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    // Setting crossOrigin on data/blob URLs can make otherwise valid local
    // images fail to decode in some browsers. Network images still opt into
    // anonymous CORS so canvas export remains untainted.
    if (/^https?:\/\//i.test(src)) image.crossOrigin = "anonymous"
    image.decoding = "async"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`image load failed: ${src}`))
    image.src = src
  })
}

async function fetchBitmap(src: string): Promise<ImageBitmap | null> {
  try {
    const image = await loadImageElement(src)
    return await createImageBitmap(image)
  } catch {
    return null
  }
}

async function mapWithConcurrency<In, Out>(
  inputs: readonly In[],
  limit: number,
  worker: (input: In) => Promise<Out>
): Promise<Out[]> {
  const results = new Array<Out>(inputs.length)
  let cursor = 0
  async function run() {
    while (cursor < inputs.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(inputs[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, inputs.length) }, () => run())
  )
  return results
}

/**
 * Load every item image in a CORS-safe way. Missing or failed images map to
 * null so the canvas stays untainted and export can still proceed.
 */
export async function prepareExportImages(
  items: readonly TierItem[]
): Promise<Map<string, CanvasImageSource | null>> {
  const sources = [...new Set(items.map((item) => item.src))]
  const bitmaps = await mapWithConcurrency(sources, 8, fetchBitmap)
  const bySource = new Map<string, CanvasImageSource | null>()
  sources.forEach((src, index) => bySource.set(src, bitmaps[index]))
  // Drawing is item-oriented, while loading is deduplicated by source.
  return new Map(items.map((item) => [item.id, bySource.get(item.src) ?? null]))
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource | null,
  x: number,
  y: number,
  size: number
) {
  if (image === null) {
    drawRoundedRect(ctx, x, y, size, size, 6)
    ctx.fillStyle = "#a1a1aa"
    ctx.fill()
    return
  }
  const naturalWidth =
    image instanceof ImageBitmap
      ? image.width
      : image instanceof HTMLImageElement
        ? image.naturalWidth
        : 0
  const naturalHeight =
    image instanceof ImageBitmap
      ? image.height
      : image instanceof HTMLImageElement
        ? image.naturalHeight
        : 0
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    drawRoundedRect(ctx, x, y, size, size, 6)
    ctx.fillStyle = "#a1a1aa"
    ctx.fill()
    return
  }
  const scale = Math.max(size / naturalWidth, size / naturalHeight)
  const sourceWidth = size / scale
  const sourceHeight = size / scale
  const sourceX = (naturalWidth - sourceWidth) / 2
  const sourceY = (naturalHeight - sourceHeight) / 2
  ctx.save()
  drawRoundedRect(ctx, x, y, size, size, 6)
  ctx.clip()
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    size,
    size
  )
  ctx.restore()
}

function drawCenteredLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number
) {
  ctx.font = `700 ${fontSize}px "Geist Variable", "Noto Sans SC", "PingFang SC", sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const availableWidth = Math.max(1, width - 12)
  const lines: string[] = []
  let line = ""
  for (const character of Array.from(text)) {
    const candidate = line + character
    if (line && ctx.measureText(candidate).width > availableWidth) {
      lines.push(line)
      line = character
    } else {
      line = candidate
    }
  }
  if (line || lines.length === 0) lines.push(line)

  const lineHeight = fontSize * 1.2
  const totalHeight = lines.length * lineHeight
  const firstLineY = y + (height - totalHeight) / 2 + lineHeight / 2
  lines.forEach((value, index) => {
    ctx.fillText(value, x + width / 2, firstLineY + index * lineHeight)
  })
}

export function drawTierList(
  ctx: CanvasRenderingContext2D,
  layout: TierListLayout,
  images: ReadonlyMap<string, CanvasImageSource | null>,
  title: string,
  options: TierListExportOptions
) {
  const background = options.darkBackground ? "#1c1c1e" : "#ffffff"
  const surface = options.darkBackground ? "#2a2a2e" : "#f4f4f5"
  const outline = options.darkBackground ? "#52525b" : "#d4d4d8"
  const foreground = options.darkBackground ? "#f4f4f5" : "#18181b"
  const muted = options.darkBackground ? "#a1a1aa" : "#71717a"

  ctx.fillStyle = background
  ctx.fillRect(0, 0, layout.width, layout.height)

  ctx.fillStyle = foreground
  drawCenteredLabel(
    ctx,
    title,
    layout.title.x,
    layout.title.y,
    layout.title.width,
    layout.title.height,
    40
  )

  for (const row of layout.rows) {
    drawRoundedRect(
      ctx,
      row.label.x,
      row.label.y,
      row.label.width,
      row.label.height,
      8
    )
    ctx.fillStyle = row.tier.color
    ctx.fill()

    drawRoundedRect(
      ctx,
      row.content.x,
      row.content.y,
      row.content.width,
      row.content.height,
      8
    )
    ctx.fillStyle = surface
    ctx.fill()

    ctx.fillStyle = "#ffffff"
    const fontSize = row.tier.label.length <= 4 ? 22 : 15
    drawCenteredLabel(
      ctx,
      row.tier.label,
      row.label.x,
      row.label.y,
      row.label.width,
      row.label.height,
      fontSize
    )

    for (const tile of row.tiles) {
      drawCover(ctx, images.get(tile.itemId) ?? null, tile.x, tile.y, tile.size)
    }
  }

  if (layout.pool) {
    ctx.setLineDash([8, 6])
    drawRoundedRect(
      ctx,
      layout.pool.content.x,
      layout.pool.content.y,
      layout.pool.content.width,
      layout.pool.content.height,
      8
    )
    ctx.strokeStyle = outline
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = muted
    drawCenteredLabel(
      ctx,
      "未分类",
      layout.pool.label.x,
      layout.pool.label.y,
      layout.pool.label.width,
      layout.pool.label.height,
      16
    )

    for (const tile of layout.pool.tiles) {
      drawCover(ctx, images.get(tile.itemId) ?? null, tile.x, tile.y, tile.size)
    }
  }
}

export type ExportTierListResult = {
  blob: Blob
  failedCount: number
}

export async function exportTierListPng(
  doc: TierListDocument,
  options: TierListExportOptions,
  scale: number
): Promise<ExportTierListResult> {
  if (!Number.isFinite(scale) || scale < 1 || scale > 3) {
    throw new Error("export scale must be between 1 and 3")
  }
  const layout = computeTierListLayout(doc, options)
  const pixelCount = layout.width * layout.height * scale * scale
  if (!Number.isFinite(pixelCount) || pixelCount > 64_000_000) {
    throw new Error("export image is too large")
  }
  const neededIds = new Set<string>([
    ...layout.rows.flatMap((row) => row.tiles.map((tile) => tile.itemId)),
    ...(layout.pool?.tiles.map((tile) => tile.itemId) ?? []),
  ])
  const allItems = [...neededIds]
    .map((id) => doc.items[id])
    .filter((item): item is TierItem => item !== undefined)
  const images = await prepareExportImages(allItems)

  const canvas = document.createElement("canvas")
  canvas.width = Math.round(layout.width * scale)
  canvas.height = Math.round(layout.height * scale)
  const ctx = canvas.getContext("2d")
  if (ctx === null) throw new Error("canvas 2d context unavailable")
  ctx.scale(scale, scale)
  drawTierList(ctx, layout, images, doc.title, options)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  )
  if (blob === null) throw new Error("png encoding failed")

  let failedCount = 0
  for (const tile of [
    ...layout.rows.flatMap((row) => row.tiles),
    ...(layout.pool?.tiles ?? []),
  ]) {
    if ((images.get(tile.itemId) ?? null) === null) failedCount += 1
  }
  return { blob, failedCount }
}
