import { describe, expect, it } from "vitest"

import { resolveLanguage } from "./language"
import { resources } from "./resources"

function translationKeys(
  value: Record<string, unknown>,
  prefix = ""
): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key

    return typeof child === "object" && child !== null
      ? translationKeys(child as Record<string, unknown>, path)
      : path
  })
}

describe("i18n language configuration", () => {
  it.each([
    [["zh-Hans-CN"], "zh-CN"],
    [["zh_CN"], "zh-CN"],
    [["en-US"], "en"],
    [["ja-JP", "en-GB"], "en"],
    [["ja-JP"], "zh-CN"],
  ] as const)("resolves %j to %s", (candidates, expected) => {
    expect(resolveLanguage(candidates)).toBe(expected)
  })

  it("keeps every locale aligned with the default resource keys", () => {
    expect(translationKeys(resources.en.common)).toEqual(
      translationKeys(resources["zh-CN"].common)
    )
  })
})
