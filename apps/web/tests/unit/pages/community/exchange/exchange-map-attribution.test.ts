import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  type ExchangeMapAttributionSegment,
  parseMapAttribution,
} from "~/pages/community/exchange/exchange-map-attribution"

// Read the notice from the shipped style instead of copying it: a copy would
// keep passing after the licence text changed, which is exactly the drift this
// parser exists to avoid.
const styleAttribution = (
  JSON.parse(
    readFileSync(resolve(process.cwd(), "public/maps/exchange-style.json"), "utf8")
  ) as { sources: { openmaptiles: { attribution: string } } }
).sources.openmaptiles.attribution

function segmentsOf(raw: unknown): ExchangeMapAttributionSegment[] {
  return parseMapAttribution(raw)?.segments ?? []
}

describe("parseMapAttribution", () => {
  it("keeps the style notice's links in their authored order", () => {
    expect(segmentsOf(styleAttribution)).toEqual([
      { kind: "link", label: "OpenFreeMap", href: "https://openfreemap.org" },
      { kind: "text", value: " " },
      {
        kind: "link",
        label: "© OpenMapTiles",
        href: "https://www.openmaptiles.org/",
      },
      { kind: "text", value: " Data from " },
      {
        kind: "link",
        label: "OpenStreetMap",
        href: "https://www.openstreetmap.org/copyright",
      },
    ])
  })

  it("decodes entities in link labels", () => {
    const labels = segmentsOf(styleAttribution)
      .filter((segment) => segment.kind === "link")
      .map((segment) => segment.label)

    expect(labels).toEqual(["OpenFreeMap", "© OpenMapTiles", "OpenStreetMap"])
  })

  it("keeps the plain-text authoring between links", () => {
    const text = segmentsOf(styleAttribution)
      .filter((segment) => segment.kind === "text")
      .map((segment) => segment.value)
      .join("")

    expect(text.trim()).toBe("Data from")
  })

  it("degrades non-https anchors to text so they never become clickable", () => {
    expect(
      segmentsOf('<a href="http://openfreemap.org">OpenFreeMap</a>')
    ).toEqual([{ kind: "text", value: "OpenFreeMap" }])
    expect(segmentsOf('<a href="javascript:alert(1)">tap me</a>')).toEqual([
      { kind: "text", value: "tap me" },
    ])
    expect(segmentsOf('<a href="//example.com">example</a>')).toEqual([
      { kind: "text", value: "example" },
    ])
    expect(segmentsOf("<a>anchor without href</a>")).toEqual([
      { kind: "text", value: "anchor without href" },
    ])
  })

  it("walks through wrapper elements instead of dropping their text", () => {
    expect(segmentsOf("<span>Data from <b>OpenStreetMap</b></span>")).toEqual([
      { kind: "text", value: "Data from " },
      { kind: "text", value: "OpenStreetMap" },
    ])
  })

  it("ignores script and style content", () => {
    expect(
      segmentsOf("<script>alert(1)</script><style>a{}</style>OpenFreeMap")
    ).toEqual([{ kind: "text", value: "OpenFreeMap" }])
  })

  it("returns a single text segment when the notice carries no link", () => {
    expect(segmentsOf("© OpenMapTiles")).toEqual([
      { kind: "text", value: "© OpenMapTiles" },
    ])
  })

  it("returns null when there is nothing to render", () => {
    expect(parseMapAttribution(undefined)).toBeNull()
    expect(parseMapAttribution(null)).toBeNull()
    expect(parseMapAttribution(42)).toBeNull()
    expect(parseMapAttribution({ attribution: styleAttribution })).toBeNull()
    expect(parseMapAttribution("")).toBeNull()
    expect(parseMapAttribution("   \n  ")).toBeNull()
    expect(
      parseMapAttribution('<a href="https://openfreemap.org"></a>')
    ).toBeNull()
  })

  it("trims edge whitespace but keeps interior separators", () => {
    expect(segmentsOf(`  <b> </b> ${styleAttribution} <b> </b>  `)).toEqual(
      segmentsOf(styleAttribution)
    )
  })
})
