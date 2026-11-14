import { screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  Namecard,
  NamecardPage,
  PlatformAccountLink,
  PublicProfile,
} from "~/lib/api"
import UserProfilePage from "~/pages/user/profile"
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
      {
        pageId: "front-101",
        role: "front",
        order: 1,
        url: "/cards/front-101.jpg",
        previewUrl: "/cards/front-101.jpg",
        thumbUrl: "/cards/front-101.jpg",
        width: 900,
        height: 500,
      },
      {
        pageId: "back-101",
        role: "back",
        order: 2,
        url: "/cards/back-101.jpg",
        previewUrl: "/cards/back-101.jpg",
        thumbUrl: "/cards/back-101.jpg",
        width: 900,
        height: 500,
      },
    ],
    canEdit: false,
    hasOwner: true,
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
