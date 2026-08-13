import { describe, expect, it } from "vitest"

import {
  CG_VOICED_IDOL_FOLDER_NAMES,
  shouldKeepCgIdol,
} from "~/pages/wiki/cg-voiced-idols"

describe("cg-voiced-idols", () => {
  it("contains exactly the 99 voiced Cinderella Girls idols", () => {
    expect(CG_VOICED_IDOL_FOLDER_NAMES.size).toBe(99)
  })

  it("keeps voiced idols by folderName", () => {
    expect(shouldKeepCgIdol({ folderName: "shibuya_rin" })).toBe(true)
    expect(shouldKeepCgIdol({ folderName: "shimamura_uzuki" })).toBe(true)
    expect(shouldKeepCgIdol({ folderName: "eve_santaclaus" })).toBe(true)
    expect(shouldKeepCgIdol({ folderName: "yumemi_riamu" })).toBe(true)
  })

  it("rejects unvoiced or unknown folder names", () => {
    expect(shouldKeepCgIdol({ folderName: "unknown_idol" })).toBe(false)
    expect(shouldKeepCgIdol({ folderName: "" })).toBe(false)
  })

  it("always keeps non-idol special folders like event_story", () => {
    expect(shouldKeepCgIdol({ folderName: "event_story" })).toBe(true)
  })
})
