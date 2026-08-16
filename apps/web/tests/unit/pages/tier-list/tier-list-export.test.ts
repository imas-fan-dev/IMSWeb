import { describe, expect, it } from "vitest"

import {
  computeTierListLayout,
  type TierListExportOptions,
} from "~/pages/tier-list/tier-list-export"
import {
  addItems,
  createTierItem,
  createTierListDocument,
  moveItem,
} from "~/pages/tier-list/tier-list-model"

const defaultOptions: TierListExportOptions = {
  includePool: true,
  darkBackground: false,
}

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
      (acc, item) => moveItem(addItems(acc, [item]), item.id, tierId, 0),
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
      (acc, item) => moveItem(addItems(acc, [item]), item.id, tierId, 0),
      doc
    )

    const layout = computeTierListLayout(placed, defaultOptions)
    const [a, b] = layout.rows[0].tiles
    expect(b.x - a.x).toBe(96 + 12)
    expect(a.y).toBe(b.y)
  })

  it("adds the pool section only when requested and non-empty", () => {
    const doc = createTierListDocument()
    const item = createTierItem("/image/765/idol/icon.webp", "偶像", "wiki")
    const withItem = addItems(doc, [item])

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
})
