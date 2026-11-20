import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  tagSuggestionRows,
  useTagSuggestions,
} from "~/components/community/use-tag-suggestions"
import type { TagSuggestionRow } from "~/components/community/use-tag-suggestions"
import type { NamecardTagSuggestionPreset } from "~/lib/api"

const apiMocks = vi.hoisted(() => ({
  getNamecardTagSuggestions: vi.fn(),
}))

vi.mock("~/lib/api", () => ({
  getNamecardTagSuggestions: apiMocks.getNamecardTagSuggestions,
}))

function preset(
  id: number,
  name: string,
  aliases: string[] = []
): NamecardTagSuggestionPreset {
  return { id, name, aliases }
}

function respond(presets: NamecardTagSuggestionPreset[]) {
  return { send: () => Promise.resolve({ presets }) }
}

function labels(rows: readonly TagSuggestionRow[]) {
  return rows.map((row) => (row.kind === "input" ? row.text : row.preset.name))
}

describe("tagSuggestionRows", () => {
  it("always puts the raw input first, then presets", () => {
    const rows = tagSuggestionRows("偶像", [preset(1, "偶像大师")])

    expect(rows[0]).toEqual({ kind: "input", text: "偶像" })
    expect(labels(rows)).toEqual(["偶像", "偶像大师"])
  })

  it("ranks exact matches first, then prefix matches, then substring matches", () => {
    // 故意把顺序写乱：排序不能依赖服务端返回值的位置。
    const rows = tagSuggestionRows("偶像", [
      preset(1, "偶像荣耀"), // prefix
      preset(2, "偶像大师"), // prefix
      preset(3, "偶像"), // exact
      preset(4, "765偶像"), // substring only
    ])

    // 同组内保持传入顺序：两个前缀按原顺序排在子串之前。
    expect(labels(rows)).toEqual(["偶像", "偶像", "偶像荣耀", "偶像大师", "765偶像"])
  })

  it("matches aliases and reports the alias that hit", () => {
    const rows = tagSuggestionRows("imas", [
      preset(1, "偶像大师", ["imas", "THE IDOLM@STER"]),
    ])

    expect(rows).toHaveLength(2)
    const row = rows[1]
    expect(row.kind).toBe("preset")
    if (row.kind === "preset") {
      expect(row.preset.name).toBe("偶像大师")
      expect(row.alias).toBe("imas")
    }
  })

  it("drops presets that are already added and ignores blank input", () => {
    const rows = tagSuggestionRows("偶像", [preset(1, "偶像大师")], ["偶像大师"])

    expect(labels(rows)).toEqual(["偶像"])
    expect(tagSuggestionRows("   ", [preset(1, "偶像大师")])).toEqual([])
  })
})

describe("useTagSuggestions", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    apiMocks.getNamecardTagSuggestions.mockImplementation(() =>
      respond([preset(1, "偶像大师")])
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("does not query while the input is empty", () => {
    renderHook(() => useTagSuggestions("   "))

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(apiMocks.getNamecardTagSuggestions).not.toHaveBeenCalled()
  })

  it("waits for the 300ms pause before asking for presets", async () => {
    const { result, rerender } = renderHook(
      ({ query }) => useTagSuggestions(query),
      { initialProps: { query: "" } }
    )

    rerender({ query: "偶像" })
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(apiMocks.getNamecardTagSuggestions).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })

    expect(apiMocks.getNamecardTagSuggestions).toHaveBeenCalledWith("偶像", 8)
    expect(result.current.presets.map((entry) => entry.name)).toEqual([
      "偶像大师",
    ])
  })

  it("never shows a response that belongs to an older query", async () => {
    const first = Promise.withResolvers<{
      presets: NamecardTagSuggestionPreset[]
    }>()
    apiMocks.getNamecardTagSuggestions
      .mockImplementationOnce(() => ({ send: () => first.promise }))
      .mockImplementationOnce(() => respond([preset(2, "偶像荣耀")]))

    const { result, rerender } = renderHook(
      ({ query }) => useTagSuggestions(query),
      { initialProps: { query: "偶" } }
    )

    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    expect(apiMocks.getNamecardTagSuggestions).toHaveBeenCalledTimes(1)

    rerender({ query: "偶像" })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    expect(result.current.presets.map((entry) => entry.name)).toEqual([
      "偶像荣耀",
    ])

    // 旧请求晚到：保留当前查询的结果，不被它覆盖。
    await act(async () => {
      first.resolve({ presets: [preset(1, "偶像大师")] })
      await Promise.resolve()
    })
    expect(result.current.presets.map((entry) => entry.name)).toEqual([
      "偶像荣耀",
    ])
  })
})
