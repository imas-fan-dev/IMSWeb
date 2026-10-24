import {
  namecardCharacterCatalogSchema,
  type NamecardCharacterCatalog,
  type NamecardCharacterCatalogEntry,
} from "@imsweb/contracts/fudaba/characters"
import { exchangePath } from "@imsweb/contracts/paths"

import type { ApiDispatcher, ApiTimes } from "./api-dispatcher"

function character(
  overrides: Partial<NamecardCharacterCatalogEntry> &
    Pick<NamecardCharacterCatalogEntry, "id" | "nameCn">
): NamecardCharacterCatalogEntry {
  return {
    agencyId: 1,
    agencyCode: "765",
    agencyName: "765PRO ALLSTARS",
    agencyColor: "#f34e6c",
    category: "idol",
    isFallback: false,
    nameJa: overrides.nameCn,
    nameEn: null,
    aliases: null,
    ...overrides,
  }
}

/** Mirrors `mocks/data/characters.ts` for the browser-driven suites. */
export function makeCharacterCatalog(): NamecardCharacterCatalog {
  return {
    agencies: [
      { id: 1, code: "765", name: "765PRO ALLSTARS", color: "#f34e6c" },
      { id: 2, code: "cg", name: "CINDERELLA GIRLS", color: "#2681c8" },
      { id: 9, code: "namecard-other", name: "其他", color: "#8a8a8a" },
    ],
    categories: ["idol", "staff", "rival", "mascot", "chara", "other"],
    characters: [
      character({
        id: 1,
        nameCn: "天海春香",
        nameEn: "Haruka Amami",
        aliases: "はるかっちょ haruka",
      }),
      character({ id: 2, nameCn: "如月千早", nameEn: "Chihaya Kisaragi" }),
      character({
        id: 3,
        agencyId: 2,
        agencyCode: "cg",
        agencyName: "CINDERELLA GIRLS",
        agencyColor: "#2681c8",
        nameCn: "涩谷凛",
        nameJa: "渋谷凛",
        nameEn: "Rin Shibuya",
      }),
      character({ id: 10, nameCn: "音无小鸟", category: "staff" }),
      character({
        id: 21,
        agencyId: 9,
        agencyCode: "namecard-other",
        agencyName: "其他",
        agencyColor: "#8a8a8a",
        nameCn: "其他偶像",
        category: "idol",
        isFallback: true,
        nameJa: null,
      }),
      character({
        id: 22,
        agencyId: 9,
        agencyCode: "namecard-other",
        agencyName: "其他",
        agencyColor: "#8a8a8a",
        nameCn: "其他职员",
        category: "staff",
        isFallback: true,
        nameJa: null,
      }),
      character({
        id: 23,
        agencyId: 9,
        agencyCode: "namecard-other",
        agencyName: "其他",
        agencyColor: "#8a8a8a",
        nameCn: "其他吉祥物",
        category: "mascot",
        isFallback: true,
        nameJa: null,
      }),
    ],
    units: [
      {
        id: 1,
        nameCn: "765PRO ALLSTARS",
        nameJa: "765プロオールスターズ",
        nameEn: "765PRO ALLSTARS",
        aliases: "allstars",
        agencyIds: [1],
        memberIds: [1, 2],
      },
    ],
  }
}

export function installCharacterCatalogMock(
  api: ApiDispatcher,
  times: ApiTimes
) {
  api.expect({
    name: "deterministic public character catalog",
    method: "GET",
    path: exchangePath("/characters"),
    responses: { 200: namecardCharacterCatalogSchema },
    times,
    handle: () => ({ status: 200, json: makeCharacterCatalog() }),
  })
}
