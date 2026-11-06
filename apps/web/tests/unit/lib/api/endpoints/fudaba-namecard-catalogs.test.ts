import { adminApiPath, exchangePath } from "@imsweb/contracts/paths"
import { afterEach, describe, expect, it } from "vitest"

import {
  installFetchMock,
  jsonResponse,
  requestDetails,
} from "@/tests/unit/support/api-client"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import {
  createAdminNamecardCharacter,
  deleteAdminNamecardCharacter,
  getAdminNamecardCharacterAgencies,
  getAdminNamecardCharacters,
  updateAdminNamecardCharacter,
} from "~/lib/api/endpoints/fudaba/admin-characters"
import {
  createAdminNamecardUnit,
  deleteAdminNamecardUnit,
  getAdminNamecardUnits,
  updateAdminNamecardUnit,
} from "~/lib/api/endpoints/fudaba/admin-units"
import { getNamecardCharacterCatalog } from "~/lib/api/endpoints/fudaba/character-catalog"

const pageInfo = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
  hasNextPage: false,
}

const character = {
  id: 7,
  agencyId: 2,
  agencyCode: "765as",
  agencyName: "本家",
  agencyColor: "#f34f6d",
  category: "idol",
  isFallback: false,
  nameCn: "天海春香",
  nameJa: null,
  nameEn: null,
  aliases: null,
  displayOrder: 0,
  revision: 0,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
}

const unit = {
  id: 9,
  nameCn: "Project Fairy",
  nameJa: null,
  nameEn: null,
  aliases: null,
  displayOrder: 0,
  revision: 0,
  agencies: [{ id: 2, code: "765as", name: "本家", color: "#f34f6d" }],
  members: [
    {
      characterId: 30,
      nameCn: "星井美希",
      nameJa: null,
      nameEn: null,
      category: "idol",
    },
  ],
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
}

afterEach(() => {
  clearCsrfCookie("backoffice")
})

describe("admin namecard character endpoints", () => {
  it("lists characters and drops empty query keys", async () => {
    const fetchMock = installFetchMock().mockResolvedValue(
      jsonResponse({ success: true, characters: [character], pageInfo })
    )

    await expect(
      getAdminNamecardCharacters({ query: "春香", category: "idol" }).send()
    ).resolves.toEqual({ success: true, characters: [character], pageInfo })

    const url = new URL(requestDetails(fetchMock.mock.calls[0]!).url, "http://ims.test")
    expect(url.pathname).toBe(adminApiPath("/cards/characters"))
    expect(url.searchParams.get("query")).toBe("春香")
    expect(url.searchParams.get("category")).toBe("idol")
    expect(url.searchParams.has("agencyId")).toBe(false)
    expect(url.searchParams.has("page")).toBe(false)
  })

  it("lists every agency including the sentinel bucket", async () => {
    installFetchMock().mockResolvedValue(
      jsonResponse({
        success: true,
        agencies: [
          { id: 1, code: "namecard-other", name: "其他", color: "#8a8a8a", wikiEnabled: false },
        ],
      })
    )

    await expect(getAdminNamecardCharacterAgencies().send()).resolves.toMatchObject({
      agencies: [{ code: "namecard-other", wikiEnabled: false }],
    })
  })

  it("creates, updates and deletes a character with the csrf header", async () => {
    setCsrfCookie("backoffice", "character-csrf")
    const fetchMock = installFetchMock()
      .mockResolvedValueOnce(jsonResponse({ success: true, character }))
      .mockResolvedValueOnce(jsonResponse({ success: true, character }))
      .mockResolvedValueOnce(jsonResponse({ success: true, id: 7 }))

    await expect(
      createAdminNamecardCharacter({ agencyId: 2, category: "idol", nameCn: "天海春香" }).send()
    ).resolves.toMatchObject({ character: { id: 7 } })
    await expect(
      updateAdminNamecardCharacter(7, {
        agencyId: 2,
        category: "idol",
        nameCn: "天海春香",
        revision: 0,
      }).send()
    ).resolves.toMatchObject({ character: { id: 7 } })
    await expect(deleteAdminNamecardCharacter(7, 3).send()).resolves.toEqual({
      success: true,
      id: 7,
    })

    expect(requestDetails(fetchMock.mock.calls[0]!).method).toBe("POST")
    expect(requestDetails(fetchMock.mock.calls[1]!).method).toBe("PATCH")
    expect(requestDetails(fetchMock.mock.calls[2]!).method).toBe("DELETE")
    const deleteUrl = new URL(requestDetails(fetchMock.mock.calls[2]!).url, "http://ims.test")
    expect(deleteUrl.pathname).toBe(`${adminApiPath("/cards/characters")}/7`)
    expect(deleteUrl.searchParams.get("revision")).toBe("3")
  })

  it("surfaces the stale-editor conflict envelope", async () => {
    setCsrfCookie("backoffice", "character-csrf")
    installFetchMock().mockResolvedValue(
      jsonResponse(
        { success: false, code: "NAMECARD_CHARACTER_STATE_CONFLICT", revision: 9 },
        409
      )
    )

    await expect(
      updateAdminNamecardCharacter(7, {
        agencyId: 2,
        category: "idol",
        nameCn: "天海春香",
        revision: 4,
      }).send()
    ).rejects.toMatchObject({
      kind: "http",
      status: 409,
      payload: { code: "NAMECARD_CHARACTER_STATE_CONFLICT", revision: 9 },
    })
  })
})

