import { describe, expect, it } from "vitest"

import { normalizeProducerReading } from "~/pages/account/me/namecards/card-reading"

describe("normalizeProducerReading", () => {
  it("keeps kana and latin letters", () => {
    expect(normalizeProducerReading("かとう ゆうき")).toBe("かとう ゆうき")
    expect(normalizeProducerReading("Katou Yuuki")).toBe("Katou Yuuki")
  })

  it("keeps the syllable marks the server accepts", () => {
    expect(normalizeProducerReading("かとう-せんぱい")).toBe("かとう-せんぱい")
    expect(normalizeProducerReading("かとう's")).toBe("かとう's")
  })

  it("folds full width latin letters instead of dropping them", () => {
    expect(normalizeProducerReading("Ｋａｔｏｕ")).toBe("Katou")
  })

  it("drops characters outside the reading alphabet", () => {
    expect(normalizeProducerReading("かとう。")).toBe("かとう")
    expect(normalizeProducerReading("かとう！？")).toBe("かとう")
    expect(normalizeProducerReading("かとう\n")).toBe("かとう")
  })

  it("reports an empty reading as null", () => {
    expect(normalizeProducerReading("")).toBeNull()
    expect(normalizeProducerReading("　 ")).toBeNull()
    expect(normalizeProducerReading("。")).toBeNull()
  })
})
