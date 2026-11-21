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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { NamecardPage } from "~/lib/api"
import { resetNamecardCharacterCatalogCache } from "~/lib/use-namecard-character-catalog"
import CommunityCardsPage from "~/pages/community/community-cards-page"
import { makeNamecardCharacterCatalog } from "@/mocks/data/characters"
import { makeCardPage } from "@/mocks/data/namecards"

const elementScrollToDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollTo"
)

const apiMocks = vi.hoisted(() => ({
  getNamecardPage: vi.fn(),
  getPublicCard: vi.fn(),
  sendPublicCard: vi.fn(),
  getNamecardReactions: vi.fn(),
  getNamecardCharacterCatalog: vi.fn(),
  getNamecardTagSuggestions: vi.fn(),
  setNamecardCardTags: vi.fn(),
  addNamecardReaction: vi.fn(),
  requestCardExchange: vi.fn(),
  sendPage: vi.fn(),
  sendReactions: vi.fn(),
  sendCharacterCatalog: vi.fn(),
  sendTagSuggestions: vi.fn(),
  sendSetTags: vi.fn(),
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
    getPublicCard: apiMocks.getPublicCard,
    getNamecardCharacterCatalog: apiMocks.getNamecardCharacterCatalog,
    getNamecardTagSuggestions: apiMocks.getNamecardTagSuggestions,
    setNamecardCardTags: apiMocks.setNamecardCardTags,
    requestCardExchange: apiMocks.requestCardExchange,
    getFudabaSeries: () => ({
      send: () =>
        Promise.resolve({
          items: [{ code: "765", displayName: "本家", color: "#f34f6d" }],
        }),
    }),
  }
})

// 选卡窗口有自己的单测；名片墙只负责「传了哪个目标、确定后调了哪个端点」。
vi.mock("~/components/community/exchange/exchange-card-picker-dialog", () => ({
  ExchangeCardPickerDialog: ({
    open,
    target,
    targetCard,
    onSubmit,
    onOpenChange,
  }: {
    open: boolean
    target?: string
    targetCard?: number
    onSubmit: (cardNumbers: number[]) => void
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <div role="dialog" aria-label="交换名片">
        <span data-testid="picker-target">{target}</span>
        <span data-testid="picker-target-card">{targetCard}</span>
        <button
          type="button"
          onClick={() => {
            onSubmit([42])
            onOpenChange(false)
          }}
        >
          确定
        </button>
      </div>
    ) : null,
}))

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
      revision: 1,
      cardId: `card-${id}`,
      cardNumber: id,
      producerName: "天海春香",
      producerReading: null,
      groupName: null,
      madeOn: null,
      isOriginal: false,
      madeWithAi: false,
      bio: null,
      tradeNote: null,
      exchangeMode: "manual",
      accent: null,
      seriesCodes: ["765"],
      credits: [],
      canEdit: false,
      hasOwner: false,
      seriesCode: null,
      favoriteCharacters: [],
      claimStatus: "unclaimed",
      supplementPending: false,
      viewerClaimState: null,
      claimerName: null,
      claimerUid: null,
      pages: [
        makeCardPage({
          pageId: "page-front",
          role: "front",
          order: 1,
          url: `/front-${id}.jpg`,
        }),
        makeCardPage({
          pageId: "page-back",
          role: "back",
          order: 2,
          url: `/back-${id}.jpg`,
        }),
      ],
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

function renderPage(entry = "/community/cards?page=1&size=12&sort=created") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CommunityCardsPage />
      <ListLocation />
    </MemoryRouter>
  )
}

/**
 * 名片墙默认的筛选参数：共享筛选栏的初始值映射到公开墙的 `created` 排序。
 */
const baseWallFilters = {
  sort: "created",
  dir: "desc",
  seed: undefined,
  q: undefined,
  series: [] as string[],
  group: undefined,
  character: [] as number[],
  tags: [] as string[],
  match: "any",
  excludeOther: false,
  excludeCross: false,
  declaration: undefined,
  invert: false,
}

function desktopReaction(summary: HTMLElement, emoji: string, count: number) {
  return within(summary)
    .getAllByRole("button", { name: `${emoji}，${count} 次反应` })
    .find((chip) => chip.classList.contains("max-md:hidden"))!
}

