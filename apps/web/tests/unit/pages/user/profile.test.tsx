import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  Namecard,
  NamecardPage,
  PlatformAccountLink,
  PublicProfile,
} from "~/lib/api"
import UserProfilePage from "~/pages/user/profile"
import { makeCardPage } from "@/mocks/data/namecards"
import { renderPage } from "@/tests/unit/support/harness"

const apiMocks = vi.hoisted(() => ({
  getPublicProfile: vi.fn(),
  getProfileCards: vi.fn(),
  getNamecardReactions: vi.fn(),
  getCardShareLink: vi.fn(),
  requestCardExchange: vi.fn(),
  giftCards: vi.fn(),
  sendProfile: vi.fn(),
  sendCards: vi.fn(),
  sendReactions: vi.fn(),
  sendShareLink: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  useOptionalPlatformSession: vi.fn(),
}))

const refreshMocks = vi.hoisted(() => ({ notifyNamecardDataChanged: vi.fn() }))

const toastMocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  })
  return { toast }
})

vi.mock("sonner", () => ({ toast: toastMocks.toast }))

vi.mock("~/lib/namecards/data-refresh", () => refreshMocks)

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getPublicProfile: apiMocks.getPublicProfile,
    getProfileCards: apiMocks.getProfileCards,
    getNamecardReactions: apiMocks.getNamecardReactions,
    getCardShareLink: apiMocks.getCardShareLink,
    requestCardExchange: apiMocks.requestCardExchange,
    giftCards: apiMocks.giftCards,
  }
})

// 选卡窗口有自己的单测；主页只负责「传了哪个目标、确定后调了哪个端点」。
vi.mock(
  "~/components/community/exchange/exchange-card-picker-dialog",
  () => ({
    ExchangeCardPickerDialog: ({
      open,
      target,
      targetCard,
      variant,
      submitting,
      onSubmit,
      onOpenChange,
    }: {
      open: boolean
      target?: string
      targetCard?: number
      variant?: string
      submitting?: boolean
      onSubmit: (cardNumbers: number[]) => void
      onOpenChange: (open: boolean) => void
    }) =>
      open ? (
        <div
          role="dialog"
          aria-label="交换名片"
          data-testid="exchange-picker"
          data-variant={variant}
        >
          <span data-testid="picker-target">{target}</span>
          <span data-testid="picker-target-card">{targetCard}</span>
          <span data-testid="picker-submitting">{String(submitting)}</span>
          <button
            type="button"
            onClick={() => {
              onSubmit([202])
              onOpenChange(false)
            }}
          >
            确定
          </button>
        </div>
      ) : null,
  })
)

vi.mock("~/components/platform/platform-session-provider", () => ({
  useOptionalPlatformSession: sessionMocks.useOptionalPlatformSession,
}))

const accounts: PlatformAccountLink[] = [
  {
    kindId: "home",
    name: "主页",
    group: "link",
    value: "https://example.com",
    username: null,
    url: null,
    color: null,
    icon: null,
    iconUrl: null,
  },
  {
    kindId: "github",
    name: "GitHub",
    group: "social",
    value: "zheizhei",
    username: "ZheiZhei",
    url: "https://github.com/zheizhei",
    color: "#24292f",
    icon: "github",
    iconUrl: null,
  },
  {
    kindId: "mastodon",
    name: "Mastodon",
    group: "social",
    value: "@zheizhei@example.social",
    username: null,
    url: "https://example.social/@zheizhei",
    color: null,
    icon: null,
    iconUrl: "/uploads/platform/mastodon.svg",
  },
  {
    kindId: "discord",
    name: "Discord",
    group: "social",
    value: "haruka#1234",
    username: null,
    url: null,
    color: null,
    icon: null,
    iconUrl: null,
  },
  {
    kindId: "game-id",
    name: "游戏 ID",
    group: "game",
    value: "765pro",
    username: null,
    url: null,
    color: null,
    icon: null,
    iconUrl: null,
  },
]

