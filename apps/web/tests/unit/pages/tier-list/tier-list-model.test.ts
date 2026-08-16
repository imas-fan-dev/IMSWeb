import { describe, expect, it } from "vitest"

import {
  addItems,
  addTier,
  clearAll,
  clearTier,
  createTierItem,
  createTierListDocument,
  findItemContainer,
  hashString,
  moveItem,
  moveTier,
  parseTierListDocument,
  removeItem,
  removeTier,
  renameTier,
  setTierColor,
  setTitle,
} from "~/pages/tier-list/tier-list-model"

function seedDocument() {
  const doc = createTierListDocument()
  const s = doc.tiers[0]
  return { doc, s }
}

describe("createTierListDocument", () => {
  it("creates the localized five-tier template with empty state", () => {
    const doc = createTierListDocument()
    expect(doc.title).toBe("我的 Tier List")
    expect(doc.tiers.map((tier) => tier.label)).toEqual([
      "夯",
      "顶级",
      "人上人",
      "NPC",
      "拉完了",
    ])
    expect(doc.tiers.every((tier) => tier.id && tier.color)).toBe(true)
    expect(doc.items).toEqual({})
    expect(Object.keys(doc.rows)).toHaveLength(5)
    expect(Object.values(doc.rows).every((ids) => ids.length === 0)).toBe(true)
    expect(doc.pool).toEqual([])
  })
})

describe("hashString", () => {
  it("is stable for the same input", () => {
    expect(hashString("/image/765/haruka/icon.webp")).toBe(
      hashString("/image/765/haruka/icon.webp")
    )
  })

  it("differs for different inputs", () => {
    expect(hashString("/image/765/haruka/icon.webp")).not.toBe(
      hashString("/image/765/chihaya/icon.webp")
    )
  })
})

describe("addItems", () => {
  it("adds items to the pool and deduplicates by id", () => {
    const { doc } = seedDocument()
    const a = createTierItem("/image/765/a/icon.webp", "A", "wiki")
    const b = createTierItem("/image/765/b/icon.webp", "B", "wiki")
    const next = addItems(addItems(doc, [a, b]), [a])

    expect(next.pool).toEqual([a.id, b.id])
    expect(next.items[a.id].label).toBe("A")
    expect(next.items[a.id].origin).toBe("wiki")
  })
})

describe("setTitle / renameTier / setTierColor / addTier / moveTier", () => {
  it("updates the title and tier fields", () => {
    const { doc, s } = seedDocument()
    const titled = setTitle(doc, "我的神推排行")
    expect(titled.title).toBe("我的神推排行")

    const renamed = renameTier(doc, s.id, "神")
    expect(renamed.tiers[0].label).toBe("神")

    const colored = setTierColor(doc, s.id, "#123456")
    expect(colored.tiers[0].color).toBe("#123456")
  })

  it("appends a new tier with an empty row", () => {
    const { doc } = seedDocument()
    const next = addTier(doc, "神", "#ff0000")
    expect(next.tiers).toHaveLength(6)
    expect(next.tiers[5]).toMatchObject({ label: "神", color: "#ff0000" })
    expect(next.rows[next.tiers[5].id]).toEqual([])
  })

  it("moves a tier up and down, ignoring out-of-range moves", () => {
    const { doc, s } = seedDocument()
    const movedDown = moveTier(doc, s.id, 1)
    expect(movedDown.tiers[0].id).toBe(doc.tiers[1].id)
    expect(movedDown.tiers[1].id).toBe(s.id)

    const movedBack = moveTier(movedDown, s.id, -1)
    expect(movedBack.tiers[0].id).toBe(s.id)

    expect(moveTier(doc, s.id, -1)).toBe(doc)
    expect(moveTier(doc, doc.tiers[4].id, 1)).toBe(doc)
  })
})

describe("removeTier / clearTier", () => {
  it("moves row items back to the pool when removing a tier", () => {
    const { doc, s } = seedDocument()
    const item = createTierItem("/image/765/a/icon.webp", "A", "wiki")
    const withItem = moveItem(addItems(doc, [item]), item.id, s.id, 0)

    const next = removeTier(withItem, s.id)
    expect(next.tiers.map((tier) => tier.id)).not.toContain(s.id)
    expect(next.rows[s.id]).toBeUndefined()
    expect(next.pool).toEqual([item.id])
  })

  it("empties a row into the pool while keeping the tier", () => {
    const { doc, s } = seedDocument()
    const item = createTierItem("/image/765/a/icon.webp", "A", "wiki")
    const withItem = moveItem(addItems(doc, [item]), item.id, s.id, 0)

    const next = clearTier(withItem, s.id)
    expect(next.rows[s.id]).toEqual([])
    expect(next.pool).toEqual([item.id])
    expect(next.tiers.map((tier) => tier.id)).toContain(s.id)
  })
})

describe("removeItem / clearAll", () => {
  it("removes an item from the pool and the items map", () => {
    const { doc } = seedDocument()
    const item = createTierItem("/image/765/a/icon.webp", "A", "wiki")
    const withItem = addItems(doc, [item])

    const next = removeItem(withItem, item.id)
    expect(next.pool).toEqual([])
    expect(next.items[item.id]).toBeUndefined()
  })

  it("removes an item from a tier row", () => {
    const { doc, s } = seedDocument()
    const item = createTierItem("/image/765/a/icon.webp", "A", "wiki")
    const withItem = moveItem(addItems(doc, [item]), item.id, s.id, 0)

    const next = removeItem(withItem, item.id)
    expect(next.rows[s.id]).toEqual([])
    expect(next.items[item.id]).toBeUndefined()
  })

  it("clears all items and rows but keeps tiers and the title", () => {
    const { doc, s } = seedDocument()
    const item = createTierItem("/image/765/a/icon.webp", "A", "wiki")
    const withItem = moveItem(addItems(doc, [item]), item.id, s.id, 0)
    const titled = setTitle(withItem, "保留我")

    const next = clearAll(titled)
    expect(next.pool).toEqual([])
    expect(next.items).toEqual({})
    expect(next.rows[s.id]).toEqual([])
    expect(next.tiers).toEqual(titled.tiers)
    expect(next.title).toBe("保留我")
  })
})

