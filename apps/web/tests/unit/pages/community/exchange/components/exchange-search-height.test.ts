import { describe, expect, it } from "vitest"
import { expandedSearchMinimumHeight } from "~/pages/community/exchange/components/exchange-search-height"

describe("expanded search reading budget", () => {
  it("keeps the normal detent floor with a 12px input/action gap", () => {
    expect(
      expandedSearchMinimumHeight({
        surface: 92,
        actions: 44,
        gap: 12,
        insets: 28,
      })
    ).toBe(260)
  })

  it("grows for live essential text without taking the reading target's space", () => {
    const measured = { surface: 160, actions: 88, gap: 12, insets: 28 }
    const height = expandedSearchMinimumHeight(measured)
    expect(height).toBe(332)
    expect(
      height -
        measured.surface -
        measured.actions -
        measured.gap -
        measured.insets
    ).toBe(44)
    expect(expandedSearchMinimumHeight({ ...measured, gap: 20 })).toBe(
      height + 8
    )
  })

  it("restores the normal floor after text returns to normal", () => {
    expect(
      expandedSearchMinimumHeight({
        surface: 92,
        actions: 44,
        gap: 12,
        insets: 28,
      })
    ).toBe(260)
  })

  it("does not accept a transiently compressed action or gap as a smaller budget", () => {
    expect(
      expandedSearchMinimumHeight({
        surface: 220,
        actions: 0,
        gap: 0,
        insets: 28,
      })
    ).toBe(348)
  })

  it("keeps a usable floor while measurement is unavailable", () => {
    expect(
      expandedSearchMinimumHeight({
        surface: Number.NaN,
        actions: 44,
        gap: 12,
        insets: 28,
      })
    ).toBe(260)
  })
})