function profile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    accountId: "acct-1",
    uid: 1001,
    pageSlug: null,
    displayName: "春香P",
    avatarUrl: null,
    homeCity: "东京",
    bio: "白天写代码，晚上做名片。",
    accounts,
    ...overrides,
  }
}

function card(overrides: Partial<Namecard> = {}): Namecard {
  return {
    id: 101,
    revision: 1,
    cardId: "card-101",
    cardNumber: 101,
    producerName: "春香P",
    producerReading: null,
    groupName: null,
    madeOn: null,
    isOriginal: true,
    madeWithAi: false,
    bio: null,
    tradeNote: null,
    exchangeMode: "manual",
    accent: null,
    seriesCodes: ["765as"],
    credits: [],
    pages: [
      makeCardPage({
        pageId: "front-101",
        role: "front",
        order: 1,
        url: "/cards/front-101.jpg",
      }),
      makeCardPage({
        pageId: "back-101",
        role: "back",
        order: 2,
        url: "/cards/back-101.jpg",
      }),
    ],
    canEdit: false,
    hasOwner: true,
    // 正反两面：不到三页，主页不出现页数标记。
    pageCount: 2,
    seriesCode: null,
    favoriteCharacters: [],
    claimStatus: "unclaimed",
    supplementPending: false,
    viewerClaimState: null,
    claimerName: null,
    claimerUid: null,
    status: "approved",
    created_at: "2026-08-06T06:30:00.000Z",
    ...overrides,
  }
}

function page(overrides: Partial<NamecardPage> = {}): NamecardPage {
  return { list: [], total: 0, totalPage: 0, ...overrides }
}

function anonymousSession() {
  return {
    status: "anonymous",
    session: null,
    error: null,
    acceptSession: vi.fn(),
    reload: vi.fn(),
    logout: vi.fn(),
  }
}

const routeParams = vi.hoisted(() => ({ accountId: "acct-1" }))

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useParams: () => ({ accountId: routeParams.accountId }) }
})

function renderProfile(accountId = "acct-1") {
  routeParams.accountId = accountId
  return renderPage(<UserProfilePage />, { route: `/user/${accountId}` })
}

beforeEach(() => {
  sessionMocks.useOptionalPlatformSession.mockReturnValue(anonymousSession())
  apiMocks.getNamecardReactions.mockReturnValue({
    send: apiMocks.sendReactions,
  })
  apiMocks.sendReactions.mockResolvedValue({})
  apiMocks.getPublicProfile.mockReturnValue({ send: apiMocks.sendProfile })
  apiMocks.getProfileCards.mockImplementation(() => ({
    send: apiMocks.sendCards,
  }))
  apiMocks.getCardShareLink.mockReturnValue({ send: apiMocks.sendShareLink })
  apiMocks.sendShareLink.mockResolvedValue({ slug: "abcdefghijkl" })
  apiMocks.requestCardExchange.mockResolvedValue({
    exchangeId: "exchange-1",
    status: "completed",
    targetCardNumbers: [202],
    initiatorCardNumbers: [202],
    skipped: [],
    targetMissingCount: 0,
  })
  apiMocks.giftCards.mockResolvedValue({
    exchangeId: "exchange-gift-1",
    status: "completed",
    targetCardNumbers: [],
    initiatorCardNumbers: [202],
    skipped: [],
    targetMissingCount: 0,
  })
  toastMocks.toast.success.mockClear()
  toastMocks.toast.error.mockClear()
  refreshMocks.notifyNamecardDataChanged.mockClear()
})

