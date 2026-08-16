/**
 * Pure domain model for the client-side tier list builder.
 *
 * The document is a plain serializable object kept in React state and
 * mirrored to localStorage by `tier-list-storage.ts`. All mutations are
 * pure functions so the drag-and-drop flow and unit tests stay simple.
 */

export const TIER_LIST_STORAGE_VERSION = 1 as const

export type TierItemOrigin = "wiki" | "local"

export type TierItem = {
  id: string
  src: string
  label: string
  origin: TierItemOrigin
}

export type Tier = {
  id: string
  label: string
  color: string
}

export type TierListDocument = {
  version: typeof TIER_LIST_STORAGE_VERSION
  title: string
  tiers: Tier[]
  items: Record<string, TierItem>
  /** tierId -> ordered item ids inside that row */
  rows: Record<string, string[]>
  /** ordered item ids waiting in the unranked pool */
  pool: string[]
}

/** The unranked pool acts as a container named "pool"; tier rows use their id. */
export type TierListContainer = "pool" | string

/** Classic tiermaker palette used by the default template and the editor. */
export const TIER_COLOR_PRESETS = [
  "#ff7f7f",
  "#ffbf7f",
  "#ffdf7f",
  "#7fff7f",
  "#7fbfff",
  "#7f7fff",
  // Franchise accent colors, kept in sync with `--franchise-*` in app.css.
  "#f34e6c",
  "#2581c7",
  "#ffc20b",
  "#11be93",
  "#8dbaff",
  "#f39800",
  "#94a3b8",
] as const

const DEFAULT_TIERS: ReadonlyArray<{ label: string; color: string }> = [
  { label: "夯", color: "#ff7f7f" },
  { label: "顶级", color: "#ffbf7f" },
  { label: "人上人", color: "#ffdf7f" },
  { label: "NPC", color: "#72e372" },
  { label: "拉完了", color: "#7fbfff" },
]

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `tier-${Math.random().toString(36).slice(2)}`
}

