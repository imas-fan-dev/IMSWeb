import { screen, waitFor, within } from "@testing-library/react"
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
  sendProfile: vi.fn(),
  sendCards: vi.fn(),
  sendReactions: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  useOptionalPlatformSession: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getPublicProfile: apiMocks.getPublicProfile,
    getProfileCards: apiMocks.getProfileCards,
    getNamecardReactions: apiMocks.getNamecardReactions,
  }
})

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

    // 交换按钮仍是占位禁用，只有禁用原因换成「已经拥有」。
    const exchange = screen.getAllByRole("button", { name: "交换" })
    expect(exchange).toHaveLength(2)
    expect(exchange[0]).toBeDisabled()
    expect(exchange[0]).toHaveAttribute("title", "你已经拥有这张名片")
    expect(exchange[1]).toBeDisabled()
    expect(exchange[1]).toHaveAttribute("title", "暂未开放")
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

    // 看自己的主页时「已交换」是浏览者视角的标记，不出现，按钮也照旧。
    const share = await screen.findByRole("button", { name: "分享" })
    expect(share).toBeDisabled()
    expect(share).toHaveAttribute("title", "分享功能暂未开放")
    expect(screen.queryByLabelText("已交换过这张名片")).toBeNull()
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
    expect(share).toBeDisabled()
    expect(share).toHaveAttribute("title", "分享功能暂未开放")
    expect(screen.queryByRole("button", { name: "交换" })).toBeNull()
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

    const exchange = await screen.findAllByRole("button", { name: "交换" })
    expect(exchange).toHaveLength(2)
    expect(exchange[0]).toBeDisabled()
    expect(exchange[0]).toHaveAttribute("title", "这张名片不接受交换")
    expect(exchange[1]).toBeDisabled()
    expect(exchange[1]).toHaveAttribute("title", "暂未开放")
  })

  it("shows the empty-card copy when only the card request fails", async () => {
    apiMocks.sendProfile.mockResolvedValue(profile())
    apiMocks.sendCards.mockRejectedValue(new Error("FUDABA_CARDS_UNAVAILABLE"))
    renderProfile()

    expect(await screen.findByText("这位制作人还没有公开的名片。")).toBeTruthy()
  })
})
