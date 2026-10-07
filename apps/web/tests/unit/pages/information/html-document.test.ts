import { describe, expect, it } from "vitest"

import { buildInformationHtmlDocument } from "~/pages/information/html-document"

describe("buildInformationHtmlDocument", () => {
  it("places managed HTML behind a restrictive document policy", () => {
    const document = buildInformationHtmlDocument(
      "<Activity>",
      '<h2>正文</h2><img src="/uploads/information/original/body.webp">'
    )

    expect(document).toContain("default-src 'none'")
    expect(document).toContain("img-src 'self' https: http: data: blob:")
    expect(document).toContain("form-action 'none'")
    expect(document).toContain("&lt;Activity&gt;")
    expect(document).toContain("<h2>正文</h2>")
    expect(document).toContain("/uploads/information/original/body.webp")
    expect(document).toContain('img[data-image-state="loading"]')
    expect(document).toContain("image-loading-shimmer")
    expect(document).toContain("background-size: 220% 100%")
    expect(document).toContain("overflow-wrap: anywhere")
    expect(document).toContain(
      "table { display: block; width: 100%; max-width: 100%; overflow-x: auto;"
    )
    expect(document).toContain("pre { max-width: 100%; overflow: auto;")
    expect(document).toContain("img, video { display: block; max-width: 100%;")
    expect(document).toContain("prefers-reduced-motion: reduce")
  })
})