describe("admin namecard unit endpoints", () => {
  it("lists units with the agency filter", async () => {
    const fetchMock = installFetchMock().mockResolvedValue(
      jsonResponse({ success: true, units: [unit], pageInfo })
    )

    await expect(getAdminNamecardUnits({ agencyId: 2 }).send()).resolves.toEqual({
      success: true,
      units: [unit],
      pageInfo,
    })

    const url = new URL(requestDetails(fetchMock.mock.calls[0]!).url, "http://ims.test")
    expect(url.pathname).toBe(adminApiPath("/cards/units"))
    expect(url.searchParams.get("agencyId")).toBe("2")
  })

  it("creates, updates and deletes a unit with the csrf header", async () => {
    setCsrfCookie("backoffice", "unit-csrf")
    const fetchMock = installFetchMock()
      .mockResolvedValueOnce(jsonResponse({ success: true, unit }))
      .mockResolvedValueOnce(jsonResponse({ success: true, unit }))
      .mockResolvedValueOnce(jsonResponse({ success: true, id: 9 }))

    await expect(
      createAdminNamecardUnit({
        nameCn: "Project Fairy",
        agencyIds: [2],
        memberIds: [30],
      }).send()
    ).resolves.toMatchObject({ unit: { id: 9 } })
    await expect(
      updateAdminNamecardUnit(9, {
        nameCn: "Project Fairy",
        agencyIds: [2],
        memberIds: [30],
        revision: 0,
      }).send()
    ).resolves.toMatchObject({ unit: { id: 9 } })
    await expect(deleteAdminNamecardUnit(9, 2).send()).resolves.toEqual({
      success: true,
      id: 9,
    })

    const deleteUrl = new URL(requestDetails(fetchMock.mock.calls[2]!).url, "http://ims.test")
    expect(deleteUrl.pathname).toBe(`${adminApiPath("/cards/units")}/9`)
    expect(deleteUrl.searchParams.get("revision")).toBe("2")
  })

  it("surfaces the stale-editor conflict envelope", async () => {
    setCsrfCookie("backoffice", "unit-csrf")
    installFetchMock().mockResolvedValue(
      jsonResponse(
        { success: false, code: "NAMECARD_UNIT_STATE_CONFLICT", revision: 6 },
        409
      )
    )

    await expect(
      deleteAdminNamecardUnit(9, 1).send()
    ).rejects.toMatchObject({
      kind: "http",
      status: 409,
      payload: { code: "NAMECARD_UNIT_STATE_CONFLICT", revision: 6 },
    })
  })
})

describe("public namecard character catalog endpoint", () => {
  it("parses the catalog the picker filters in memory", async () => {
    const fetchMock = installFetchMock().mockResolvedValue(
      jsonResponse({
        agencies: [{ id: 2, code: "765as", name: "本家", color: "#f34f6d" }],
        categories: ["idol", "staff", "rival", "mascot", "chara", "other"],
        characters: [
          {
            id: 7,
            agencyId: 2,
            agencyCode: "765as",
            agencyName: "本家",
            agencyColor: "#f34f6d",
            category: "idol",
            isFallback: false,
            nameCn: "天海春香",
            nameJa: null,
            nameEn: null,
            aliases: null,
          },
        ],
        units: [
          {
            id: 9,
            nameCn: "Project Fairy",
            nameJa: null,
            nameEn: null,
            aliases: null,
            agencyIds: [2],
            memberIds: [30],
          },
        ],
      })
    )

    const result = await getNamecardCharacterCatalog().send()

    expect(result.characters[0]).toMatchObject({ id: 7, agencyCode: "765as" })
    expect(result.units[0]).toMatchObject({ id: 9, memberIds: [30] })
    expect(
      new URL(requestDetails(fetchMock.mock.calls[0]!).url, "http://ims.test").pathname
    ).toBe(exchangePath("/characters"))
  })

  it("rejects a catalog that carries unknown fields", async () => {
    installFetchMock().mockResolvedValue(
      jsonResponse({
        agencies: [],
        categories: [],
        characters: [],
        units: [],
        unexpected: true,
      })
    )

    await expect(getNamecardCharacterCatalog().send()).rejects.toMatchObject({
      kind: "contract",
    })
  })
})
