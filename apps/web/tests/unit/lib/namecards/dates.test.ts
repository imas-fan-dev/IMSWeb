import { describe, expect, it } from "vitest"

import {
  cardTimeLabel,
  madeOnLabel,
  namecardDateLabel,
} from "~/lib/namecards/dates"

describe("madeOnLabel", () => {
  it("keeps the precision the author filled in", () => {
    expect(madeOnLabel("2025")).toBe("2025 年")
    expect(madeOnLabel("2025-03")).toBe("2025 年 3 月")
    expect(madeOnLabel("2025-03-02")).toBe("2025年3月2日")
  })

  it("returns null for empty or malformed values", () => {
    expect(madeOnLabel(null)).toBeNull()
    expect(madeOnLabel("")).toBeNull()
    expect(madeOnLabel("-03")).toBeNull()
  })
})

describe("namecardDateLabel", () => {
  it("renders the Asia/Shanghai calendar day", () => {
    // 2025-03-02T01:00Z 在上海是 3 月 2 日 09:00。
    expect(namecardDateLabel("2025-03-02T01:00:00.000Z")).toBe("2025-03-02")
  })

  it("returns null instead of an invalid date", () => {
    expect(namecardDateLabel("not-a-date")).toBeNull()
    expect(namecardDateLabel(null)).toBeNull()
  })
})

describe("cardTimeLabel", () => {
  it("prefers madeOn and falls back to the created time", () => {
    expect(
      cardTimeLabel({ madeOn: "2024-11", createdAt: "2025-03-02T01:00:00.000Z" })
    ).toBe("2024 年 11 月")
    expect(
      cardTimeLabel({ madeOn: null, createdAt: "2025-03-02T01:00:00.000Z" })
    ).toBe("2025-03-02")
  })
})