describe("findItemContainer / moveItem", () => {
  it("locates an item in the pool and in a row", () => {
    const { doc, s } = seedDocument()
    const item = createTierItem("/image/765/a/icon.webp", "A", "wiki")
    const withItem = moveItem(addItems(doc, [item]), item.id, s.id, 0)

    expect(findItemContainer(withItem, item.id)).toEqual({
      container: s.id,
      index: 0,
    })
    const backInPool = removeItem(withItem, item.id)
    expect(findItemContainer(backInPool, item.id)).toBeNull()
  })

  it("reorders within the same container using arrayMove semantics", () => {
    const { doc, s } = seedDocument()
    const a = createTierItem("/image/765/a/icon.webp", "A", "wiki")
    const b = createTierItem("/image/765/b/icon.webp", "B", "wiki")
    const c = createTierItem("/image/765/c/icon.webp", "C", "wiki")
    const withItems = addItems(doc, [a, b, c])
    const placed = [a, b, c].reduce(
      (acc, item) => moveItem(acc, item.id, s.id, 0),
      withItems
    )
    expect(placed.rows[s.id]).toEqual([c.id, b.id, a.id])

    // Move b (index 1) to index 2: arrayMove([c,b,a], 1, 2) -> [c,a,b]
    const reordered = moveItem(placed, b.id, s.id, 2)
    expect(reordered.rows[s.id]).toEqual([c.id, a.id, b.id])

    // Move c (index 0) to index 2: arrayMove([c,a,b], 0, 2) -> [a,b,c]
    const reorderedBack = moveItem(reordered, c.id, s.id, 2)
    expect(reorderedBack.rows[s.id]).toEqual([a.id, b.id, c.id])
  })

  it("moves an item across containers at a given index", () => {
    const { doc, s } = seedDocument()
    const a = createTierItem("/image/765/a/icon.webp", "A", "wiki")
    const b = createTierItem("/image/765/b/icon.webp", "B", "wiki")
    const withItems = addItems(doc, [a, b])

    // Pool [a, b]; move b into the row at index 0.
    const inRow = moveItem(withItems, b.id, s.id, 0)
    expect(inRow.rows[s.id]).toEqual([b.id])
    expect(inRow.pool).toEqual([a.id])

    // Move b back to the pool at the end.
    const back = moveItem(inRow, b.id, "pool", 9)
    expect(back.pool).toEqual([a.id, b.id])
    expect(back.rows[s.id]).toEqual([])
  })

  it("ignores unknown items and missing target tiers", () => {
    const { doc } = seedDocument()
    expect(moveItem(doc, "missing", "pool", 0)).toBe(doc)
    expect(moveItem(doc, "missing", "missing-tier", 0)).toBe(doc)

    const item = createTierItem("/image/765/a/icon.webp", "A", "wiki")
    const withItem = addItems(doc, [item])
    expect(moveItem(withItem, item.id, "missing-tier", 0)).toBe(withItem)
  })
})

describe("parseTierListDocument", () => {
  it("round-trips a serialized document", () => {
    const { doc, s } = seedDocument()
    const item = createTierItem("/image/765/a/icon.webp", "天海春香", "wiki")
    const local = createTierItem(
      "data:image/webp;base64,xxx",
      "本地图",
      "local"
    )
    const withItems = addItems(doc, [item, local])
    const placed = moveItem(withItems, item.id, s.id, 0)

    const parsed = parseTierListDocument(JSON.stringify(placed))
    expect(parsed).toEqual(placed)
  })

  it("rejects corrupted JSON and unknown versions", () => {
    expect(parseTierListDocument("not json")).toBeNull()
    expect(parseTierListDocument(JSON.stringify({ version: 99 }))).toBeNull()
  })

  it("filters invalid entries and orphan references", () => {
    const raw = JSON.stringify({
      version: 1,
      title: "过滤测试",
      tiers: [
        { id: "t1", label: "S", color: "#ff7f7f" },
        { id: "t2", label: "", color: 42 },
        { id: "t3", label: "坏", color: "red" },
      ],
      items: {
        i1: { id: "i1", src: "/x.webp", label: "好", origin: "wiki" },
        i2: { id: "i2", src: "/y.webp", label: "坏", origin: "server" },
        i3: { id: "i3", src: "/z.webp", label: "孤儿", origin: "local" },
      },
      rows: {
        t1: ["i1", "ghost", "i1"],
        t3: ["i3"],
        ghost: ["i1"],
      },
      pool: ["i3", "i3", "ghost"],
    })

    const parsed = parseTierListDocument(raw)
    expect(parsed?.title).toBe("过滤测试")
    expect(parsed?.tiers.map((tier) => tier.id)).toEqual(["t1", "t3"])
    expect(Object.keys(parsed?.items ?? {})).toEqual(["i1", "i3"])
    expect(parsed?.rows).toEqual({ t1: ["i1"], t3: ["i3"] })
    expect(parsed?.pool).toEqual(["i3"])
  })

  it("accepts an empty tier list", () => {
    const parsed = parseTierListDocument(
      JSON.stringify({
        version: 1,
        title: "空",
        tiers: [],
        items: {},
        rows: {},
        pool: [],
      })
    )
    expect(parsed?.tiers).toEqual([])
    expect(parsed?.title).toBe("空")
  })
})
