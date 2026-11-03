import { describe, expect, it } from "vitest"

import {
  formatPlatformValue,
  platformValueError,
  type PlatformAccountFormat,
} from "@imsweb/contracts/namecards"

function kind(overrides: Partial<PlatformAccountFormat>): PlatformAccountFormat {
  return {
    id: "github",
    group: "social",
    pattern: "^[a-z0-9-]{1,39}$",
    baseUrl: "https://github.com/{value}",
    uppercase: false,
    ...overrides,
  }
}

describe("platform account values", () => {
  it("strips the platform prefix and any query the visitor pasted", () => {
    expect(
      formatPlatformValue(kind({}), "https://github.com/zheizhei?tab=repos")
    ).toBe("zheizhei")
    expect(formatPlatformValue(kind({}), "  ZheiZhei  ")).toBe("zheizhei")
  })

  it("keeps a query template so the placeholder cannot be eaten", () => {
    // A template with ? means the pasted query is part of the platform's own
    // link, so only & and # may terminate the value.
    const minecraft = kind({
      id: "minecraft",
      baseUrl: "https://namemc.com/profile/{value}?tab=skin",
    })
    expect(
      formatPlatformValue(minecraft, "https://namemc.com/profile/abc&x=1")
    ).toBe("abc")
  })

  it("matches the template path before cutting what follows it", () => {
    const namemc = kind({
      id: "namemc",
      baseUrl: "https://namemc.com/profile/{value}?tab=skin",
    })
    // The pasted link repeats the template's own query; it must not leak in.
    expect(
      formatPlatformValue(namemc, "https://namemc.com/profile/abc?tab=skin")
    ).toBe("abc")
    expect(
      formatPlatformValue(namemc, "https://namemc.com/profile/abc&extra=1")
    ).toBe("abc")
  })

  it("uses a template suffix as the closing boundary", () => {
    const bluesky = kind({
      id: "bluesky",
      pattern: "^[A-Za-z0-9.-]{1,64}$",
      baseUrl: "https://bsky.app/profile/{value}.bsky.social",
    })
    expect(
      formatPlatformValue(bluesky, "https://bsky.app/profile/alice.bsky.social")
    ).toBe("alice")
    expect(
      formatPlatformValue(
        bluesky,
        "https://bsky.app/profile/alice.bsky.social?ref=feed"
      )
    ).toBe("alice")
    // A custom domain never carries the suffix, so the whole handle survives.
    expect(
      formatPlatformValue(bluesky, "https://bsky.app/profile/alice.example.com")
    ).toBe("alice.example.com")
  })

  it("reads the identifier out of a query-parameter template", () => {
    const example = kind({
      id: "example",
      baseUrl: "https://example.com/?user={value}",
    })
    expect(
      formatPlatformValue(example, "https://example.com/?user=bob&ref=1")
    ).toBe("bob")
  })

  it("upper-cases the game handles that are stored in capitals", () => {
    expect(
      formatPlatformValue(
        kind({ id: "mirishita", group: "game", pattern: "^[A-Z0-9]{8}$", baseUrl: null, uppercase: true }),
        "abcd1234"
      )
    ).toBe("ABCD1234")
  })

  it("encodes a YouTube handle so a Japanese one fits the pattern", () => {
    const youtube = kind({
      id: "youtube",
      pattern: "^(@([A-Za-z0-9._-]|%[0-9A-F]{2}){3,30}|UC[A-Za-z0-9_-]{22})$",
      baseUrl: "https://www.youtube.com/{value}",
    })
    // The editor shows the readable handle; only the stored copy is escaped.
    const formatted = formatPlatformValue(
      youtube,
      "https://www.youtube.com/@アイドルマスター"
    )
    expect(formatted).toBe("@アイドルマスター")
    const stored = `@${encodeURIComponent(formatted.slice(1))}`
    expect(platformValueError(youtube, stored)).toBeNull()
  })

  it("accepts a full link for the homepage but rejects a bare word", () => {
    const homepage = kind({
      id: "homepage",
      group: "link",
      pattern: "^https://[^\\s]+$",
      baseUrl: null,
    })
    const link = "https://preview.idol-master.top/"
    expect(formatPlatformValue(homepage, link)).toBe("https://preview.idol-master.top")
    expect(platformValueError(homepage, "https://preview.idol-master.top")).toBeNull()
    expect(platformValueError(homepage, "preview")).not.toBeNull()
  })
})
