import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RecommendationDraftPreview } from "~/pages/admin/recommendations/components/recommendation-draft-preview"

describe("RecommendationDraftPreview", () => {
  const createObjectUrl = vi.fn(() => "blob:recommendation-cover")
  const revokeObjectUrl = vi.fn()

  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    })
  })

  afterEach(() => {
    createObjectUrl.mockClear()
    revokeObjectUrl.mockClear()
  })

  it("updates the title, destination, and selected cover in real time", async () => {
    const cover = new File([new Uint8Array(128)], "live-cover.png", {
      type: "image/png",
    })
    const { rerender } = render(
      <RecommendationDraftPreview title="" url="" image={null} />
    )

    expect(screen.getByText("推荐标题将在这里显示")).toBeVisible()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.queryByAltText("所选封面预览")).not.toBeInTheDocument()

    rerender(
      <RecommendationDraftPreview
        title="剧场新活动"
        url="https://example.com/live"
        image={cover}
      />
    )

    expect(screen.getByText("剧场新活动")).toBeVisible()
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://example.com/live"
    )
    expect(screen.getByRole("link")).toHaveAttribute("target", "_blank")
    expect(await screen.findByAltText("所选封面预览")).toHaveAttribute(
      "src",
      "blob:recommendation-cover"
    )
    expect(createObjectUrl).toHaveBeenCalledWith(cover)
  })

  it("disables unsafe destinations and releases replaced image previews", async () => {
    const firstCover = new File(["first"], "first.png", {
      type: "image/png",
    })
    const secondCover = new File(["second"], "second.png", {
      type: "image/png",
    })
    createObjectUrl
      .mockReturnValueOnce("blob:first-cover")
      .mockReturnValueOnce("blob:second-cover")

    const { rerender, unmount } = render(
      <RecommendationDraftPreview
        title="推荐"
        url="javascript:alert(1)"
        image={firstCover}
      />
    )

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(await screen.findByAltText("所选封面预览")).toHaveAttribute(
      "src",
      "blob:first-cover"
    )

    rerender(
      <RecommendationDraftPreview
        title="推荐"
        url="https://example.com/next"
        image={secondCover}
      />
    )

    await waitFor(() =>
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:first-cover")
    )
    expect(await screen.findByAltText("所选封面预览")).toHaveAttribute(
      "src",
      "blob:second-cover"
    )

    unmount()
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:second-cover")
  })

  it("shows a parsed Bilibili cover until a local cover is selected", () => {
    const cover = new File(["local"], "local.png", { type: "image/png" })
    const { rerender } = render(
      <RecommendationDraftPreview
        title="B站推荐"
        url="https://www.bilibili.com/video/BV1xx411c7mD"
        image={null}
        remoteImageUrl="https://i0.hdslb.com/bfs/archive/cover.jpg"
      />
    )

    expect(screen.getByAltText("B站封面预览")).toHaveAttribute(
      "src",
      "https://i0.hdslb.com/bfs/archive/cover.jpg"
    )
    expect(screen.getByAltText("B站封面预览")).toHaveAttribute(
      "referrerpolicy",
      "no-referrer"
    )

    rerender(
      <RecommendationDraftPreview
        title="B站推荐"
        url="https://www.bilibili.com/video/BV1xx411c7mD"
        image={cover}
        remoteImageUrl="https://i0.hdslb.com/bfs/archive/cover.jpg"
      />
    )
    expect(screen.getByAltText("所选封面预览")).toHaveAttribute(
      "src",
      "blob:recommendation-cover"
    )
  })
})
