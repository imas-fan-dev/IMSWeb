import { describe, expect, it } from "vitest"

import { eventLinkTarget } from "~/components/editorial/event-link"

function event(overrides: Partial<Parameters<typeof eventLinkTarget>[0]> = {}) {
  return {
    id: 7,
    has_body: true,
    source_url: null,
    ...overrides,
  }
}

describe("eventLinkTarget", () => {
  it("keeps the detail route when the post has a body", () => {
    expect(
      eventLinkTarget(
        event({ has_body: true, source_url: "https://example.test/post" })
      )
    ).toEqual({ href: "/events/7", external: false })
  })

  it("opens an external source directly when the body is empty", () => {
    expect(
      eventLinkTarget(
        event({ has_body: false, source_url: "https://example.test/post" })
      )
    ).toEqual({ href: "https://example.test/post", external: true })
  })

  it("keeps a root-relative source in the same tab", () => {
    expect(
      eventLinkTarget(event({ has_body: false, source_url: "/notices/7" }))
    ).toEqual({ href: "/notices/7", external: false })
  })

  it("falls back to the detail route without a source", () => {
    expect(
      eventLinkTarget(event({ has_body: false, source_url: null }))
    ).toEqual({ href: "/events/7", external: false })
  })

  it("falls back to the detail route for legacy payloads without has_body", () => {
    expect(
      eventLinkTarget({
        id: 7,
        source_url: "https://example.test/post",
      })
    ).toEqual({ href: "/events/7", external: false })
  })

  it("rejects unsafe or protocol-relative sources", () => {
    for (const source_url of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "//example.test/post",
      "relative/path",
    ]) {
      expect(eventLinkTarget(event({ has_body: false, source_url }))).toEqual({
        href: "/events/7",
        external: false,
      })
    }
  })
})
