import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { NamecardWallCarousel } from "~/components/community/namecard-wall-carousel"
import { makeCardPage } from "@/mocks/data/namecards"

const FRONT = makeCardPage({ role: "front", order: 1, url: "/front.webp" })
const MIDDLE = makeCardPage({ role: "middle", order: 2, url: "/middle.webp" })
const BACK = makeCardPage({ role: "back", order: 3, url: "/back.webp" })

describe("NamecardWallCarousel", () => {
  it("only renders the front and back pages, never the middle ones", () => {
    const { container } = render(
      <NamecardWallCarousel
        pages={[FRONT, MIDDLE, BACK]}
        cardNumber={42}
        pageCount={3}
        onOpen={vi.fn()}
      />
    )

    expect(
      screen.getByRole("button", { name: "查看制作人名片 42 正面" })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "查看制作人名片 42 背面" })
    ).toBeVisible()
    expect(screen.queryByLabelText(/中间/)).toBeNull()
    // 首尾克隆各一份，所以图片是 4 张；可访问的真实页仍是正/背两张。
    expect(
      container.querySelectorAll('[data-wall-slide]:not([aria-hidden="true"])')
    ).toHaveLength(2)
    expect(container.querySelectorAll('img[src*="middle"]')).toHaveLength(0)
  })

  it("shows the multi-page badge only when there are middle pages", () => {
    const { rerender } = render(
      <NamecardWallCarousel
        pages={[FRONT, MIDDLE, BACK]}
        cardNumber={42}
        pageCount={3}
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByTitle("共 3 页")).toHaveTextContent("3")

    rerender(
      <NamecardWallCarousel
        pages={[FRONT, BACK]}
        cardNumber={42}
        pageCount={2}
        onOpen={vi.fn()}
      />
    )
    expect(screen.queryByTitle("共 2 页")).toBeNull()
  })

  it("puts a dot per side inside the container and opens the clicked side", async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(
      <NamecardWallCarousel
        pages={[FRONT, BACK]}
        cardNumber={42}
        pageCount={2}
        onOpen={onOpen}
      />
    )

    expect(screen.getByRole("button", { name: "查看正面" })).toBeVisible()
    expect(screen.getByRole("button", { name: "查看背面" })).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "查看制作人名片 42 背面" })
    )
    expect(onOpen).toHaveBeenCalledWith("back")
  })

  it("keeps a single-sided card free of dots and badges", () => {
    render(
      <NamecardWallCarousel
        pages={[FRONT]}
        cardNumber={42}
        onOpen={vi.fn()}
      />
    )

    expect(screen.queryByRole("button", { name: "查看背面" })).toBeNull()
    expect(screen.queryByTitle("共 1 页")).toBeNull()
    expect(
      screen.getByRole("button", { name: "查看制作人名片 42 正面" })
    ).toBeVisible()
  })
})
