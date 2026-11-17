import { render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import Works from "~/pages/works/index"
import WorkDetailPage from "~/pages/works/work-detail-page"

function renderDetail(workSlug: string) {
  const props = {
    params: { workSlug },
  } as ComponentProps<typeof WorkDetailPage>

  return render(
    <MemoryRouter>
      <WorkDetailPage {...props} />
    </MemoryRouter>
  )
}

describe("Works page", () => {
  it("renders section headers and links", () => {
    render(
      <MemoryRouter>
        <Works />
      </MemoryRouter>
    )

    expect(
      screen.getByRole("heading", { name: "系列主要作品" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "同人作品" })
    ).toBeInTheDocument()

    const storyArchiveLinks = screen.getAllByRole("link", {
      name: "进入剧情站",
    })

    expect(storyArchiveLinks).toHaveLength(6)
    expect(storyArchiveLinks.map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining([
        "/wiki?agency=765PRO",
        "/wiki?agency=%E7%81%B0%E5%A7%91%E5%A8%98%E5%A5%B3%E5%AD%A9",
      ])
    )
    expect(
      screen.getByRole("link", { name: "查看 社区游戏与工具 作品专题" })
    ).toHaveAttribute("href", "/works/games")
    expect(
      screen.getByRole("link", { name: "查看 World of W@rships 作品专题" })
    ).toHaveAttribute("href", "/works/wows")

    expect(document.getElementById("main-content")).toHaveClass(
      "max-w-5xl",
      "px-4",
      "py-12",
      "sm:px-6",
      "sm:py-16",
      "lg:px-8"
    )
  })

  it("keeps the Web work detail height contract", () => {
    renderDetail("765")

    const main = document.getElementById("main-content")
    const surface = screen.getByTestId("work-detail-surface")
    const franchise = screen.getByTestId("work-detail-franchise")

    for (const element of [main, surface, franchise]) {
      expect(element).toHaveClass("min-h-[calc(100svh-4rem)]")
      expect(element).not.toHaveClass("min-h-(--app-content-height)")
    }
  })

  it("renders the missing-work state without a detail height shell", () => {
    renderDetail("missing-work")

    expect(
      screen.getByRole("heading", { name: "没有找到这个作品专题" })
    ).toBeVisible()
    expect(screen.queryByTestId("work-detail-surface")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "返回作品中心" })
    ).toHaveAttribute("href", "/works")
  })
})