describe("CommunityCardsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resetNamecardCharacterCatalogCache()
    apiMocks.sendCharacterCatalog.mockResolvedValue(
      makeNamecardCharacterCatalog()
    )
    apiMocks.getNamecardCharacterCatalog.mockReturnValue({
      send: apiMocks.sendCharacterCatalog,
    })
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    })
    vi.stubGlobal("scrollTo", vi.fn())
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((media: string) => ({
        media,
        matches: media === "(min-width: 48rem)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    )
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
    apiMocks.getPublicCard.mockReturnValue({ send: apiMocks.sendPublicCard })
    apiMocks.sendTagSuggestions.mockResolvedValue({ presets: [] })
    apiMocks.getNamecardTagSuggestions.mockReturnValue({
      send: apiMocks.sendTagSuggestions,
    })
    apiMocks.sendSetTags.mockResolvedValue({ tags: [] })
    apiMocks.setNamecardCardTags.mockReturnValue({
      send: apiMocks.sendSetTags,
    })
    apiMocks.getNamecardReactions.mockReturnValue({
      send: apiMocks.sendReactions,
    })
    apiMocks.addNamecardReaction.mockReturnValue({
      send: apiMocks.sendAddReaction,
    })
    apiMocks.requestCardExchange.mockResolvedValue({
      exchangeId: "exchange-1",
      status: "completed",
      targetCardNumbers: [42],
      initiatorCardNumbers: [42],
      skipped: [],
      targetMissingCount: 0,
    })
  })

  afterEach(() => {
    if (elementScrollToDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollTo",
        elementScrollToDescriptor
      )
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
    }
  })

  it("hides the public card number and formats the submission time", async () => {
    apiMocks.sendPage.mockResolvedValue({
      list: [
        {
          id: 459,
          seriesCode: null,
          favoriteCharacters: [],
          claimStatus: "unclaimed",
          supplementPending: false,
          viewerClaimState: null,
          claimerName: null,
          claimerUid: null,
          pages: [
            makeCardPage({
              pageId: "page-front",
              role: "front",
              order: 1,
              url: "/uploads/front.webp",
            }),
            makeCardPage({
              pageId: "page-back",
              role: "back",
              order: 2,
              url: "/uploads/back.webp",
            }),
          ],
          revision: 1,
          cardId: "card-42",
          cardNumber: 42,
          producerName: "天海春香",
          producerReading: null,
          groupName: null,
          madeOn: null,
          isOriginal: false,
          madeWithAi: false,
          bio: null,
          tradeNote: null,
          exchangeMode: "manual" as const,
          accent: null,
          seriesCodes: ["765"],
          credits: [],
          canEdit: false,
          hasOwner: false,
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

  it("links the producer name to the claimant's public page by uid", async () => {
    apiMocks.sendPage.mockResolvedValue({
      list: [
        {
          id: 460,
          seriesCode: null,
          favoriteCharacters: [],
          claimStatus: "claimed",
          supplementPending: false,
          viewerClaimState: null,
          claimerName: "认领制作人",
          claimerUid: 7,
          pages: [
            makeCardPage({
              pageId: "page-front",
              role: "front",
              order: 1,
              url: "/uploads/front.webp",
            }),
            makeCardPage({
              pageId: "page-back",
              role: "back",
              order: 2,
              url: "/uploads/back.webp",
            }),
          ],
          revision: 1,
          cardId: "card-43",
          cardNumber: 43,
          producerName: "天海春香",
          producerReading: null,
          groupName: null,
          madeOn: null,
          isOriginal: false,
          madeWithAi: false,
          bio: null,
          tradeNote: null,
          exchangeMode: "manual" as const,
          accent: null,
          seriesCodes: ["765"],
          credits: [],
          canEdit: false,
          hasOwner: false,
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

    const producer = await screen.findByRole("link", { name: "天海春香" })
    expect(producer).toHaveAttribute("href", "/user/7")
    // 所有者只保留一个绿色盾牌图标：没有文字，也没有第二个主页链接。
    expect(screen.getByText("已由注册用户认领")).toHaveClass("sr-only")
    expect(
      screen.queryByRole("link", { name: "认领制作人" })
    ).not.toBeInTheDocument()
  })

  it("renders a manual 1:1 carousel with in-frame dots and a multi-page corner badge", async () => {
    const card = { ...pageResult([42]).list[0], pageCount: 3 }
    apiMocks.sendPage.mockResolvedValue({ ...pageResult([42]), list: [card] })

    renderPage()

    const carousel = await waitFor(() => {
      const element = document.querySelector('[data-namecard-carousel="multi"]')
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    expect(carousel).toHaveClass("aspect-square")
    expect(within(carousel).getByRole("button", { name: "查看正面" })).toBeVisible()
    expect(within(carousel).getByRole("button", { name: "查看背面" })).toBeVisible()
    expect(within(carousel).getByLabelText("共 3 页")).toBeVisible()
    // 制作人名与日期在缩略图下方，所有者徽标不再有文字链接。
    expect(screen.getByText("天海春香")).toBeVisible()
    expect(screen.getByText("08-06 14:30")).toBeVisible()
  })

  it("appends a tile tag to the wall tag filter without duplicating it", async () => {
    const user = userEvent.setup()
    const card = {
      ...pageResult([42]).list[0],
      tags: [
        { name: "偶像", presetId: null },
        { name: "本家", presetId: 3 },
      ],
    }
    apiMocks.sendPage.mockResolvedValue({ ...pageResult([42]), list: [card] })

    renderPage()

    await user.click(
      await screen.findByRole("button", { name: "按标签 偶像 筛选" })
    )

    await waitFor(() =>
      expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(
        1,
        12,
        expect.objectContaining({ tags: ["偶像"] })
      )
    )
    const filters = screen.getByRole("button", { name: "筛选（已应用）" })
    expect(filters).toHaveAttribute("aria-expanded", "false")
    await user.click(filters)
    expect(
      screen.getByRole("button", { name: "移除标签筛选 偶像" })
    ).toBeVisible()

    // 再点一次同一条不会追加第二个筛选词。
    await user.click(screen.getByRole("button", { name: "按标签 偶像 筛选" }))
    expect(
      screen.getAllByRole("button", { name: "移除标签筛选 偶像" })
    ).toHaveLength(1)
  })

  it("saves inline tag drafts through the tag endpoint and updates the tile", async () => {
    const user = userEvent.setup()
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
    const card = {
      ...pageResult([42]).list[0],
      tags: [{ name: "偶像", presetId: null }],
    }
    apiMocks.sendPage.mockResolvedValue({ ...pageResult([42]), list: [card] })
    apiMocks.sendSetTags.mockResolvedValue({
      tags: [
        { name: "偶像", presetId: null },
        { name: "新标签", presetId: null },
      ],
    })

    renderPage()

    await user.click(await screen.findByRole("button", { name: "添加标签" }))
    await user.type(screen.getByRole("combobox", { name: "新标签" }), "新标签")
    await user.keyboard("{Enter}")
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(apiMocks.setNamecardCardTags).toHaveBeenCalledWith("card-42", [
        "偶像",
        "新标签",
      ])
    )
    expect(
      await screen.findByRole("button", { name: "按标签 新标签 筛选" })
    ).toBeVisible()
  })

  it("opens a deep-linked card that is not on the current page", async () => {
    apiMocks.sendPage.mockResolvedValue(pageResult([42]))
    apiMocks.sendPublicCard.mockResolvedValue({
      card: {
        ...pageResult([684]).list[0],
        cardId: "card-684",
        cardNumber: 684,
        id: 684,
      },
    })

    render(
      <MemoryRouter initialEntries={["/community/cards?card=684"]}>
        <CommunityCardsPage />
      </MemoryRouter>
    )

    expect(
      await screen.findByRole("dialog", { name: /制作人名片\s*684/ })
    ).toBeVisible()
    expect(apiMocks.getPublicCard).toHaveBeenCalledWith(684)
  })

  it("clears a deep link whose card is no longer readable", async () => {
    apiMocks.sendPage.mockResolvedValue(pageResult([42]))
    apiMocks.sendPublicCard.mockResolvedValue({ card: null })

    render(
      <MemoryRouter initialEntries={["/community/cards?card=999"]}>
        <CommunityCardsPage />
      </MemoryRouter>
    )

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("这张名片暂时无法查看")
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
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
          favoriteCharacters: [{ id: 1, name: "天海春香", seriesCode: "765" }],
          claimStatus: "unclaimed",
          supplementPending: false,
          viewerClaimState: null,
          claimerName: null,
          claimerUid: null,
          pages: [
            makeCardPage({
              pageId: "page-front",
              role: "front",
              order: 1,
              url: "/uploads/front.webp",
            }),
            makeCardPage({
              pageId: "page-back",
              role: "back",
              order: 2,
              url: "/uploads/back.webp",
            }),
          ],
          revision: 1,
          cardId: "card-42",
          cardNumber: 42,
          producerName: "天海春香",
          producerReading: null,
          groupName: null,
          madeOn: null,
          isOriginal: false,
          madeWithAi: false,
          bio: null,
          tradeNote: null,
          exchangeMode: "manual" as const,
          accent: null,
          seriesCodes: ["765"],
          credits: [],
          canEdit: false,
          hasOwner: false,
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
      screen.queryByRole("button", { name: "认领" })
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
      screen.queryByRole("button", { name: "认领" })
    ).not.toBeInTheDocument()
    await userEvent.setup().click(frontTrigger)
    const detail = await screen.findByRole("dialog", {
      name: /制作人名片\s*\d+/,
    })
    const claimButton = within(detail).getByRole("button", {
      name: "认领",
    })
    expect(claimButton).toBeVisible()
    // 窄屏把底栏压成一行，只有 sm 以上才回到 44px 高。
    expect(claimButton).toHaveClass("min-h-9")
    expect(claimButton).toHaveClass("sm:min-h-11")
  })

  it("opens the complete reaction picker and updates the selected count", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue({
      list: [
        {
          id: 42,
          seriesCode: null,
          favoriteCharacters: [],
          claimStatus: "unclaimed",
          supplementPending: false,
          viewerClaimState: null,
          claimerName: null,
          claimerUid: null,
          pages: [
            makeCardPage({
              pageId: "page-front",
              role: "front",
              order: 1,
              url: "/uploads/front.webp",
            }),
            makeCardPage({
              pageId: "page-back",
              role: "back",
              order: 2,
              url: "/uploads/back.webp",
            }),
          ],
          revision: 1,
          cardId: "card-42",
          cardNumber: 42,
          producerName: "天海春香",
          producerReading: null,
          groupName: null,
          madeOn: null,
          isOriginal: false,
          madeWithAi: false,
          bio: null,
          tradeNote: null,
          exchangeMode: "manual" as const,
          accent: null,
          seriesCodes: ["765"],
          credits: [],
          canEdit: false,
          hasOwner: false,
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
      "h-7",
      "min-h-7",
      "min-w-7",
      "gap-0.5",
      "rounded-full",
      "px-1",
      "text-[10px]",
      "md:min-w-0"
    )
    expect(reaction.querySelector("img")).toHaveClass("size-3.5", "md:size-5")

    expect(screen.getByRole("button", { name: "添加反应" })).toHaveClass(
      "max-md:hidden"
    )
    await user.click(
      screen.getAllByRole("button", { name: "❤️，4 次反应" })[0]!
    )
    const detail = await screen.findByRole("dialog", {
      name: /制作人名片\s*\d+/,
    })
    const reactionGroup = within(detail).getByLabelText("名片全部反应")
    const addButton = within(detail).getByRole("button", {
      name: "添加反应",
    })
    expect(reactionGroup).toBeVisible()
    expect(reactionGroup.lastElementChild).toBe(addButton)
    expect(addButton).toHaveAttribute("title", "添加反应")
    expect(addButton).toHaveClass("size-8", "rounded-full")
    const visibleCircle = addButton.querySelector("span")
    expect(visibleCircle).toHaveClass("size-6", "rounded-full", "border-dashed")
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

  it("submits desktop chips and picker choices from the list and shares counts with detail", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue(pageResult())
    apiMocks.sendReactions.mockResolvedValue({ "❤️": 4, "👍": 2 })
    renderPage()

    const summary = await screen.findByLabelText("名片反应摘要")
    await within(summary).findAllByRole("button", { name: "❤️，4 次反应" })
    await user.click(desktopReaction(summary, "❤️", 4))

    await waitFor(() => {
      expect(desktopReaction(summary, "❤️", 5)).toHaveTextContent("5")
      expect(apiMocks.sendAddReaction).toHaveBeenCalledOnce()
    })
    expect(apiMocks.addNamecardReaction).toHaveBeenCalledWith(42, "❤️")
    expect(
      screen.queryByRole("dialog", { name: /^名片 #42/ })
    ).not.toBeInTheDocument()

    const add = within(summary).getByRole("button", { name: "添加反应" })
    expect(add).toHaveAttribute("title", "添加反应")
    expect(add).toHaveClass("max-md:hidden", "size-8")
    expect(add.querySelector("span")).toHaveClass("size-6", "border-dashed")
    await user.click(add)
    expect(screen.getByText("选择反应")).toBeVisible()
    expect(screen.getAllByRole("button", { name: /，添加反应$/ })).toHaveLength(
      46
    )
    expect(
      screen.queryByRole("dialog", { name: /^名片 #42/ })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "🧒，添加反应" }))

    await waitFor(() =>
      expect(desktopReaction(summary, "🧒", 1)).toHaveTextContent("1")
    )
    await waitFor(() =>
      expect(screen.queryByText("选择反应")).not.toBeInTheDocument()
    )
    expect(apiMocks.addNamecardReaction.mock.calls).toEqual([
      [42, "❤️"],
      [42, "🧒"],
    ])
    expect(apiMocks.sendAddReaction).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByRole("dialog", { name: /^名片 #42/ })
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "查看制作人名片 42 正面" })
    )
    const detail = await screen.findByRole("dialog", {
      name: /制作人名片\s*\d+/,
    })
    expect(
      within(detail).getByRole("button", { name: "❤️，5 次反应" })
    ).toBeVisible()
    expect(
      within(detail).getByRole("button", { name: "🧒，1 次反应" })
    ).toBeVisible()
    expect(
      within(detail).getByRole("button", { name: "👍，2 次反应" })
    ).toBeVisible()
    expect(apiMocks.sendReactions).toHaveBeenCalledOnce()
  })

  it("offers an empty desktop picker and keeps the narrow empty summary opening detail", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue(pageResult())
    renderPage()

    const summary = await screen.findByLabelText("名片反应摘要")
    const viewDetail = await within(summary).findByRole("button", {
      name: "查看详情",
    })
    expect(viewDetail).toHaveClass("md:hidden")
    const add = within(summary).getByRole("button", { name: "添加反应" })
    expect(add).toHaveClass("max-md:hidden")
    await user.click(viewDetail)
    const detail = await screen.findByRole("dialog", {
      name: /制作人名片\s*\d+/,
    })
    expect(within(detail).getByText("还没有反应")).toBeVisible()
    expect(apiMocks.sendAddReaction).not.toHaveBeenCalled()
    await user.click(within(detail).getByRole("button", { name: "Close" }))
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /^名片 #42/ })
      ).not.toBeInTheDocument()
    )
    await waitFor(() => {
      expect(viewDetail).toHaveFocus()
    })

    await user.click(add)
    expect(screen.getByText("选择反应")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "❤️，添加反应" }))
    await waitFor(() =>
      expect(desktopReaction(summary, "❤️", 1)).toHaveTextContent("1")
    )
    expect(
      within(summary).queryByRole("button", { name: "查看详情" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("dialog", { name: /^名片 #42/ })
    ).not.toBeInTheDocument()
    expect(apiMocks.addNamecardReaction).toHaveBeenCalledWith(42, "❤️")
    expect(apiMocks.sendAddReaction).toHaveBeenCalledOnce()
  })

  it("shares the per-card emoji quota between list and detail for the page lifetime", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue(pageResult([42, 43]))
    apiMocks.sendReactions.mockResolvedValue({ "❤️": 4 })
    renderPage()

    await screen.findAllByRole("button", { name: "❤️，4 次反应" })
    const [summary, otherSummary] = screen.getAllByLabelText("名片反应摘要")
    for (let count = 4; count < 10; count += 1) {
      await user.click(desktopReaction(summary!, "❤️", count))
      await waitFor(() =>
        expect(desktopReaction(summary!, "❤️", count + 1)).toHaveTextContent(
          String(count + 1)
        )
      )
    }
    await user.click(
      screen.getByRole("button", { name: "查看制作人名片 42 正面" })
    )
    const detail = await screen.findByRole("dialog", {
      name: /制作人名片\s*\d+/,
    })
    for (let count = 10; count < 14; count += 1) {
      await user.click(
        within(detail).getByRole("button", { name: `❤️，${count} 次反应` })
      )
      expect(
        await within(detail).findByRole("button", {
          name: `❤️，${count + 1} 次反应`,
        })
      ).toBeVisible()
    }
    await user.click(
      within(detail).getByRole("button", { name: "❤️，14 次反应" })
    )
    expect(toastMocks.error).toHaveBeenCalledWith("这个反应点得太多了")
    expect(apiMocks.sendAddReaction).toHaveBeenCalledTimes(10)
    await user.click(within(detail).getByRole("button", { name: "Close" }))
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /^名片 #42/ })
      ).not.toBeInTheDocument()
    )
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "查看制作人名片 42 正面" })
      ).toHaveFocus()
    })

    await user.click(desktopReaction(summary!, "❤️", 14))
    expect(toastMocks.error).toHaveBeenCalledTimes(2)
    expect(apiMocks.sendAddReaction).toHaveBeenCalledTimes(10)
    expect(desktopReaction(summary!, "❤️", 14)).toHaveTextContent("14")
    await user.click(within(summary!).getByRole("button", { name: "添加反应" }))
    await user.click(screen.getByRole("button", { name: "🧒，添加反应" }))
    await waitFor(() =>
      expect(desktopReaction(summary!, "🧒", 1)).toHaveTextContent("1")
    )
    await user.click(desktopReaction(otherSummary!, "❤️", 4))
    await waitFor(() =>
      expect(desktopReaction(otherSummary!, "❤️", 5)).toHaveTextContent("5")
    )
    expect(apiMocks.sendAddReaction).toHaveBeenCalledTimes(12)
    expect(apiMocks.addNamecardReaction).toHaveBeenLastCalledWith(43, "❤️")
  })

  it("suppresses pending duplicates across list and detail while other cards can react", async () => {
    let resolveMutation!: (value: { ok: true }) => void
    apiMocks.sendPage.mockResolvedValue(pageResult([42, 43]))
    apiMocks.sendReactions.mockResolvedValue({ "❤️": 4, "👍": 2 })
    apiMocks.sendAddReaction.mockReturnValueOnce(
      new Promise<{ ok: true }>((resolve) => {
        resolveMutation = resolve
      })
    )
    const user = userEvent.setup()
    renderPage()

    await screen.findAllByRole("button", { name: "❤️，4 次反应" })
    const [summary, otherSummary] = screen.getAllByLabelText("名片反应摘要")
    const heart = desktopReaction(summary!, "❤️", 4)
    fireEvent.click(heart)
    fireEvent.click(heart)
    fireEvent.click(desktopReaction(summary!, "👍", 2))
    expect(apiMocks.sendAddReaction).toHaveBeenCalledOnce()
    expect(heart).toBeDisabled()
    expect(desktopReaction(summary!, "👍", 2)).toBeDisabled()
    expect(
      within(summary!).getByRole("button", { name: "添加反应" })
    ).toBeDisabled()
    expect(heart).toHaveTextContent("4")
    expect(desktopReaction(otherSummary!, "❤️", 4)).toBeEnabled()
    await user.click(desktopReaction(otherSummary!, "❤️", 4))
    await waitFor(() =>
      expect(desktopReaction(otherSummary!, "❤️", 5)).toHaveTextContent("5")
    )
    expect(apiMocks.addNamecardReaction.mock.calls).toEqual([
      [42, "❤️"],
      [43, "❤️"],
    ])

    await user.click(
      screen.getByRole("button", { name: "查看制作人名片 42 正面" })
    )
    const detail = await screen.findByRole("dialog", {
      name: /制作人名片\s*\d+/,
    })
    const detailHeart = within(detail).getByRole("button", {
      name: "❤️，4 次反应",
    })
    expect(detailHeart).toBeDisabled()
    expect(
      within(detail).getByRole("button", { name: "添加反应" })
    ).toBeDisabled()
    fireEvent.click(detailHeart)
    fireEvent.click(
      within(detail).getByRole("button", { name: "👍，2 次反应" })
    )
    expect(apiMocks.sendAddReaction).toHaveBeenCalledTimes(2)
    await act(async () => resolveMutation({ ok: true }))
    expect(
      within(detail).getByRole("button", { name: "❤️，5 次反应" })
    ).toBeEnabled()
    expect(
      within(detail).getByRole("button", { name: "👍，2 次反应" })
    ).toBeEnabled()
    expect(
      within(detail).getByRole("button", { name: "添加反应" })
    ).toBeEnabled()
    await user.click(within(detail).getByRole("button", { name: "Close" }))
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /^名片 #42/ })
      ).not.toBeInTheDocument()
    )
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "查看制作人名片 42 正面" })
      ).toHaveFocus()
    })
    expect(desktopReaction(summary!, "❤️", 5)).toHaveTextContent("5")
    expect(desktopReaction(otherSummary!, "❤️", 5)).toHaveTextContent("5")
    expect(apiMocks.sendAddReaction).toHaveBeenCalledTimes(2)
  })

  it("preserves counts on a failed desktop write and lets retry use all ten successful reactions", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue(pageResult())
    apiMocks.sendReactions.mockResolvedValue({ "❤️": 4, "👍": 2 })
    apiMocks.sendAddReaction.mockRejectedValueOnce(new Error("offline"))
    renderPage()

    const summary = await screen.findByLabelText("名片反应摘要")
    await within(summary).findAllByRole("button", { name: "❤️，4 次反应" })
    await user.click(desktopReaction(summary, "❤️", 4))
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("暂时无法添加反应")
    )
    expect(desktopReaction(summary, "❤️", 4)).toBeEnabled()
    expect(desktopReaction(summary, "👍", 2)).toHaveTextContent("2")
    expect(
      within(summary).getByRole("button", { name: "添加反应" })
    ).toBeEnabled()
    expect(
      within(summary).queryByRole("button", { name: "❤️，5 次反应" })
    ).not.toBeInTheDocument()
    expect(apiMocks.sendAddReaction).toHaveBeenCalledOnce()

    for (let count = 4; count < 14; count += 1) {
      await user.click(desktopReaction(summary, "❤️", count))
      await waitFor(() =>
        expect(desktopReaction(summary, "❤️", count + 1)).toHaveTextContent(
          String(count + 1)
        )
      )
    }
    expect(apiMocks.sendAddReaction).toHaveBeenCalledTimes(11)
    await user.click(desktopReaction(summary, "❤️", 14))
    expect(toastMocks.error).toHaveBeenLastCalledWith("这个反应点得太多了")
    expect(apiMocks.sendAddReaction).toHaveBeenCalledTimes(11)
    expect(desktopReaction(summary, "❤️", 14)).toHaveTextContent("14")
    expect(
      screen.queryByRole("dialog", { name: /^名片 #42/ })
    ).not.toBeInTheDocument()
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
    const detail = await screen.findByRole("dialog", {
      name: /制作人名片\s*\d+/,
    })
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
    const detail = await screen.findByRole("dialog", {
      name: /制作人名片\s*\d+/,
    })
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
      "min-h-7",
      "gap-0.5",
      "md:gap-1"
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
        "h-7",
        "min-h-7",
        "min-w-7",
        "shrink-0",
        "gap-0.5",
        "rounded-full",
        "border-border",
        "bg-background",
        "px-1",
        "text-[10px]",
        "tabular-nums",
        "max-md:focus-visible:ring-inset",
        "md:min-w-0",
        "md:gap-0.5",
        "md:px-1.5",
        "md:text-xs"
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
    expect(within(group).getByRole("button", { name: "添加反应" })).toHaveClass(
      "max-md:hidden"
    )
  })

  it("opens detail from the list and then previews both sides", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue({
      list: [
        {
          id: 42,
          seriesCode: null,
          favoriteCharacters: [],
          claimStatus: "unclaimed",
          supplementPending: false,
          viewerClaimState: null,
          claimerName: null,
          claimerUid: null,
          pages: [
            makeCardPage({
              pageId: "page-front",
              role: "front",
              order: 1,
              url: "/uploads/front.webp",
            }),
            makeCardPage({
              pageId: "page-back",
              role: "back",
              order: 2,
              url: "/uploads/back.webp",
            }),
          ],
          revision: 1,
          cardId: "card-42",
          cardNumber: 42,
          producerName: "天海春香",
          producerReading: null,
          groupName: null,
          madeOn: null,
          isOriginal: false,
          madeWithAi: false,
          bio: null,
          tradeNote: null,
          exchangeMode: "manual" as const,
          accent: null,
          seriesCodes: ["765"],
          credits: [],
          canEdit: false,
          hasOwner: false,
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
      "/uploads/front.webp"
    )

    await user.click(frontTrigger)

    const detail = await screen.findByRole("dialog", {
      name: /制作人名片\s*\d+/,
    })
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

    await user.click(
      within(preview).getByRole("button", { name: "查看第 2 张（背面）" })
    )

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
        "md:gap-0",
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
        "flex-col",
        "items-stretch",
        "gap-0.5",
        "px-1.5",
        "md:px-4"
      )
      // 第一行是制作人名（自适应字号），第二行是创建日期。
      expect(header.querySelector("[data-slot=card-description] time")).not.toBeNull()
      const faces = within(item).getAllByRole("button", {
        name: /^查看制作人名片/,
      })
      expect(faces).toHaveLength(2)
      expect(faces[0].parentElement).toHaveClass(
        "flex",
        "size-full",
        "will-change-transform"
      )
      for (const face of faces) {
        expect(face).not.toHaveClass("hidden")
        expect(face).toHaveClass("relative", "size-full", "shrink-0")
        expect(face).not.toHaveClass("aspect-3/2")
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
    // 已认领只留绿色图标：claimerName 不再作为文字/链接出现在瓦片上。
    expect(screen.queryByText("风晓星落P")).toBeNull()
    const ownerIcon = within(items[0]).getByText("已由注册用户认领")
    expect(ownerIcon).toHaveClass("sr-only")
    expect(ownerIcon.parentElement).toHaveClass("text-success")
    // 所有者图标与制作人名同一行，仍在信息区里。
    expect(ownerIcon.closest('[data-slot="card-header"]')).toBe(
      items[0].querySelector('[data-slot="card-header"]')
    )
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
    expect(
      within(items[3]).getByText("已由注册用户认领")
    ).toBeInTheDocument()
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

      const detail = await screen.findByRole("dialog", {
        name: /制作人名片\s*\d+/,
      })
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
        within(preview).getByRole("button", {
          name: `查看第 ${label === "正面" ? 1 : 2} 张（${label}）`,
        })
      ).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByLabelText("列表地址")).toHaveTextContent(
        "?page=1&size=12"
      )
    }
  )

  it.each(["/community/cards", "/community/cards?sort=unknown"])(
    "defaults to newest first with numbered pagination at %s",
    async (entry) => {
      apiMocks.sendPage.mockResolvedValue(pageResult())
      renderPage(entry)

      expect(
        await screen.findByRole("navigation", { name: "名片分页" })
      ).toBeVisible()
      expect(
        screen.getByRole("combobox", { name: "排序方式" })
      ).toHaveTextContent("最新发布")
      expect(apiMocks.getNamecardPage).toHaveBeenCalledExactlyOnceWith(
        1,
        12,
        baseWallFilters
      )
      expect(screen.getByLabelText("列表地址")).not.toHaveTextContent("seed=")
    }
  )

  it.each([
    ["name", "desc"],
    ["created", "asc"],
  ])("honors explicit %s sorting in %s order", async (sort, dir) => {
    apiMocks.sendPage.mockResolvedValue(pageResult())
    renderPage(`/community/cards?sort=${sort}&dir=${dir}`)

    await screen.findByRole("navigation", { name: "名片分页" })
    expect(apiMocks.getNamecardPage).toHaveBeenCalledExactlyOnceWith(1, 12, {
      ...baseWallFilters,
      sort,
      dir,
    })
  })

  it("keeps filters collapsed by default, without hiding the wall order", async () => {
    const user = userEvent.setup()
    renderPage()

    const toggle = screen.getByRole("button", { name: "筛选" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("textbox", { name: "制作人名称" })).toBeNull()
    expect(
      screen.getByRole("combobox", { name: "排序方式" })
    ).toHaveTextContent("最新发布")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.queryByLabelText("所属用户")).not.toBeInTheDocument()
    expect(
      screen.getByRole("textbox", { name: "制作人名称" })
    ).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "标签筛选" })).toBeVisible()
  })

  it("passes every wall filter and resets the page on change", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue({
      ...pageResult(),
      total: 80,
      totalPage: 7,
    })
    renderPage("/community/cards?page=3&size=12&sort=created")
    await screen.findByRole("button", { name: "查看制作人名片 42 背面" })

    await user.click(screen.getByRole("button", { name: "筛选" }))
    await user.click(screen.getByRole("button", { name: /高级筛选/ }))
    await user.type(screen.getByLabelText("制作人名称"), "春香")
    await waitFor(
      () =>
        expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(
          1,
          12,
          expect.objectContaining({ q: "春香" })
        ),
      { timeout: 3000 }
    )

    await user.click(screen.getByRole("textbox", { name: "搜索担当角色" }))
    await user.click(screen.getByRole("checkbox", { name: /天海春香/ }))
    await user.click(screen.getByRole("checkbox", { name: /同时包含/ }))
    await user.click(screen.getByRole("textbox", { name: "搜索企划" }))
    await user.click(screen.getByRole("checkbox", { name: /本家/ }))
    await user.type(screen.getByLabelText("所属团体"), "765PRO")
    await user.click(screen.getByRole("checkbox", { name: /反向排除/ }))
    await user.click(screen.getByRole("combobox", { name: "创作声明" }))
    await user.click(await screen.findByRole("option", { name: "AI" }))

    await waitFor(() =>
      expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(
        1,
        12,
        expect.objectContaining({
          q: "春香",
          character: [1],
          match: "all",
          series: ["765"],
          group: "765PRO",
          invert: true,
          declaration: "ai",
        })
      )
    )
    expect(screen.getByLabelText("列表地址")).toHaveTextContent(
      "?page=1&size=12"
    )
  })

  it("switches the empty copy once a filter is active", async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText("还没有公开名片")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "筛选" }))
    await user.type(screen.getByLabelText("制作人名称"), "春香")

    expect(await screen.findByText("没有符合条件的名片")).toBeVisible()
    expect(screen.queryByText("还没有公开名片")).not.toBeInTheDocument()
  })

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
    expect(within(list).getByRole("status")).toHaveTextContent("正在读取名片墙")
    expect(
      screen.queryByRole("combobox", { name: "每页显示" })
    ).not.toBeInTheDocument()
    await act(async () => first.reject(new Error("offline")))

    expect(list).toHaveAttribute("aria-busy", "false")
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法读取名片墙")
    await user.click(screen.getByRole("button", { name: "重试读取名片墙" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(within(list).getByRole("status")).toHaveTextContent("正在读取名片墙")
    expect(list).toHaveAttribute("aria-busy", "true")
    expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(
      1,
      12,
      baseWallFilters
    )
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
    renderPage("/community/cards?page=1&size=12&filter=recent&sort=created")
    const next = await screen.findByRole("button", { name: "下一页" })
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled()
    expect(screen.getByRole("spinbutton", { name: "跳至" })).toHaveValue(1)
    const pending = deferredPage()
    apiMocks.sendPage.mockReturnValueOnce(pending.promise)

    await user.click(next)

    expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(
      2,
      12,
      baseWallFilters
    )
    expect(screen.getByLabelText("列表地址")).toHaveTextContent(
      "?page=2&size=12&filter=recent"
    )
    expect(
      within(screen.getByRole("region", { name: "公开名片" })).getByRole(
        "status"
      )
    ).toHaveTextContent("正在读取名片墙")
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

    expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(
      1,
      12,
      baseWallFilters
    )
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
      renderPage(
        `/community/cards?page=3&size=${initialSize}&filter=recent&sort=created`
      )
      const select = await screen.findByRole("combobox", { name: "每页显示" })
      await user.clear(screen.getByRole("spinbutton", { name: "跳至" }))
      await user.type(screen.getByRole("spinbutton", { name: "跳至" }), "5")

      await user.click(select)
      await user.click(
        await screen.findByRole("option", { name: `${size} 张` })
      )

      await waitFor(() =>
        expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(
          1,
          size,
          baseWallFilters
        )
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
    renderPage("/community/cards?page=2&size=12&sort=created")
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
      expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(
        3,
        12,
        baseWallFilters
      )
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

  it("appends a batch with the same seed, retries in place, and resets on reshuffle", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage
      .mockResolvedValueOnce({ ...pageResult([42]), totalPage: 2 })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ...pageResult([42, 43]), totalPage: 2 })
      .mockResolvedValueOnce({ ...pageResult([44]), totalPage: 1 })
    renderPage("/community/cards?sort=random")
    const first = await screen.findByRole("button", {
      name: "查看制作人名片 42 正面",
    })
    const params = () =>
      new URLSearchParams(screen.getByLabelText("列表地址").textContent ?? "")
    const seed = params().get("seed")
    expect(seed).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(apiMocks.getNamecardPage).toHaveBeenCalledExactlyOnceWith(
      1,
      12,
      expect.objectContaining({ sort: "random", seed })
    )
    expect(
      screen.getByRole("combobox", { name: "排序方式" })
    ).toHaveTextContent("随机发现")
    expect(screen.queryByRole("navigation", { name: "名片分页" })).toBeNull()
    expect(screen.getByRole("button", { name: "筛选" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )

    await user.click(screen.getByRole("button", { name: "加载更多名片" }))
    const retry = await screen.findByRole("button", { name: "重试加载更多" })
    expect(first).toBeVisible()
    expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(
      2,
      12,
      expect.objectContaining({ sort: "random", seed })
    )
    await user.click(retry)
    expect(
      await screen.findByRole("button", { name: "查看制作人名片 43 正面" })
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "查看制作人名片 42 正面" })).toBe(
      first
    )
    expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(
      2,
      12,
      expect.objectContaining({ sort: "random", seed })
    )
    expect(params().get("page")).toBe("1")
    expect(screen.getByText("已浏览完本轮名片")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "换个顺序" }))
    expect(
      await screen.findByRole("button", { name: "查看制作人名片 44 正面" })
    ).toBeVisible()
    expect(first).not.toBeInTheDocument()
    expect(params().get("seed")).not.toBe(seed)
    expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(
      1,
      12,
      expect.objectContaining({ sort: "random", seed: params().get("seed") })
    )
  })

  it("reads page and size from the URL", async () => {
    render(
      <MemoryRouter
        initialEntries={["/community/cards?page=3&size=24&sort=created"]}
      >
        <CommunityCardsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(apiMocks.getNamecardPage).toHaveBeenCalledWith(
        3,
        24,
        baseWallFilters
      )
    })
  })

  it("jumps to a specified page", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue({
      list: [
        {
          id: 42,
          seriesCode: null,
          favoriteCharacters: [],
          claimStatus: "unclaimed",
          supplementPending: false,
          viewerClaimState: null,
          claimerName: null,
          claimerUid: null,
          pages: [
            makeCardPage({
              pageId: "page-front",
              role: "front",
              order: 1,
              url: "/uploads/front.webp",
            }),
            makeCardPage({
              pageId: "page-back",
              role: "back",
              order: 2,
              url: "/uploads/back.webp",
            }),
          ],
          revision: 1,
          cardId: "card-42",
          cardNumber: 42,
          producerName: "天海春香",
          producerReading: null,
          groupName: null,
          madeOn: null,
          isOriginal: false,
          madeWithAi: false,
          bio: null,
          tradeNote: null,
          exchangeMode: "manual" as const,
          accent: null,
          seriesCodes: ["765"],
          credits: [],
          canEdit: false,
          hasOwner: false,
          status: "approved",
          created_at: null,
        },
      ],
      total: 80,
      totalPage: 7,
    })

    render(
      <MemoryRouter initialEntries={["/community/cards?sort=created"]}>
        <CommunityCardsPage />
      </MemoryRouter>
    )

    await screen.findByRole("combobox", { name: "每页显示" })
    expect(apiMocks.getNamecardPage).toHaveBeenCalledWith(
      1,
      12,
      baseWallFilters
    )

    await user.clear(screen.getByRole("spinbutton", { name: "跳至" }))
    await user.type(screen.getByRole("spinbutton", { name: "跳至" }), "3")
    await user.click(screen.getByRole("button", { name: "跳转" }))

    await waitFor(() => {
      expect(apiMocks.getNamecardPage).toHaveBeenLastCalledWith(
        3,
        12,
        baseWallFilters
      )
    })
    expect(screen.getByText("第 3 / 7 页，共 80 张")).toBeVisible()

    apiMocks.getNamecardPage.mockClear()
    await user.clear(screen.getByRole("spinbutton", { name: "跳至" }))
    await user.type(screen.getByRole("spinbutton", { name: "跳至" }), "8")
    await user.click(screen.getByRole("button", { name: "跳转" }))

    expect(toastMocks.error).toHaveBeenCalledWith("请输入 1 到 7 之间的页码")
    expect(apiMocks.getNamecardPage).not.toHaveBeenCalled()
  })

  it("opens the picker from the detail dialog and requests the wall card", async () => {
    const user = userEvent.setup()
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
    const result = pageResult([42])
    Object.assign(result.list[0], {
      hasOwner: true,
      claimStatus: "claimed",
      // 公开墙的投影里 `claimerUid` 恒为 null：交换入口只看登录与拥有标记。
      claimerUid: null,
    })
    apiMocks.sendPage.mockResolvedValue(result)
    renderPage()

    await user.click(
      await screen.findByRole("button", { name: "查看制作人名片 42 正面" })
    )
    const detail = await screen.findByRole("dialog", {
      name: /制作人名片\s*42/,
    })
    await user.click(within(detail).getByRole("button", { name: "交换名片" }))

    // 名片墙拿不到账号 ID：选卡窗口用卡号反查卡主（`?targetCard=`）。
    const picker = await screen.findByRole("dialog", { name: "交换名片" })
    expect(within(picker).getByTestId("picker-target-card")).toHaveTextContent(
      "42"
    )
    expect(within(picker).getByTestId("picker-target")).toBeEmptyDOMElement()

    // 【交换】不再顺手关掉详情窗：两层窗口同时在，选卡未结束前下层保持打开
    // （下层被上层设为 aria-hidden，改用内容断言）。
    expect(screen.getByText("全部反应")).toBeInTheDocument()

    await user.click(within(picker).getByRole("button", { name: "确定" }))

    const [cardNumber, body] = apiMocks.requestCardExchange.mock.calls[0] as [
      number,
      { clientExchangeId: string; giveCardNumbers: number[] },
    ]
    expect(cardNumber).toBe(42)
    expect(body.giveCardNumbers).toEqual([42])
    expect(body.clientExchangeId.length).toBeGreaterThanOrEqual(8)
    expect(body.clientExchangeId.length).toBeLessThanOrEqual(64)
    // 提交（无论成败）也不替用户关窗：详情还在，数据由页面自己刷新。
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "交换名片" })).toBeNull()
    })
    expect(
      screen.getByRole("dialog", { name: /制作人名片\s*42/ })
    ).toBeInTheDocument()
  })
})
