import { describe, expect, test } from "vitest"

import { namecardPages } from "~/components/shared/namecard-pages"

function page(pageId: string, order: number) {
  return {
    pageId,
    order,
    role: order === 1 ? ("front" as const) : ("back" as const),
    url: `/api/cards/801/media/${pageId}?w=800`,
    previewUrl: `/api/cards/801/media/${pageId}?w=800`,
    thumbUrl: `/api/cards/801/media/${pageId}?w=400`,
    width: 800,
    height: 500,
  }
}

describe("namecardPages", () => {
  test("renders every page from the unified rows", () => {
    const pages = namecardPages({
      pages: [page("page-a", 1), page("page-b", 2)],
    })
    expect(pages.map((entry) => entry.url)).toEqual([
      "/api/cards/801/media/page-a?w=800",
      "/api/cards/801/media/page-b?w=800",
    ])
    expect(pages.map((entry) => entry.thumb)).toEqual([
      "/api/cards/801/media/page-a?w=400",
      "/api/cards/801/media/page-b?w=400",
    ])
  })

  test("labels a single page as the front", () => {
    const pages = namecardPages({ pages: [page("page-a", 1)] })
    expect(pages).toHaveLength(1)
    expect(pages[0]!.url).toBe("/api/cards/801/media/page-a?w=800")
    expect(pages[0]!.thumb).toBe("/api/cards/801/media/page-a?w=400")
    expect(pages[0]!.label).toBe("正面")
  })

  test("has no pages when the card carries none", () => {
    expect(namecardPages({})).toEqual([])
  })
})