describe("UserProfilePage", () => {
  it("renders the header and the platform account list", async () => {
    apiMocks.sendProfile.mockResolvedValue(profile())
    apiMocks.sendCards.mockResolvedValue(page())
    renderProfile()

    expect(await screen.findByText("春香P")).toBeTruthy()
    expect(screen.getByText("东京")).toBeTruthy()
    expect(screen.getByText("白天写代码，晚上做名片。")).toBeTruthy()
    expect(screen.getByText(/公开名片 0/)).toBeTruthy()

    // 头像没有图片时回退到名字前两个字。
    expect(
      document.querySelector('[data-slot="avatar-fallback"]')?.textContent
    ).toBe("春香")

    // 主页链接、分组标题与两种账号形态都在。
    expect(
      screen.getByRole("link", { name: "https://example.com" })
    ).toHaveAttribute("href", "https://example.com/")
    expect(screen.getByText("游戏 ID")).toBeTruthy()
    expect(screen.getByText("平台账号")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "复制游戏 ID：765pro" })
    ).toBeTruthy()

    // 外链账号用用户名当标签，图标走 simple-icons 的遮罩。
    const github = screen.getByTitle("GitHub ・ zheizhei")
    expect(within(github).getByText("ZheiZhei")).toBeTruthy()
    const simpleIcon = github.querySelector('span[aria-hidden="true"]')
    expect(simpleIcon?.getAttribute("style")).toContain(
      "cdn.simpleicons.org/github"
    )

    // 后台上传的图标优先于 CDN。
    const mastodon = screen.getByTitle("Mastodon ・ @zheizhei@example.social")
    expect(
      mastodon.querySelector('span[aria-hidden="true"]')?.getAttribute("style")
    ).toContain("/uploads/platform/mastodon.svg")

    // 没有图标的账号不渲染遮罩，标签原样显示纯 ID。
    const discord = screen.getByRole("button", {
      name: "复制Discord：haruka#1234",
    })
    expect(discord.querySelector('span[aria-hidden="true"]')).toBeNull()
    expect(discord.textContent).toContain("haruka#1234")
  })

  it("shows the avatar and card skeletons while the page loads", () => {
    apiMocks.getPublicProfile.mockReturnValue({
      send: () => new Promise(() => undefined),
    })
    apiMocks.getProfileCards.mockReturnValue({
      send: () => new Promise(() => undefined),
    })
    const { container } = renderProfile()

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4)
    expect(screen.queryByText("春香P")).toBeNull()
    expect(screen.queryByText("这位制作人还没有公开的名片。")).toBeNull()
  })

  it("shows the not-found state when the profile request fails", async () => {
    apiMocks.sendProfile.mockRejectedValue(
      new Error("FUDABA_PROFILE_NOT_FOUND")
    )
    apiMocks.sendCards.mockResolvedValue(page())
    renderProfile()

    expect(await screen.findByText("找不到这位制作人")).toBeTruthy()
    expect(
      screen.getByText("主页地址可能拼错了，或者这个帐号已经注销。")
    ).toBeTruthy()
    expect(screen.getByRole("link", { name: "去名片墙看看" })).toHaveAttribute(
      "href",
      "/community/cards"
    )
    expect(screen.queryByText("名片")).toBeNull()
  })

  it("shows the empty state when the producer has no public cards", async () => {
    apiMocks.sendProfile.mockResolvedValue(profile())
    apiMocks.sendCards.mockResolvedValue(page())
    renderProfile()

    expect(await screen.findByText("这位制作人还没有公开的名片。")).toBeTruthy()
    expect(screen.getByText(/共 0 张/)).toBeTruthy()
    expect(screen.getByText(/公开名片 0/)).toBeTruthy()
  })

  it("lays out every page of public cards", async () => {
    apiMocks.sendProfile.mockResolvedValue(profile())
    apiMocks.getProfileCards.mockImplementation(
      (_accountId: string, pageNumber: number) => ({
        send: () =>
          Promise.resolve(
            pageNumber === 1
              ? page({
                  list: [card({ id: 101, cardNumber: 101 })],
                  total: 2,
                  totalPage: 2,
                })
              : page({
                  list: [card({ id: 202, cardNumber: 202 })],
                  total: 2,
                  totalPage: 2,
                })
          ),
      })
    )
    renderProfile()

    expect(
      await screen.findByRole("button", {
        name: "查看制作人名片 101 正面",
      })
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "查看制作人名片 202 正面" })
    ).toBeTruthy()
    expect(screen.getByText(/共 2 张/)).toBeTruthy()
    expect(screen.getByAltText("制作人名片 101 正面").getAttribute("src")).toBe(
      "/cards/front-101.jpg"
    )

    await waitFor(() =>
      expect(apiMocks.getProfileCards).toHaveBeenCalledTimes(2)
    )
    expect(apiMocks.getProfileCards).toHaveBeenNthCalledWith(1, "acct-1", 1, 48)
    expect(apiMocks.getProfileCards).toHaveBeenNthCalledWith(2, "acct-1", 2, 48)
  })

  it("renders only the groups that still have public cards, and no heading for the default one", async () => {
    apiMocks.sendProfile.mockResolvedValue(profile())
    apiMocks.sendCards.mockResolvedValue(
      page({
        list: [
          card({ id: 101, cardNumber: 101, madeOn: "2025" }),
          card({ id: 202, cardNumber: 202, madeOn: "2024-03" }),
        ],
        total: 2,
        totalPage: 1,
        groups: [
          { title: "精选", cardNumbers: [202] },
          // 空组与指向不存在名片的组都不渲染。
          { title: "空组", cardNumbers: [] },
          { title: "缺卡组", cardNumbers: [999] },
        ],
      })
    )
    renderProfile()

    const heading = await screen.findByRole("heading", { name: "精选" })
    expect(within(heading.closest("section")!).getByText("1 张")).toBeTruthy()
    expect(
      within(heading.closest("section")!).getByRole("button", {
        name: "查看制作人名片 202 正面",
      })
    ).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "空组" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "缺卡组" })).toBeNull()
    // 默认分组没有组头：整页只有「精选」一个分组标题。
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1)

    // 布局里没有的卡进默认分组，排在各分组之前。
    expect(
      screen
        .getAllByRole("button", { name: /查看制作人名片/ })
        .map((tile) => tile.getAttribute("aria-label"))
    ).toEqual([
      "查看制作人名片 101 正面",
      "查看制作人名片 202 正面",
    ])
  })

  it("writes the production date on the tile, falling back to the creation time", async () => {
    apiMocks.sendProfile.mockResolvedValue(profile())
    apiMocks.sendCards.mockResolvedValue(
      page({
        list: [
          card({ id: 101, cardNumber: 101, madeOn: "2025" }),
          card({ id: 202, cardNumber: 202, madeOn: "2024-03" }),
          card({ id: 303, cardNumber: 303, madeOn: null }),
        ],
        total: 3,
        totalPage: 1,
      })
    )
    renderProfile()

    // `madeOn` 填到哪显示到哪；没填回退创建时间（Asia/Shanghai）。
    const tiles = await screen.findAllByRole("button", {
      name: /查看制作人名片/,
    })
    expect(within(tiles[0]!.closest("li")!).getByText("2025")).toBeTruthy()
    expect(within(tiles[1]!.closest("li")!).getByText("2024-03")).toBeTruthy()
    expect(
      within(tiles[2]!.closest("li")!).getByText("2026-08-06")
    ).toBeTruthy()
    // 编号只留给无障碍名称，瓦片上不再有「名片 #编号」。
    expect(screen.queryByText(/名片 #\d+/)).toBeNull()
  })

  it("marks only cards with middle pages with the page badge", async () => {
    apiMocks.sendProfile.mockResolvedValue(profile())
    apiMocks.sendCards.mockResolvedValue(
      page({
        list: [
          card({ id: 101, cardNumber: 101, pageCount: 3 }),
          card({ id: 202, cardNumber: 202, pageCount: 2 }),
        ],
        total: 2,
        totalPage: 1,
      })
    )
    renderProfile()

    // 超过两张（有中间页）才标页数，位置在缩略图右上角。
    const three = await screen.findByRole("button", {
      name: "查看制作人名片 101 正面",
    })
    expect(within(three).getByText("3")).toBeTruthy()
    // 两页（正反）不标。
    const two = screen.getByRole("button", {
      name: "查看制作人名片 202 正面",
    })
    expect(within(two).queryByText("2")).toBeNull()
  })

  it("marks the cards the visitor already holds on the tile and in the exchange title", async () => {
    apiMocks.sendProfile.mockResolvedValue(profile())
    apiMocks.sendCards.mockResolvedValue(
      page({
        list: [
          card({ id: 101, cardNumber: 101, collected: true }),
          card({ id: 202, cardNumber: 202 }),
        ],
        total: 2,
        totalPage: 1,
      })
    )
    renderProfile()

    // 浏览者已经拥有 101：缩略图左上角出现「已交换」标记，另一张没有。
    const held = await screen.findByRole("button", {
      name: "查看制作人名片 101 正面",
    })
    expect(within(held).getByLabelText("已交换过这张名片")).toBeTruthy()
    expect(within(held).getByText("已交换")).toBeTruthy()
    const fresh = screen.getByRole("button", {
      name: "查看制作人名片 202 正面",
    })
    expect(within(fresh).queryByLabelText("已交换过这张名片")).toBeNull()
    expect(within(fresh).queryByText("已交换")).toBeNull()

    // 匿名浏览：交换入口仍是 disabled，只是原因不同（已拥有 / 未登录）。
    const exchange = screen.getAllByRole("button", { name: "交换名片" })
    expect(exchange).toHaveLength(2)
    expect(exchange[0]).toBeDisabled()
    expect(exchange[0]).toHaveAttribute("title", "你已经拥有这张名片")
    expect(exchange[1]).toBeDisabled()
    expect(exchange[1]).toHaveAttribute("title", "登录后才能交换")
  })

  it("keeps the owner's own tiles free of the visitor marker", async () => {
    sessionMocks.useOptionalPlatformSession.mockReturnValue({
      ...anonymousSession(),
      status: "authenticated",
      session: { account: { id: "acct-1" } },
    })
    apiMocks.sendProfile.mockResolvedValue(profile())
    apiMocks.sendCards.mockResolvedValue(
      page({
        list: [card({ id: 101, cardNumber: 101, collected: true })],
        total: 1,
        totalPage: 1,
      })
    )
    renderProfile()

    // 看自己的主页时「已交换」是浏览者视角的标记，不出现；【分享】可用（单卡分享入口）。
    const share = await screen.findByRole("button", { name: "分享" })
    expect(share).not.toBeDisabled()
    expect(share.getAttribute("title")).toBeNull()
    expect(screen.queryByLabelText("已交换过这张名片")).toBeNull()
    expect(screen.queryByRole("button", { name: "交换" })).toBeNull()
    // 自己的主页不出现单向送片的入口。
    expect(screen.queryByRole("button", { name: "发送名片" })).toBeNull()
  })

  it("opens the single card share panel with the slug from the owner endpoint", async () => {
    sessionMocks.useOptionalPlatformSession.mockReturnValue({
      ...anonymousSession(),
      status: "authenticated",
      session: { account: { id: "acct-1" } },
    })
    // jsdom 没有 canvas 实现：给一个只记账的 2D 上下文，二维码绘制照常跑完。
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "",
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    apiMocks.sendProfile.mockResolvedValue(profile())
    apiMocks.sendCards.mockResolvedValue(
      page({
        list: [card({ id: 101, cardNumber: 101 })],
        total: 1,
        totalPage: 1,
      })
    )
    renderProfile()

    await userEvent.click(await screen.findByRole("button", { name: "分享" }))

    // 懒加载：只在点了【分享】之后才问属主侧要 slug。
    expect(apiMocks.getCardShareLink).toHaveBeenCalledWith(101)
    expect(
      await screen.findByText(
        `${window.location.origin}/exchange/card/abcdefghijkl`
      )
    ).toBeVisible()
    expect(screen.getByText("分享这张名片")).toBeTruthy()
  })

  it("gives the owner the edit link and share-only card actions", async () => {
    sessionMocks.useOptionalPlatformSession.mockReturnValue({
      ...anonymousSession(),
      status: "authenticated",
      session: { account: { id: "acct-1" } },
    })
    apiMocks.sendProfile.mockResolvedValue(
      profile({ avatarUrl: "/avatars/haruka.png" })
    )
    apiMocks.sendCards.mockResolvedValue(
      page({
        list: [card({ exchangeMode: "none" })],
        total: 1,
        totalPage: 1,
      })
    )
    renderProfile()

    expect(
      await screen.findByRole("link", { name: "编辑资料" })
    ).toHaveAttribute("href", "/account/me")

    const share = screen.getByRole("button", { name: "分享" })
    expect(share).not.toBeDisabled()
    expect(share.getAttribute("title")).toBeNull()
    expect(screen.queryByRole("button", { name: "交换" })).toBeNull()
  })

  it("lets a signed-in visitor open the picker from a tile and commit the request", async () => {
    const user = userEvent.setup()
    sessionMocks.useOptionalPlatformSession.mockReturnValue({
      ...anonymousSession(),
      status: "authenticated",
      session: { account: { id: "acct-9" } },
    })
    apiMocks.sendProfile.mockResolvedValue(profile({ accountId: "acct-2" }))
    apiMocks.sendCards.mockResolvedValue(
      page({
        list: [
          card({
            id: 202,
            cardNumber: 202,
            // 公开卡投影里 `claimerUid` 恒为 null：登录即可用，目标取页面的账号 ID。
            claimerUid: null,
            claimStatus: "claimed",
          }),
        ],
        total: 1,
        totalPage: 1,
      })
    )
    renderProfile("acct-2")

    const exchange = await screen.findByRole("button", { name: "交换名片" })
    expect(exchange).toBeEnabled()
    expect(exchange).not.toHaveAttribute("title")

    await user.click(exchange)

    const picker = screen.getByRole("dialog", { name: "交换名片" })
    expect(within(picker).getByTestId("picker-target")).toHaveTextContent(
      "acct-2"
    )
    // 主页知道账号 ID：只传 `target`，不传卡号。
    expect(
      within(picker).getByTestId("picker-target-card")
    ).toBeEmptyDOMElement()

    await user.click(within(picker).getByRole("button", { name: "确定" }))

    const [cardNumber, body] = apiMocks.requestCardExchange.mock.calls[0] as [
      number,
      { clientExchangeId: string; giveCardNumbers: number[] },
    ]
    expect(cardNumber).toBe(202)
    expect(body.giveCardNumbers).toEqual([202])
    expect(body.clientExchangeId.length).toBeGreaterThanOrEqual(8)
    expect(body.clientExchangeId.length).toBeLessThanOrEqual(64)
  })

  it("lets a signed-in visitor send cards from someone else's profile", async () => {
    const user = userEvent.setup()
    sessionMocks.useOptionalPlatformSession.mockReturnValue({
      ...anonymousSession(),
      status: "authenticated",
      session: { account: { id: "acct-9" } },
    })
    apiMocks.sendProfile.mockResolvedValue(profile({ accountId: "acct-2" }))
    apiMocks.sendCards.mockResolvedValue(
      page({
        list: [card({ id: 202, cardNumber: 202 })],
        total: 1,
        totalPage: 1,
      })
    )
    renderProfile("acct-2")

    await user.click(await screen.findByRole("button", { name: "发送名片" }))

    const picker = screen.getByTestId("exchange-picker")
    expect(picker).toHaveAttribute("data-variant", "gift")
    expect(within(picker).getByTestId("picker-target")).toHaveTextContent(
      "acct-2"
    )
    expect(within(picker).getByTestId("picker-submitting")).toHaveTextContent(
      "false"
    )

    await user.click(within(picker).getByRole("button", { name: "确定" }))

    const [accountId, body] = apiMocks.giftCards.mock.calls[0] as [
      string,
      { clientExchangeId: string; cardNumbers: number[] },
    ]
    expect(accountId).toBe("acct-2")
    expect(body.cardNumbers).toEqual([202])
    expect(body.clientExchangeId.length).toBeGreaterThanOrEqual(8)
    expect(body.clientExchangeId.length).toBeLessThanOrEqual(64)

    // 成功：提示送片文案并广播名片册变更（对方的名片册变了）。
    await waitFor(() =>
      expect(toastMocks.toast.success).toHaveBeenCalledWith("名片已送出")
    )
    expect(refreshMocks.notifyNamecardDataChanged).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.queryByTestId("exchange-picker")).toBeNull()
    )
  })

  it("keeps the detail dialog open when the picker opens from it", async () => {
    const user = userEvent.setup()
    sessionMocks.useOptionalPlatformSession.mockReturnValue({
      ...anonymousSession(),
      status: "authenticated",
      session: { account: { id: "acct-9" } },
    })
    apiMocks.sendProfile.mockResolvedValue(profile({ accountId: "acct-2" }))
    apiMocks.sendCards.mockResolvedValue(
      page({
        list: [
          card({
            id: 202,
            cardNumber: 202,
            claimerUid: null,
            claimStatus: "claimed",
          }),
        ],
        total: 1,
        totalPage: 1,
      })
    )
    renderProfile("acct-2")

    await user.click(
      await screen.findByRole("button", { name: "查看制作人名片 202 正面" })
    )
    const detail = await screen.findByRole("dialog", {
      name: /制作人名片\s*202/,
    })
    const detailExchange = within(detail).getByRole("button", {
      name: "交换名片",
    })
    expect(detailExchange).toBeEnabled()
    await user.click(detailExchange)

    const picker = await screen.findByTestId("exchange-picker")
    expect(within(picker).getByTestId("picker-target")).toHaveTextContent(
      "acct-2"
    )
    // 选卡窗口叠在详情窗之上：详情窗不跟着关（下层被设为 aria-hidden）。
    expect(screen.getByText("全部反应")).toBeInTheDocument()

    await user.click(within(picker).getByText("确定"))

    // 提交结束也不替用户关窗；页面自己刷新列表。
    await waitFor(() => {
      expect(screen.queryByTestId("exchange-picker")).toBeNull()
    })
    expect(
      screen.getByRole("dialog", { name: /制作人名片\s*202/ })
    ).toBeInTheDocument()
  })

  it("offers a visitor disabled exchange buttons and empty-field copy", async () => {
    apiMocks.sendProfile.mockResolvedValue(
      profile({ avatarUrl: null, homeCity: null, bio: "", accounts: [] })
    )
    apiMocks.sendCards.mockResolvedValue(
      page({
        list: [
          card({ id: 101, cardNumber: 101, exchangeMode: "none" }),
          card({ id: 202, cardNumber: 202, exchangeMode: "manual" }),
        ],
        total: 2,
        totalPage: 1,
      })
    )
    renderProfile()

    expect(await screen.findByText("春香P")).toBeTruthy()
    expect(screen.getByText("未填写常驻城市")).toBeTruthy()
    expect(screen.getByText("这位制作人还没有写简介。")).toBeTruthy()
    expect(screen.queryByRole("link", { name: "编辑资料" })).toBeNull()
    expect(screen.queryByText("平台账号")).toBeNull()
    // 未登录没有送片入口。
    expect(screen.queryByRole("button", { name: "发送名片" })).toBeNull()

    const exchange = await screen.findAllByRole("button", {
      name: "交换名片",
    })
    expect(exchange).toHaveLength(2)
    expect(exchange[0]).toBeDisabled()
    expect(exchange[0]).toHaveAttribute("title", "这张名片不接受交换")
    expect(exchange[1]).toBeDisabled()
    expect(exchange[1]).toHaveAttribute("title", "登录后才能交换")
  })

  it("shows the empty-card copy when only the card request fails", async () => {
    apiMocks.sendProfile.mockResolvedValue(profile())
    apiMocks.sendCards.mockRejectedValue(new Error("FUDABA_CARDS_UNAVAILABLE"))
    renderProfile()

    expect(await screen.findByText("这位制作人还没有公开的名片。")).toBeTruthy()
  })
})
