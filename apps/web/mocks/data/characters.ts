import type {
  NamecardCharacterCatalog,
  NamecardCharacterCatalogAgency,
  NamecardCharacterCatalogEntry,
  NamecardCharacterCatalogUnit,
} from "@imsweb/contracts/fudaba/characters"

/**
 * The public character catalog behind the namecard picker.
 *
 * The fixture is deliberately mixed: two agencies plus the sentinel 「其他」
 * agency that owns every `isFallback` bucket the picker pins to the end of its
 * candidate list, and at least one searchable unit.
 */
export function makeNamecardCharacterCatalogAgency(
  overrides: Partial<NamecardCharacterCatalogAgency> = {}
): NamecardCharacterCatalogAgency {
  return {
    id: 2,
    code: "cg",
    name: "CINDERELLA GIRLS",
    color: "#2681c8",
    ...overrides,
  }
}

export function makeNamecardCharacterCatalogEntry(
  overrides: Partial<NamecardCharacterCatalogEntry> = {}
): NamecardCharacterCatalogEntry {
  return {
    id: 3,
    agencyId: 2,
    agencyCode: "cg",
    agencyName: "CINDERELLA GIRLS",
    agencyColor: "#2681c8",
    category: "idol",
    isFallback: false,
    nameCn: "涩谷凛",
    nameJa: "渋谷凛",
    nameEn: "Rin Shibuya",
    aliases: null,
    ...overrides,
  }
}

export function makeNamecardCharacterCatalogUnit(
  overrides: Partial<NamecardCharacterCatalogUnit> = {}
): NamecardCharacterCatalogUnit {
  return {
    id: 1,
    nameCn: "765PRO ALLSTARS",
    nameJa: "765プロオールスターズ",
    nameEn: "765PRO ALLSTARS",
    aliases: "allstars",
    agencyIds: [1],
    memberIds: [1, 2],
    ...overrides,
  }
}

export function makeNamecardCharacterCatalog(
  overrides: Partial<NamecardCharacterCatalog> = {}
): NamecardCharacterCatalog {
  return {
    agencies: [
      { id: 1, code: "765", name: "765PRO ALLSTARS", color: "#f34e6c" },
      makeNamecardCharacterCatalogAgency(),
      { id: 9, code: "namecard-other", name: "其他", color: "#8a8a8a" },
    ],
    categories: ["idol", "staff", "rival", "mascot", "chara", "other"],
    characters: [
      makeNamecardCharacterCatalogEntry({
        id: 1,
        agencyId: 1,
        agencyCode: "765",
        agencyName: "765PRO ALLSTARS",
        agencyColor: "#f34e6c",
        nameCn: "天海春香",
        nameJa: "天海春香",
        nameEn: "Haruka Amami",
        aliases: "はるかっちょ haruka",
      }),
      makeNamecardCharacterCatalogEntry({
        id: 2,
        agencyId: 1,
        agencyCode: "765",
        agencyName: "765PRO ALLSTARS",
        agencyColor: "#f34e6c",
        nameCn: "如月千早",
        nameJa: "如月千早",
        nameEn: "Chihaya Kisaragi",
      }),
      makeNamecardCharacterCatalogEntry(),
      makeNamecardCharacterCatalogEntry({
        id: 10,
        agencyId: 1,
        agencyCode: "765",
        agencyName: "765PRO ALLSTARS",
        agencyColor: "#f34e6c",
        category: "staff",
        nameCn: "音无小鸟",
        nameJa: "音無小鳥",
        nameEn: "Tsubame Otonashi",
      }),
      makeNamecardCharacterCatalogEntry({
        id: 21,
        agencyId: 9,
        agencyCode: "namecard-other",
        agencyName: "其他",
        agencyColor: "#8a8a8a",
        category: "idol",
        isFallback: true,
        nameCn: "其他偶像",
        nameJa: null,
        nameEn: null,
      }),
      makeNamecardCharacterCatalogEntry({
        id: 22,
        agencyId: 9,
        agencyCode: "namecard-other",
        agencyName: "其他",
        agencyColor: "#8a8a8a",
        category: "staff",
        isFallback: true,
        nameCn: "其他职员",
        nameJa: null,
        nameEn: null,
      }),
      makeNamecardCharacterCatalogEntry({
        id: 23,
        agencyId: 9,
        agencyCode: "namecard-other",
        agencyName: "其他",
        agencyColor: "#8a8a8a",
        category: "mascot",
        isFallback: true,
        nameCn: "其他吉祥物",
        nameJa: null,
        nameEn: null,
      }),
    ],
    units: [makeNamecardCharacterCatalogUnit()],
    ...overrides,
  }
}
