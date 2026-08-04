import { describe, expect, it } from "vitest"

import {
  contrastingWikiText,
  hasStorySource,
  readableWikiAccent,
} from "~/pages/wiki/wiki-model"

function storyLink(contentType: string) {
  return {
    id: 1,
    up: "投稿者",
    title: "来源",
    url: "https://example.com/story",
    contentType,
    sourcePlatform: "测试平台",
  }
}

describe("Wiki color contrast", () => {
  it("darkens pale accents used as text on white surfaces", () => {
    expect(readableWikiAccent("#dffaff")).not.toBe("#dffaff")
    expect(readableWikiAccent("#202126")).toBe("#202126")
  })

  it("selects a contrasting foreground for colored surfaces", () => {
    expect(contrastingWikiText("#dffaff", "#ffffff")).toBe("#202126")
    expect(contrastingWikiText("#202126", "#ffffff")).toBe("#ffffff")
    expect(contrastingWikiText("#ffd700", "#111111")).toBe("#111111")
  })
})

describe("Wiki story source state", () => {
  it("only treats the normalized 剧情 content type as a story source", () => {
    expect(hasStorySource([storyLink("剧情")])).toBe(true)
    expect(hasStorySource([storyLink(" 剧情 ")])).toBe(true)
    expect(hasStorySource([storyLink("语音")])).toBe(false)
    expect(hasStorySource([storyLink("其他")])).toBe(false)
    expect(hasStorySource([])).toBe(false)
  })
})
