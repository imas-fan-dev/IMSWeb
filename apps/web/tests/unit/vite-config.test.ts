import { resolve, sep } from "node:path"

import { describe, expect, it } from "vitest"

import {
  parseByteRange,
  resolveExchangeMapAssetPath,
} from "../../vite-exchange-map-assets"

describe("local exchange map asset delivery", () => {
  it("parses closed, open-ended, and suffix byte ranges", () => {
    expect(parseByteRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 })
    expect(parseByteRange("bytes=6-", 10)).toEqual({ start: 6, end: 9 })
    expect(parseByteRange("bytes=-4", 10)).toEqual({ start: 6, end: 9 })
    expect(parseByteRange("bytes=0-99", 10)).toEqual({ start: 0, end: 9 })
  })

  it("rejects unsatisfiable and multi-range requests", () => {
    for (const value of [
      "bytes=10-",
      "bytes=8-4",
      "bytes=-0",
      "bytes=0-1,4-5",
      "items=0-1",
    ]) {
      expect(parseByteRange(value, 10)).toBeNull()
    }
  })

  it("keeps decoded paths inside data/maps/current", () => {
    const assetRoot = resolve(process.cwd(), "../../data/maps/current")
    expect(
      resolveExchangeMapAssetPath("openfreemap-z0-11.pmtiles", assetRoot)
    ).toMatch(
      new RegExp(
        `data${sep}maps${sep}current${sep}openfreemap-z0-11\\.pmtiles$`
      )
    )
    expect(
      resolveExchangeMapAssetPath("../outside.pmtiles", assetRoot)
    ).toBeUndefined()
    expect(
      resolveExchangeMapAssetPath("/absolute.pmtiles", assetRoot)
    ).toBeUndefined()
  })
})
