import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import CommunityCardsPage from "~/pages/community/community-cards-page"

const apiMocks = vi.hoisted(() => ({
  getNamecardPage: vi.fn(),
  getNamecardReactions: vi.fn(),
  addNamecardReaction: vi.fn(),
  sendPage: vi.fn(),
  sendReactions: vi.fn(),
  sendAddReaction: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    addNamecardReaction: apiMocks.addNamecardReaction,
    getNamecardReactions: apiMocks.getNamecardReactions,
    getNamecardPage: apiMocks.getNamecardPage,
  }
})

vi.mock("sonner", () => ({
  toast: toastMocks,
}))

describe("CommunityCardsPage", () => {
  beforeEach(() => {
    apiMocks.sendPage.mockResolvedValue({
      list: [],
      page: 1,
      perPage: 12,
      total: 0,
      totalPage: 0,
    })
    apiMocks.sendReactions.mockResolvedValue({})
    apiMocks.sendAddReaction.mockResolvedValue({ ok: true })
    apiMocks.getNamecardPage.mockReturnValue({ send: apiMocks.sendPage })
    apiMocks.getNamecardReactions.mockReturnValue({
      send: apiMocks.sendReactions,
    })
    apiMocks.addNamecardReaction.mockReturnValue({
      send: apiMocks.sendAddReaction,
    })
  })

  it("hides the public card number and formats the submission time", async () => {
    apiMocks.sendPage.mockResolvedValue({
      list: [
        {
          id: 459,
          image1_url: "/uploads/front.webp",
          image2_url: "/uploads/back.webp",
          image1_thumbnail_url: "/uploads/namecard/thumbnail/front.webp.jpg",
          image2_thumbnail_url: "/uploads/namecard/thumbnail/back.webp.jpg",
          status: "approved",
          created_at: "2026-08-06T06:30:00.000Z",
        },
      ],
      page: 1,
      perPage: 12,
      total: 1,
      totalPage: 1,
    })

    render(
      <MemoryRouter>
        <CommunityCardsPage />
      </MemoryRouter>
    )

    const submissionTime = await screen.findByText("提交于 2026年8月6日 14:30")
    expect(submissionTime).toHaveAttribute(
      "datetime",
      "2026-08-06T06:30:00.000Z"
    )
    expect(screen.queryByText("制作人名片 #459")).not.toBeInTheDocument()
  })

  it("opens the complete reaction picker and updates the selected count", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue({
      list: [
        {
          id: 42,
          image1_url: "/uploads/front.webp",
          image2_url: "/uploads/back.webp",
          image1_thumbnail_url: "/uploads/namecard/thumbnail/front.webp.jpg",
          image2_thumbnail_url: "/uploads/namecard/thumbnail/back.webp.jpg",
          status: "approved",
          created_at: null,
        },
      ],
      page: 1,
      perPage: 12,
      total: 1,
      totalPage: 1,
    })
    apiMocks.sendReactions.mockResolvedValue({ "❤️": 4, "🐵": 2 })

    render(
      <MemoryRouter>
        <CommunityCardsPage />
      </MemoryRouter>
    )

    expect(
      await screen.findByRole("button", { name: "❤️，4 次反应" })
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "🐵，2 次反应" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "添加反应" }))

    expect(screen.getByText("选择反应")).toBeVisible()
    expect(screen.getAllByRole("button", { name: /，添加反应$/ })).toHaveLength(
      46
    )

    await user.click(screen.getByRole("button", { name: "🧒，添加反应" }))

    await waitFor(() => {
      expect(apiMocks.addNamecardReaction).toHaveBeenCalledWith(42, "🧒")
      expect(apiMocks.sendAddReaction).toHaveBeenCalledOnce()
      expect(screen.getByRole("button", { name: "🧒，1 次反应" })).toBeVisible()
    })

    for (let nextCount = 2; nextCount <= 10; nextCount += 1) {
      await user.click(
        screen.getByRole("button", {
          name: `🧒，${nextCount - 1} 次反应`,
        })
      )
      expect(
        await screen.findByRole("button", {
          name: `🧒，${nextCount} 次反应`,
        })
      ).toBeVisible()
    }

    expect(apiMocks.sendAddReaction).toHaveBeenCalledTimes(10)
    await user.click(screen.getByRole("button", { name: "🧒，10 次反应" }))
    expect(toastMocks.error).toHaveBeenCalledWith("这个反应点得太多了")
    expect(apiMocks.sendAddReaction).toHaveBeenCalledTimes(10)
  })

  it("opens both namecard sides in one preview dialog", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue({
      list: [
        {
          id: 42,
          image1_url: "/uploads/front.webp",
          image2_url: "/uploads/back.webp",
          image1_thumbnail_url: "/uploads/namecard/thumbnail/front.webp.jpg",
          image2_thumbnail_url: "/uploads/namecard/thumbnail/back.webp.jpg",
          status: "approved",
          created_at: null,
        },
      ],
      page: 1,
      perPage: 12,
      total: 1,
      totalPage: 1,
    })

    render(
      <MemoryRouter>
        <CommunityCardsPage />
      </MemoryRouter>
    )

    const frontTrigger = await screen.findByRole("button", {
      name: "查看制作人名片 42 正面",
    })
    expect(frontTrigger.querySelector("img")).toHaveAttribute(
      "src",
      "/uploads/namecard/thumbnail/front.webp.jpg"
    )

    await user.click(frontTrigger)

    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeVisible()
    expect(
      screen.getByRole("img", { name: "制作人名片 42 正面" })
    ).toHaveAttribute("src", "/uploads/front.webp")
    expect(screen.getByLabelText("名片查看区域")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "背面" }))

    expect(
      screen.getByRole("img", { name: "制作人名片 42 背面" })
    ).toBeVisible()
    expect(screen.getAllByRole("dialog")).toHaveLength(1)

    fireEvent.keyDown(dialog, { key: "ArrowLeft" })
    expect(
      screen.getByRole("img", { name: "制作人名片 42 正面" })
    ).toBeVisible()
  })

  it("reads page and size from the URL", async () => {
    render(
      <MemoryRouter initialEntries={["/community/cards?page=3&size=24"]}>
        <CommunityCardsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(apiMocks.getNamecardPage).toHaveBeenCalledWith(3, 24)
    })
  })

  it("jumps to a specified page", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue({
      list: [
        {
          id: 42,
          image1_url: "/uploads/front.webp",
          image2_url: "/uploads/back.webp",
          image1_thumbnail_url: "/uploads/namecard/thumbnail/front.webp.jpg",
          image2_thumbnail_url: "/uploads/namecard/thumbnail/back.webp.jpg",
          status: "approved",
          created_at: null,
        },
      ],
      total: 80,
      totalPage: 7,
    })

    render(
      <MemoryRouter>
        <CommunityCardsPage />
      </MemoryRouter>
    )

    await screen.findByRole("combobox", { name: "每页显示" })
    expect(apiMocks.getNamecardPage).toHaveBeenCalledWith(1, 12)

    await user.clear(screen.getByRole("spinbutton", { name: "跳至" }))
    await user.type(screen.getByRole("spinbutton", { name: "跳至" }), "3")
    await user.click(screen.getByRole("button", { name: "跳转" }))

    await waitFor(() => {
      expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(3, 12)
    })
    expect(screen.getByText("第 3 / 7 页，共 80 张")).toBeVisible()

    apiMocks.getNamecardPage.mockClear()
    await user.clear(screen.getByRole("spinbutton", { name: "跳至" }))
    await user.type(screen.getByRole("spinbutton", { name: "跳至" }), "8")
    await user.click(screen.getByRole("button", { name: "跳转" }))

    expect(toastMocks.error).toHaveBeenCalledWith("请输入 1 到 7 之间的页码")
    expect(apiMocks.getNamecardPage).not.toHaveBeenCalled()
  })
})
