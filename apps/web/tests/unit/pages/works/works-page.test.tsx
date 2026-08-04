import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import Works from "~/pages/works/works-page"

describe("Works page", () => {
  it("links franchises to project pages and preserves community topics", () => {
    render(
      <MemoryRouter>
        <Works />
      </MemoryRouter>
    )

    const storyArchiveLinks = screen.getAllByRole("link", {
      name: "进入剧情站",
    })

    expect(storyArchiveLinks).toHaveLength(6)
    expect(storyArchiveLinks.map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining([
        "/wiki/modern?agency=765PRO",
        "/wiki/modern?agency=%E7%81%B0%E5%A7%91%E5%A8%98%E5%A5%B3%E5%AD%A9",
      ])
    )
    expect(
      screen.getByRole("link", { name: "查看 社区游戏与工具 作品专题" })
    ).toHaveAttribute("href", "/works/games")
    expect(
      screen.getByRole("link", { name: "查看 World of W@rships 作品专题" })
    ).toHaveAttribute("href", "/works/wows")
  })
})
