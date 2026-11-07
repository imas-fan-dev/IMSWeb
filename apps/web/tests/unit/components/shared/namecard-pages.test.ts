import { describe, expect, test } from "vitest"

import { namecardPages } from "~/components/shared/namecard-pages"

const legacy = {
  image1_url: "/api/cards/801/media/front",
  middleImageUrls: [],
  image2_url: "/api/cards/801/media/back",
  image1_thumbnail_url: "/api/cards/801/media/front?thumb=1",
  image2_thumbnail_url: "/api/cards/801/media/back?thumb=1",
}

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
  test("uses the unified pages when the set is complete", () => {
    const pages = namecardPages({
      ...legacy,
      pages: [page("page-a", 1), page("page-b", 2)],
    })
    expect(pages.map((entry) => entry.thumb)).toEqual([
      "/api/cards/801/media/page-a?w=400",
      "/api/cards/801/media/page-b?w=400",
    ])
  })

  test("falls back to legacy artwork when only some pages are migrated", () => {
    const pages = namecardPages({ ...legacy, pages: [page("page-a", 1)] })
    expect(pages).toHaveLength(2)
    expect(pages[0]!.url).toBe(legacy.image1_url)
    expect(pages[1]!.url).toBe(legacy.image2_url)
  })
})