/** Stable short hash used as item id so imports dedupe across sessions. */
export function hashString(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function createTierListDocument(): TierListDocument {
  const tiers = DEFAULT_TIERS.map((tier) => ({ ...tier, id: makeId() }))
  return {
    version: TIER_LIST_STORAGE_VERSION,
    title: "我的 Tier List",
    tiers,
    items: {},
    rows: Object.fromEntries(tiers.map((tier) => [tier.id, []])),
    pool: [],
  }
}

export function createTierItem(
  src: string,
  label: string,
  origin: TierItemOrigin
): TierItem {
  return { id: hashString(src), src, label, origin }
}

export function createTier(label: string, color: string): Tier {
  return { id: makeId(), label, color }
}

function readContainer(
  doc: TierListDocument,
  container: TierListContainer
): string[] | null {
  if (container === "pool") return doc.pool
  return doc.rows[container] ?? null
}

function writeContainer(
  doc: TierListDocument,
  container: TierListContainer,
  ids: string[]
): TierListDocument {
  if (container === "pool") {
    return { ...doc, pool: ids }
  }
  return { ...doc, rows: { ...doc.rows, [container]: ids } }
}

export function findItemContainer(
  doc: TierListDocument,
  itemId: string
): { container: TierListContainer; index: number } | null {
  const poolIndex = doc.pool.indexOf(itemId)
  if (poolIndex >= 0) return { container: "pool", index: poolIndex }
  for (const [tierId, ids] of Object.entries(doc.rows)) {
    const index = ids.indexOf(itemId)
    if (index >= 0) return { container: tierId, index }
  }
  return null
}

export function setTitle(
  doc: TierListDocument,
  title: string
): TierListDocument {
  if (title === doc.title) return doc
  return { ...doc, title }
}

export function addTier(
  doc: TierListDocument,
  label: string,
  color: string
): TierListDocument {
  const tier = createTier(label, color)
  return {
    ...doc,
    tiers: [...doc.tiers, tier],
    rows: { ...doc.rows, [tier.id]: [] },
  }
}

export function renameTier(
  doc: TierListDocument,
  tierId: string,
  label: string
): TierListDocument {
  return {
    ...doc,
    tiers: doc.tiers.map((tier) =>
      tier.id === tierId ? { ...tier, label } : tier
    ),
  }
}

export function setTierColor(
  doc: TierListDocument,
  tierId: string,
  color: string
): TierListDocument {
  return {
    ...doc,
    tiers: doc.tiers.map((tier) =>
      tier.id === tierId ? { ...tier, color } : tier
    ),
  }
}

/** Move a tier row up or down within the stack. */
export function moveTier(
  doc: TierListDocument,
  tierId: string,
  direction: -1 | 1
): TierListDocument {
  const index = doc.tiers.findIndex((tier) => tier.id === tierId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= doc.tiers.length) return doc
  const tiers = [...doc.tiers]
  const [moved] = tiers.splice(index, 1)
  tiers.splice(target, 0, moved)
  return { ...doc, tiers }
}

/** Remove a row; its items move back to the unranked pool. */
export function removeTier(
  doc: TierListDocument,
  tierId: string
): TierListDocument {
  const ids = doc.rows[tierId] ?? []
  const rows = { ...doc.rows }
  delete rows[tierId]
  return {
    ...doc,
    tiers: doc.tiers.filter((tier) => tier.id !== tierId),
    rows,
    pool: [...doc.pool, ...ids],
  }
}

/** Move the items of a row back to the unranked pool, keeping the row. */
export function clearTier(
  doc: TierListDocument,
  tierId: string
): TierListDocument {
  const ids = doc.rows[tierId] ?? []
  if (ids.length === 0) return doc
  return {
    ...doc,
    rows: { ...doc.rows, [tierId]: [] },
    pool: [...doc.pool, ...ids],
  }
}

export function addItems(
  doc: TierListDocument,
  incoming: readonly TierItem[]
): TierListDocument {
  const fresh = incoming.filter((item) => !(item.id in doc.items))
  if (fresh.length === 0) return doc
  const items = { ...doc.items }
  const pool = [...doc.pool]
  for (const item of fresh) {
    items[item.id] = item
    pool.push(item.id)
  }
  return { ...doc, items, pool }
}

export function removeItem(
  doc: TierListDocument,
  itemId: string
): TierListDocument {
  if (!(itemId in doc.items)) return doc
  const items = { ...doc.items }
  delete items[itemId]
  const current = findItemContainer(doc, itemId)
  if (current === null) return { ...doc, items }
  const ids = (readContainer(doc, current.container) ?? []).filter(
    (id) => id !== itemId
  )
  return writeContainer({ ...doc, items }, current.container, ids)
}

export function clearAll(doc: TierListDocument): TierListDocument {
  return {
    ...doc,
    items: {},
    rows: Object.fromEntries(doc.tiers.map((tier) => [tier.id, []])),
    pool: [],
  }
}

/**
 * Move an item into a container at an index. Moving within the same
 * container follows `arrayMove` semantics (the target index refers to the
 * original list), matching what dnd-kit expects on drop.
 */
export function moveItem(
  doc: TierListDocument,
  itemId: string,
  targetContainer: TierListContainer,
  targetIndex: number
): TierListDocument {
  if (!(itemId in doc.items)) return doc
  const current = findItemContainer(doc, itemId)
  const target = readContainer(doc, targetContainer)
  if (current === null || target === null) return doc

  if (current.container === targetContainer) {
    const list = [...target]
    const from = current.index
    const to = Math.min(Math.max(targetIndex, 0), list.length - 1)
    if (from === to) return doc
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    return writeContainer(doc, targetContainer, list)
  }

  const next = [...target]
  next.splice(Math.min(targetIndex, next.length), 0, itemId)
  const withoutOld = writeContainer(doc, targetContainer, next)
  const old = (readContainer(withoutOld, current.container) ?? []).filter(
    (id) => id !== itemId
  )
  return writeContainer(withoutOld, current.container, old)
}

/** Lightweight shape validation used when restoring from localStorage. */
export function parseTierListDocument(raw: string): TierListDocument | null {
  try {
    const data = JSON.parse(raw) as unknown
    if (typeof data !== "object" || data === null) return null
    const doc = data as Partial<TierListDocument>
    if (doc.version !== TIER_LIST_STORAGE_VERSION) return null

    const tiers = Array.isArray(doc.tiers)
      ? doc.tiers.filter(
          (tier) =>
            typeof tier?.id === "string" &&
            typeof tier?.label === "string" &&
            typeof tier?.color === "string"
        )
      : []

    const items: Record<string, TierItem> = {}
    if (doc.items !== null && typeof doc.items === "object") {
      for (const [id, item] of Object.entries(doc.items)) {
        if (
          typeof item === "object" &&
          item !== null &&
          typeof item.src === "string" &&
          typeof item.label === "string" &&
          (item.origin === "wiki" || item.origin === "local")
        ) {
          items[id] = {
            id,
            src: item.src,
            label: item.label,
            origin: item.origin,
          }
        }
      }
    }

    const tierIds = new Set(tiers.map((tier) => tier.id))
    const validItemId = (id: unknown): id is string =>
      typeof id === "string" && id in items

    const rows: Record<string, string[]> = {}
    if (doc.rows !== null && typeof doc.rows === "object") {
      for (const [tierId, ids] of Object.entries(doc.rows)) {
        if (!tierIds.has(tierId)) continue
        const seen = new Set<string>()
        rows[tierId] = (Array.isArray(ids) ? ids : [])
          .filter(validItemId)
          .filter((id) => !seen.has(id) && seen.add(id))
      }
    }

    const seen = new Set<string>()
    const pool = (Array.isArray(doc.pool) ? doc.pool : [])
      .filter(validItemId)
      .filter((id) => !seen.has(id) && seen.add(id))

    return {
      version: TIER_LIST_STORAGE_VERSION,
      title: typeof doc.title === "string" ? doc.title : "我的 Tier List",
      tiers,
      items,
      rows,
      pool,
    }
  } catch {
    return null
  }
}
