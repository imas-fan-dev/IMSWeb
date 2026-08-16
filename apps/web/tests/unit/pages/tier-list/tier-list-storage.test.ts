import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearTierListDocument,
  loadTierListDocument,
  saveTierListDocument,
} from "~/pages/tier-list/tier-list-storage"
import { createTierListDocument } from "~/pages/tier-list/tier-list-model"

describe("tier-list-storage", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("returns null when nothing is stored", () => {
    expect(loadTierListDocument()).toBeNull()
  })

  it("round-trips a document through localStorage", () => {
    const doc = createTierListDocument()
    doc.title = "神推排行"

    const result = saveTierListDocument(doc)
    expect(result.saved).toBe(true)
    expect(loadTierListDocument()?.title).toBe("神推排行")
  })

  it("returns null for corrupted storage", () => {
    window.localStorage.setItem("imsweb:tier-list:v1", "{{{not json")
    expect(loadTierListDocument()).toBeNull()
  })

  it("returns null for an unknown storage version", () => {
    window.localStorage.setItem(
      "imsweb:tier-list:v1",
      JSON.stringify({ version: 2, tiers: [] })
    )
    expect(loadTierListDocument()).toBeNull()
  })

  it("reports quota failures instead of throwing", () => {
    const doc = createTierListDocument()
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError")
      })
    try {
      const result = saveTierListDocument(doc)
      expect(result).toEqual({ saved: false, reason: "quota" })
    } finally {
      spy.mockRestore()
    }
  })

  it("clears the stored document", () => {
    saveTierListDocument(createTierListDocument())
    clearTierListDocument()
    expect(loadTierListDocument()).toBeNull()
  })
})
