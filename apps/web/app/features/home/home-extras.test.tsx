import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { HomeExtras } from "./home-extras"

describe("HomeExtras", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders every migrated static home entry", () => {
    render(<HomeExtras />)

    expect(
      screen.getByRole("region", { name: "活动资讯与同人活动" })
    ).toBeVisible()
    expect(screen.getByRole("link", { name: /篠泽广研讨会/ })).toHaveAttribute(
      "href",
      "/hiro2026.html"
    )
    expect(
      screen.getByRole("link", { name: /湖南偶像大师 ONLY/ })
    ).toBeVisible()
    expect(screen.getAllByRole("link", { name: /雨云|云计算/ })).toHaveLength(3)
  })

  it("selects an idol from the migrated birthday dataset", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    const user = userEvent.setup()
    render(<HomeExtras />)

    await user.click(screen.getByRole("button", { name: "随机选择" }))

    expect(screen.getByRole("link", { name: "天海春香" })).toHaveAttribute(
      "href",
      "/wiki/story?agency=765PRO&idol=%E5%A4%A9%E6%B5%B7%E6%98%A5%E9%A6%99"
    )
  })
})
