import type {
  NamecardCharacterCatalog,
  NamecardCharacterCatalogEntry,
  NamecardCharacterCatalogUnit,
} from "@imsweb/contracts/fudaba/characters"

/** Sentinel for the character filters' 「全部」 option; never collides with an id or code. */
export const CHARACTER_FILTER_ALL = "all"

/** A unit is shown by its Japanese name; the Chinese name is the fallback. */
export function unitLabel(unit: {
  nameJa: string | null
  nameCn: string
}): string {
  return unit.nameJa || unit.nameCn
}

/**
 * Case-insensitive substring match across a character's or unit's four search
 * fields. `aliases` is one packed string, so it needs no splitting.
 */
export function matchesCharacterQuery(
  fields: (string | null)[],
  normalizedQuery: string
): boolean {
  return fields.some(
    (field) =>
      field !== null &&
      field.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
  )
}

export interface CharacterCandidateMatch {
  /** Every catalog entry keyed by id, so a checked id keeps its label. */
  characters: Map<number, NamecardCharacterCatalogEntry>
  /** Rows after the agency and category filters, before the query. */
  filteredCharacters: NamecardCharacterCatalogEntry[]
  matchedCharacters: NamecardCharacterCatalogEntry[]
  matchedUnits: NamecardCharacterCatalogUnit[]
  fallbackCharacters: NamecardCharacterCatalogEntry[]
  nothingMatched: boolean
}

/**
 * The candidate arithmetic behind both character pickers: the full catalog,
 * the agency / category narrowing, the query match for characters and units,
 * and the 「其他…」 fallbacks. UI states (which rows are checked, whether the
 * unit chips are open) stay in the components.
 */
export function matchCharacterCandidates({
  catalog,
  agencyCode,
  category,
  query,
}: {
  catalog: NamecardCharacterCatalog | null
  agencyCode: string
  category: string
  /** Already trimmed and lower-cased. */
  query: string
}): CharacterCandidateMatch {
  const characters = new Map(
    (catalog?.characters ?? []).map((entry) => [entry.id, entry] as const)
  )
  const filteredCharacters = (catalog?.characters ?? []).filter(
    (entry) =>
      (agencyCode === CHARACTER_FILTER_ALL ||
        entry.agencyCode === agencyCode) &&
      (category === CHARACTER_FILTER_ALL || entry.category === category)
  )
  const matchedCharacters = filteredCharacters.filter(
    (entry) =>
      !entry.isFallback &&
      (!query ||
        matchesCharacterQuery(
          [entry.nameCn, entry.nameJa, entry.nameEn, entry.aliases],
          query
        ))
  )
  const selectedAgencyId =
    agencyCode === CHARACTER_FILTER_ALL
      ? null
      : ((catalog?.agencies ?? []).find((agency) => agency.code === agencyCode)
          ?.id ?? null)
  const matchedUnits = query
    ? (catalog?.units ?? []).filter(
        (unit) =>
          matchesCharacterQuery(
            [unit.nameCn, unit.nameJa, unit.nameEn, unit.aliases],
            query
          ) &&
          (selectedAgencyId === null ||
            unit.agencyIds.includes(selectedAgencyId)) &&
          (category === CHARACTER_FILTER_ALL ||
            unit.memberIds.some(
              (memberId) => characters.get(memberId)?.category === category
            ))
      )
    : []
  const nothingMatched =
    matchedCharacters.length === 0 && matchedUnits.length === 0
  // Fallback entries are the 「其他…」 escape hatch. They live under the sentinel
  // 其他 agency, so once a query matches nothing they ignore the agency filter —
  // filtering to a single agency must not hide the rows offered as the fallback.
  // The category filter still applies, so a 吉祥物 filter offers 「其他吉祥物」
  // rather than the idol bucket.
  const fallbackPool =
    query && nothingMatched ? (catalog?.characters ?? []) : filteredCharacters
  const fallbackCharacters = fallbackPool.filter(
    (entry) =>
      entry.isFallback &&
      (category === CHARACTER_FILTER_ALL || entry.category === category)
  )

  return {
    characters,
    filteredCharacters,
    matchedCharacters,
    matchedUnits,
    fallbackCharacters,
    nothingMatched,
  }
}
