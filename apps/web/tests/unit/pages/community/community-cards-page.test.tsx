import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { NamecardPage } from "~/lib/api"
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

const sessionMocks = vi.hoisted(() => ({
  useOptionalPlatformSession: vi.fn(),
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

vi.mock("~/components/platform/platform-session-provider", () => ({
  useOptionalPlatformSession: sessionMocks.useOptionalPlatformSession,
}))

function pageResult(ids = [42]): NamecardPage {
  return {
    list: ids.map((id) => ({
      id,
      seriesCode: null,
      favoriteIdols: [],
      claimStatus: "unclaimed",
      viewerClaimState: null,
      claimerName: null,
      image1_url: `/front-${id}.jpg`,
      image2_url: `/back-${id}.jpg`,
      image1_thumbnail_url: `/front-${id}-thumbnail.jpg`,
      image2_thumbnail_url: `/back-${id}-thumbnail.jpg`,
      created_at: "2026-08-06T06:30:00.000Z",
    })),
    total: 80,
    totalPage: 7,
  }
}

function deferredPage() {
  let resolve!: (value: NamecardPage) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<NamecardPage>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function ListLocation() {
  return <div aria-label="列表地址">{useLocation().search}</div>
}

function renderPage(entry = "/community/cards?page=1&size=12") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CommunityCardsPage />
      <ListLocation />
    </MemoryRouter>
  )
}

describe("CommunityCardsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    sessionMocks.useOptionalPlatformSession.mockReturnValue({
      status: "anonymous",
      session: null,
      error: null,
      acceptSession: vi.fn(),
      reload: vi.fn(),
      logout: vi.fn(),
    })
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
          seriesCode: null,
          favoriteIdols: [],
          claimStatus: "unclaimed",
          viewerClaimState: null,
          claimerName: null,
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

    const submissionTime = await screen.findByText("08-06 14:30")
    expect(submissionTime).toHaveAttribute(
      "datetime",
      "2026-08-06T06:30:00.000Z"
    )
    expect(submissionTime).toHaveAttribute(
      "title",
      "提交于 2026年8月6日 14:30:00（北京时间）"
    )
    expect(submissionTime).toHaveAccessibleName(
      "提交于 2026年8月6日 14:30:00（北京时间）"
    )
    expect(submissionTime.parentElement).toHaveClass("whitespace-nowrap")
    expect(screen.queryByText(/提交于/)).not.toBeInTheDocument()
    expect(screen.queryByText("制作人名片 #459")).not.toBeInTheDocument()
  })

  it.each([
    [
      "2026-08-06T15:59:59.000Z",
      "08-06 23:59",
      "提交于 2026年8月6日 23:59:59（北京时间）",
    ],
    [
      "2026-08-06T16:00:00.000Z",
      "08-07 00:00",
      "提交于 2026年8月7日 00:00:00（北京时间）",
    ],
    [
      "2026-12-31T23:30:00.000Z",
      "01-01 07:30",
      "提交于 2027年1月1日 07:30:00（北京时间）",
    ],
    [
      "2026-08-06T23:30:00-07:00",
      "08-07 14:30",
      "提交于 2026年8月7日 14:30:00（北京时间）",
    ],
  ])(
    "uses the Shanghai date and minute for %s",
    async (value, label, description) => {
      const result = pageResult()
      result.list[0].created_at = value
      apiMocks.sendPage.mockResolvedValue(result)
      renderPage()

      const timestamp = await screen.findByText(label)
      expect(timestamp).toHaveAttribute(
        "datetime",
        new Date(value).toISOString()
      )
      expect(timestamp).toHaveAttribute("title", description)
      expect(timestamp).toHaveAccessibleName(description)
      expect(timestamp.textContent).toBe(label)
    }
  )

  it.each([null, "", "not-a-date"])(
    "shows a compact hint for missing or invalid date %j",
    async (value) => {
      const result = pageResult()
      result.list[0].created_at = value
      apiMocks.sendPage.mockResolvedValue(result)
      const { container } = renderPage()

      expect(await screen.findByText("日期待补")).toHaveAttribute(
        "title",
        "提交时间缺失或无效"
      )
      expect(container.querySelector("time")).not.toBeInTheDocument()
      expect(screen.queryByText("提交时间待补充")).not.toBeInTheDocument()
    }
  )

  it("shows the legacy-card claim action only for authenticated users", async () => {
    apiMocks.sendPage.mockResolvedValue({
      list: [
        {
          id: 42,
          seriesCode: "765",
          favoriteIdols: [{ id: 1, name: "天海春香", seriesCode: "765" }],
          claimStatus: "unclaimed",
          viewerClaimState: null,
          claimerName: null,
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

    const { rerender } = render(
      <MemoryRouter>
        <CommunityCardsPage />
      </MemoryRouter>
    )

    await screen.findByRole("button", { name: "查看制作人名片 42 正面" })
    expect(
      screen.queryByRole("button", { name: "认领这张名片" })
    ).not.toBeInTheDocument()

    sessionMocks.useOptionalPlatformSession.mockReturnValue({
      status: "authenticated",
      session: {
        success: true,
        account: { id: "platform-1", status: "active" },
        profile: {
          displayName: "春香P",
          avatarUrl: null,
          homeCity: null,
          bio: "",
        },
      },
      error: null,
      acceptSession: vi.fn(),
      reload: vi.fn(),
      logout: vi.fn(),
    })
    rerender(
      <MemoryRouter>
        <CommunityCardsPage />
      </MemoryRouter>
    )

    const frontTrigger = await screen.findByRole("button", {
      name: "查看制作人名片 42 正面",
    })
    expect(
      screen.queryByRole("button", { name: "认领这张名片" })
    ).not.toBeInTheDocument()
    await userEvent.setup().click(frontTrigger)
    const detail = screen.getByRole("dialog", { name: "制作人名片 42" })
    const claimButton = within(detail).getByRole("button", {
      name: "认领这张名片",
    })
    expect(claimButton).toBeVisible()
    expect(claimButton).toHaveClass("min-h-11")
  })

  it("opens the complete reaction picker and updates the selected count", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue({
      list: [
        {
          id: 42,
          seriesCode: null,
          favoriteIdols: [],
          claimStatus: "unclaimed",
          viewerClaimState: null,
          claimerName: null,
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

    const reaction = (
      await screen.findAllByRole("button", { name: "❤️，4 次反应" })
    )[0]!
    expect(reaction).toBeVisible()
    expect(
      screen.getAllByRole("button", { name: "🐵，2 次反应" })[0]
    ).toBeVisible()
    expect(reaction).toHaveTextContent(/^4$/)
    expect(reaction.querySelector("img")).toHaveAttribute(
      "src",
      "/emoji/twemoji/2764.svg"
    )
    expect(reaction).toHaveClass(
      "h-8",
      "min-h-8",
      "min-w-8",
      "gap-0.5",
      "rounded-full",
      "px-1",
      "text-[11px]",
      "md:min-w-0"
    )
    expect(reaction.querySelector("img")).toHaveClass("size-3.5", "md:size-5")

    expect(
      screen.queryByRole("button", { name: "添加反应" })
    ).not.toBeInTheDocument()
    await user.click(
      screen.getAllByRole("button", { name: "❤️，4 次反应" })[0]!
    )
    const detail = screen.getByRole("dialog", { name: "制作人名片 42" })
    const reactionGroup = within(detail).getByLabelText("名片全部反应")
    const addButton = within(detail).getByRole("button", {
      name: "添加反应",
    })
    expect(reactionGroup).toBeVisible()
    expect(reactionGroup.lastElementChild).toBe(addButton)
    expect(addButton).toHaveAttribute("title", "添加反应")
    expect(addButton).toHaveClass("size-11", "rounded-full")
    const visibleCircle = addButton.querySelector("span")
    expect(visibleCircle).toHaveClass("size-8", "rounded-full", "border-dashed")
    expect(addButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true"
    )
    expect(addButton).toHaveTextContent("")
    await user.click(addButton)

    expect(screen.getByText("选择反应")).toBeVisible()
    expect(
      screen.getByText("选择反应").closest('[data-slot="popover-content"]')
    ).toHaveStyle({ animation: "none" })
    const choices = screen.getAllByRole("button", { name: /，添加反应$/ })
    expect(choices).toHaveLength(46)
    for (const choice of choices) {
      expect(choice.textContent).toBe("")
      expect(choice).toHaveClass("size-11")
      expect(choice.querySelector("img")).toHaveClass("size-5", "shrink-0")
      expect(choice.querySelector("img")).not.toHaveClass("size-4", "md:size-5")
      expect(choice.querySelector("img")).toHaveAttribute("width", "20")
      expect(choice.querySelector("img")).toHaveAttribute("height", "20")
      expect(choice.querySelector("img")?.getAttribute("src")).toMatch(
        /^\/emoji\/twemoji\/[a-f0-9-]+\.svg$/
      )
    }
    const heartChoice = screen.getByRole("button", { name: "❤️，添加反应" })
    expect(heartChoice.querySelector("img")).toHaveAttribute(
      "src",
      reaction.querySelector("img")!.getAttribute("src")
    )
    fireEvent.error(heartChoice.querySelector("img")!)
    expect(heartChoice.querySelector("img")).not.toBeInTheDocument()
    expect(heartChoice.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true"
    )
    expect(heartChoice.textContent).toBe("")
    expect(heartChoice.querySelector("svg")).toHaveClass("size-5")
    expect(heartChoice.querySelector("svg")).not.toHaveClass(
      "size-4",
      "md:size-5"
    )
    expect(heartChoice).toHaveAccessibleName("❤️，添加反应")

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

  it("preserves counts read during a pending reaction mutation", async () => {
    let resolveReactions!: (value: Record<string, number>) => void
    let resolveMutation!: (value: { ok: true }) => void
    apiMocks.sendPage.mockResolvedValue(pageResult())
    apiMocks.sendReactions.mockReturnValue(
      new Promise<Record<string, number>>((resolve) => {
        resolveReactions = resolve
      })
    )
    apiMocks.sendAddReaction.mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        resolveMutation = resolve
      })
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole("button", { name: "查看制作人名片 42 正面" })
    )
    const detail = screen.getByRole("dialog", { name: "制作人名片 42" })
    await user.click(within(detail).getByRole("button", { name: "添加反应" }))
    await user.click(screen.getByRole("button", { name: "❤️，添加反应" }))
    expect(
      within(detail).getByRole("button", { name: "添加反应" })
    ).toBeDisabled()
    await act(async () => resolveReactions({ "👍": 4, "😂": 2 }))
    await act(async () => resolveMutation({ ok: true }))

    expect(
      within(detail).getByRole("button", { name: "👍，4 次反应" })
    ).toBeVisible()
    expect(
      within(detail).getByRole("button", { name: "😂，2 次反应" })
    ).toBeVisible()
    expect(
      within(detail).getByRole("button", { name: "❤️，1 次反应" })
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "👍，4 次反应" })).toBeVisible()
    expect(screen.getByRole("button", { name: "😂，2 次反应" })).toBeVisible()
    expect(screen.getByRole("button", { name: "❤️，1 次反应" })).toBeVisible()
  })

  it("merges an older reaction read with a successful mutation", async () => {
    let resolveReactions!: (value: Record<string, number>) => void
    apiMocks.sendPage.mockResolvedValue(pageResult())
    apiMocks.sendReactions.mockReturnValue(
      new Promise<Record<string, number>>((resolve) => {
        resolveReactions = resolve
      })
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole("button", { name: "查看制作人名片 42 正面" })
    )
    const detail = screen.getByRole("dialog", { name: "制作人名片 42" })
    await user.click(within(detail).getByRole("button", { name: "添加反应" }))
    await user.click(screen.getByRole("button", { name: "❤️，添加反应" }))
    expect(
      await within(detail).findByRole("button", { name: "❤️，1 次反应" })
    ).toBeVisible()

    await act(async () => resolveReactions({ "👍": 4, "😂": 2, "❤️": 0 }))

    expect(apiMocks.sendReactions).toHaveBeenCalledOnce()
    expect(
      within(detail).getByRole("button", { name: "❤️，1 次反应" })
    ).toBeVisible()
    expect(
      within(detail).getByRole("button", { name: "👍，4 次反应" })
    ).toBeVisible()
    expect(
      within(detail).getByRole("button", { name: "😂，2 次反应" })
    ).toBeVisible()
  })

  it("sorts the mobile top three stably and exposes all desktop summaries", async () => {
    apiMocks.sendPage.mockResolvedValue(pageResult())
    apiMocks.sendReactions.mockResolvedValue({
      "❤️": 12,
      "👍": 56,
      "😂": 34,
      "🤣": 56,
    })
    renderPage()

    const group = await screen.findByLabelText("名片反应摘要")
    await within(group).findAllByRole("button", { name: "🤣，56 次反应" })
    expect(group).toHaveClass(
      "flex",
      "flex-wrap",
      "min-h-8",
      "gap-0.75",
      "md:gap-1.5"
    )
    expect(group).not.toHaveClass("-mx-2", "md:mx-0")
    const chips = within(group).getAllByRole("button", { name: /次反应$/ })
    const mobileChips = chips.filter((chip) =>
      chip.classList.contains("md:hidden")
    )
    const desktopChips = chips.filter((chip) =>
      chip.classList.contains("max-md:hidden")
    )
    expect(mobileChips.map((chip) => chip.textContent)).toEqual([
      "56",
      "56",
      "34",
    ])
    expect(desktopChips.map((chip) => chip.textContent)).toEqual([
      "12",
      "56",
      "34",
      "56",
    ])
    for (const chip of chips) {
      expect(chip).toHaveClass(
        "h-8",
        "min-h-8",
        "min-w-8",
        "shrink-0",
        "gap-0.5",
        "rounded-full",
        "border-border",
        "bg-background",
        "px-1",
        "text-[11px]",
        "tabular-nums",
        "max-md:focus-visible:ring-inset",
        "md:min-w-0",
        "md:gap-1.5",
        "md:px-3",
        "md:text-sm"
      )
      expect(chip).not.toHaveClass(
        "min-h-11",
        "h-9",
        "w-11",
        "w-1/4",
        "basis-1/4",
        "truncate"
      )
      expect(chip).toHaveClass("max-w-14", "md:max-w-none", "grow")
      expect(chip.querySelector("img")).toHaveClass("size-3.5", "md:size-5")
    }
    expect(
      within(group).queryByRole("button", { name: "添加反应" })
    ).not.toBeInTheDocument()
  })

  it("opens detail from the list and then previews both sides", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue({
      list: [
        {
          id: 42,
          seriesCode: null,
          favoriteIdols: [],
          claimStatus: "unclaimed",
          viewerClaimState: null,
          claimerName: null,
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

    const detail = screen.getByRole("dialog", { name: "制作人名片 42" })
    expect(detail).toBeVisible()
    expect(within(detail).getByText("企划")).toBeVisible()
    expect(
      within(detail).queryByRole("button", { name: /[上下]一张名片/ })
    ).not.toBeInTheDocument()
    expect(
      within(detail).queryByText(/第 \d+ \/ \d+ 张/)
    ).not.toBeInTheDocument()
    await user.click(
      within(detail).getByRole("button", {
        name: "放大制作人名片 42 正面",
      })
    )
    const preview = screen.getByRole("dialog", {
      name: "制作人名片 42 · 正面",
    })
    expect(
      within(preview).getByRole("img", { name: "制作人名片 42 正面" })
    ).toHaveAttribute("src", "/uploads/front.webp")
    expect(screen.getByLabelText("名片查看区域")).toBeVisible()
    expect(
      within(preview).queryByRole("button", { name: /[上下]一张名片/ })
    ).not.toBeInTheDocument()
    expect(
      within(preview).queryByText(/第 \d+ \/ \d+ 张/)
    ).not.toBeInTheDocument()

    await user.click(within(preview).getByRole("button", { name: "背面" }))

    expect(
      screen.getByRole("img", { name: "制作人名片 42 背面" })
    ).toBeVisible()
    expect(screen.getAllByRole("dialog")).toHaveLength(1)

    fireEvent.keyDown(preview, { key: "ArrowLeft" })
    expect(
      screen.getByRole("img", { name: "制作人名片 42 正面" })
    ).toBeVisible()
  })

  it("groups each namecard in one visible Card with both faces in API order and guarded masonry", async () => {
    const result = pageResult([42, 43, 44, 45])
    result.list[0].claimStatus = "claimed"
    result.list[0].claimerName = "风晓星落P"
    result.list[1].claimStatus = "pending"
    result.list[3].claimStatus = "claimed"
    apiMocks.sendPage.mockResolvedValue(result)
    renderPage()

    await screen.findByRole("button", { name: "查看制作人名片 42 正面" })
    const list = screen.getByRole("region", { name: "公开名片" })
    const gallery = list.querySelector("[data-namecard-gallery]")
    expect(gallery).toHaveClass(
      "grid",
      "grid-cols-2",
      "gap-x-2",
      "gap-y-3",
      "md:gap-4",
      "max-md:data-[masonry=ready]:grid-rows-(--namecard-rows)",
      "max-md:data-[masonry=ready]:gap-y-0"
    )
    expect(gallery).not.toHaveClass(
      "pb-6",
      "max-md:data-[masonry=ready]:auto-rows-[1px]",
      "max-md:data-[masonry=ready]:grid-flow-row-dense"
    )
    const items = Array.from(
      list.querySelectorAll<HTMLElement>("[data-namecard-item]")
    )
    expect(items).toHaveLength(4)
    expect(
      within(list)
        .getAllByRole("button", { name: /^查看制作人名片/ })
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(
      [42, 43, 44, 45].flatMap((id) => [
        `查看制作人名片 ${id} 正面`,
        `查看制作人名片 ${id} 背面`,
      ])
    )
    for (const item of items) {
      expect(item).toHaveAttribute("data-slot", "card")
      expect(item).toHaveClass(
        "ring-1",
        "ring-foreground/10",
        "bg-card",
        "rounded-lg",
        "overflow-hidden",
        "self-start",
        "md:h-full",
        "md:gap-0",
        "md:self-stretch",
        "md:bg-muted/50",
        "max-md:group-data-[masonry=ready]/namecards:row-start-(--namecard-start)",
        "max-md:group-data-[masonry=ready]/namecards:row-end-(--namecard-end)",
        "max-md:group-data-[masonry=ready]/namecards:col-start-(--namecard-column)",
        "md:rounded-xl"
      )
      expect(item).not.toHaveClass(
        "h-full",
        "nth-[2n+4]:translate-y-6",
        "ring-0",
        "bg-transparent",
        "md:gap-4",
        "md:grid"
      )
      expect(item.querySelectorAll('[data-slot="card"]')).toHaveLength(0)
      expect(item.querySelector("time")?.closest('[data-slot="card"]')).toBe(
        item
      )
      expect(
        within(item)
          .getByLabelText("名片反应摘要")
          .closest('[data-slot="card"]')
      ).toBe(item)
      const header = item.querySelector('[data-slot="card-header"]')!
      expect(header).toHaveClass(
        "flex",
        "flex-wrap",
        "items-center",
        "gap-x-2",
        "gap-y-1",
        "px-1.5",
        "md:min-h-8",
        "md:px-4"
      )
      expect(header.querySelector("svg")).toHaveClass("max-md:hidden")
      const faces = within(item).getAllByRole("button", {
        name: /^查看制作人名片/,
      })
      expect(faces).toHaveLength(2)
      expect(faces[0].parentElement).toHaveClass(
        "grid",
        "gap-1",
        "md:mb-4",
        "md:grid-cols-2",
        "md:border-b",
        "md:bg-border"
      )
      for (const face of faces) {
        expect(face).not.toHaveClass("hidden")
        expect(face).toHaveClass("aspect-3/2", "min-h-11", "rounded-none")
        expect(face).not.toHaveClass("rounded-md")
        expect(face.closest('[data-slot="card"]')).toBe(item)
        expect(face.querySelector("img")).toHaveClass("object-contain")
      }
      const footer = item.querySelector("[data-slot=card-footer]")!
      expect(footer).toHaveClass(
        "bg-transparent",
        "border-0",
        "p-1.5",
        "md:px-4",
        "md:pt-3",
        "md:pb-4"
      )
      expect(within(item).getByLabelText("名片反应摘要").parentElement).toBe(
        footer
      )
    }
    expect(screen.getByText("风晓星落P").closest('[data-slot="card"]')).toBe(
      items[0]
    )
    expect(screen.queryByText("已由 风晓星落P 认领")).not.toBeInTheDocument()
    const claimedBadge = screen
      .getByText("风晓星落P")
      .closest('[data-slot="badge"]')!
    const claimPlacement = [
      "ml-auto",
      "h-auto",
      "min-h-5",
      "max-w-full",
      "whitespace-normal",
      "border-border",
      "md:h-6",
      "md:px-2.5",
      "md:whitespace-nowrap",
    ]
    expect(claimedBadge).toHaveClass(
      ...claimPlacement,
      "md:text-muted-foreground"
    )
    expect(claimedBadge).not.toHaveClass("bg-secondary")
    // The claim control shares the metadata row on mobile and desktop alike.
    expect(claimedBadge.closest('[data-slot="card-header"]')).toBe(
      items[0].querySelector('[data-slot="card-header"]')
    )
    expect(
      screen.getByText("已由注册用户认领").closest('[data-slot="card"]')
    ).toBe(items[3])
    expect(
      screen.getByText("认领审核中").closest('[data-slot="badge"]')!
    ).toHaveClass(...claimPlacement)
    expect(
      screen.queryByRole("group", { name: "名片显示面" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "正面" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "背面" })
    ).not.toBeInTheDocument()
  })

  it.each([
    { label: "正面", source: "/front-42.jpg" },
    { label: "背面", source: "/back-42.jpg" },
  ])(
    "opens the $label list trigger in detail before the original-image preview",
    async ({ label, source }) => {
      const user = userEvent.setup()
      apiMocks.sendPage.mockResolvedValue(pageResult())
      renderPage()

      await user.click(
        await screen.findByRole("button", {
          name: `查看制作人名片 42 ${label}`,
        })
      )

      const detail = screen.getByRole("dialog", { name: "制作人名片 42" })
      expect(within(detail).getByText("全部反应")).toBeVisible()
      await user.click(
        within(detail).getByRole("button", {
          name: `放大制作人名片 42 ${label}`,
        })
      )
      const preview = screen.getByRole("dialog", {
        name: `制作人名片 42 · ${label}`,
      })
      expect(
        within(preview).getByRole("img", { name: `制作人名片 42 ${label}` })
      ).toHaveAttribute("src", source)
      expect(
        within(preview).getByRole("button", { name: label })
      ).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByLabelText("列表地址")).toHaveTextContent(
        "?page=1&size=12"
      )
    }
  )

  it("shows loading, request failure, retry loading, and recovered cards", async () => {
    const user = userEvent.setup()
    const first = deferredPage()
    const retry = deferredPage()
    apiMocks.sendPage
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(retry.promise)
    renderPage()

    const list = screen.getByRole("region", { name: "公开名片" })
    expect(list).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("status")).toHaveTextContent("正在读取名片墙")
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    await act(async () => first.reject(new Error("offline")))

    expect(list).toHaveAttribute("aria-busy", "false")
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法读取名片墙")
    await user.click(screen.getByRole("button", { name: "重试读取名片墙" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("正在读取名片墙")
    expect(list).toHaveAttribute("aria-busy", "true")
    expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(1, 12)
    await act(async () => retry.resolve(pageResult()))

    expect(list).toHaveAttribute("aria-busy", "false")
    expect(screen.queryByText("正在读取名片墙…")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "查看制作人名片 42 背面" })
    ).toBeVisible()
    expect(apiMocks.sendPage).toHaveBeenCalledTimes(2)
  })

  it("shows the empty state without pagination or image triggers", async () => {
    renderPage()

    expect(await screen.findByText("还没有公开名片")).toBeVisible()
    expect(screen.getByRole("region", { name: "公开名片" })).toHaveAttribute(
      "aria-busy",
      "false"
    )
    expect(
      screen.queryByRole("button", { name: /^查看制作人名片/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("combobox", { name: "每页显示" })
    ).not.toBeInTheDocument()
  })

  it("keeps page, size, target input and boundaries synchronized through previous and next", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue({
      ...pageResult(),
      total: 24,
      totalPage: 2,
    })
    renderPage("/community/cards?page=1&size=12&filter=recent")
    const next = await screen.findByRole("button", { name: "下一页" })
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled()
    expect(screen.getByRole("spinbutton", { name: "跳至" })).toHaveValue(1)
    const pending = deferredPage()
    apiMocks.sendPage.mockReturnValueOnce(pending.promise)

    await user.click(next)

    expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(2, 12)
    expect(screen.getByLabelText("列表地址")).toHaveTextContent(
      "?page=2&size=12&filter=recent"
    )
    expect(screen.getByRole("status")).toHaveTextContent("正在读取名片墙")
    expect(
      screen.queryByRole("spinbutton", { name: "跳至" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /^查看制作人名片/ })
    ).not.toBeInTheDocument()
    await act(async () =>
      pending.resolve({ ...pageResult([43]), total: 24, totalPage: 2 })
    )

    expect(screen.getByRole("spinbutton", { name: "跳至" })).toHaveValue(2)
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled()
    expect(screen.getByText("第 2 / 2 页，共 24 张")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "上一页" }))

    expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(1, 12)
    expect(await screen.findByRole("spinbutton", { name: "跳至" })).toHaveValue(
      1
    )
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled()
    expect(screen.getByLabelText("列表地址")).toHaveTextContent(
      "?page=1&size=12&filter=recent"
    )
  })

  it.each([12, 24, 48])(
    "changes page size to %s, resets the page and edited target input, and preserves other parameters",
    async (size) => {
      const user = userEvent.setup()
      const initialSize = size === 12 ? 24 : 12
      apiMocks.sendPage.mockResolvedValue(pageResult())
      renderPage(`/community/cards?page=3&size=${initialSize}&filter=recent`)
      const select = await screen.findByRole("combobox", { name: "每页显示" })
      await user.clear(screen.getByRole("spinbutton", { name: "跳至" }))
      await user.type(screen.getByRole("spinbutton", { name: "跳至" }), "5")

      await user.click(select)
      await user.click(
        await screen.findByRole("option", { name: `${size} 张` })
      )

      await waitFor(() =>
        expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(1, size)
      )
      expect(
        await screen.findByRole("spinbutton", { name: "跳至" })
      ).toHaveValue(1)
      expect(
        screen.getByRole("combobox", { name: "每页显示" })
      ).toHaveTextContent(`${size} 张`)
      expect(screen.getByLabelText("列表地址")).toHaveTextContent(
        `?page=1&size=${size}&filter=recent`
      )
      expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled()
    }
  )

  it("keeps pagination grouped and supports Escape to cancel and Enter to submit a draft", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue({
      ...pageResult(),
      total: 48,
      totalPage: 4,
    })
    renderPage("/community/cards?page=2&size=12")
    const navigation = await screen.findByRole("navigation", {
      name: "名片分页",
    })
    const input = within(navigation).getByRole("spinbutton", { name: "跳至" })
    expect(
      within(navigation).getByRole("button", { name: "跳转" })
    ).toBeDisabled()
    expect(
      within(navigation).getByRole("combobox", { name: "每页显示" })
    ).toBeVisible()
    await user.clear(input)
    await user.type(input, "3")
    await user.keyboard("{Escape}")
    expect(input).toHaveValue(2)
    expect(
      within(navigation).getByRole("button", { name: "跳转" })
    ).toBeDisabled()
    expect(apiMocks.getNamecardPage).toHaveBeenCalledTimes(1)
    await user.clear(input)
    await user.type(input, "3{Enter}")
    await waitFor(() =>
      expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(3, 12)
    )
    expect(await screen.findByRole("spinbutton", { name: "跳至" })).toHaveValue(
      3
    )
    expect(screen.getByLabelText("列表地址")).toHaveTextContent(
      "?page=3&size=12"
    )
  })

  it.each(["", "0", "-1", "1.5", "8"])(
    "rejects target page %j without a request or URL change",
    async (value) => {
      const user = userEvent.setup()
      apiMocks.sendPage.mockResolvedValue(pageResult())
      renderPage()
      const input = await screen.findByRole("spinbutton", { name: "跳至" })
      apiMocks.getNamecardPage.mockClear()
      fireEvent.change(input, { target: { value } })

      await user.click(screen.getByRole("button", { name: "跳转" }))

      expect(toastMocks.error).toHaveBeenCalledWith("请输入 1 到 7 之间的页码")
      expect(apiMocks.getNamecardPage).not.toHaveBeenCalled()
      expect(screen.getByLabelText("列表地址")).toHaveTextContent(
        "?page=1&size=12"
      )
    }
  )

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
          seriesCode: null,
          favoriteIdols: [],
          claimStatus: "unclaimed",
          viewerClaimState: null,
          claimerName: null,
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
