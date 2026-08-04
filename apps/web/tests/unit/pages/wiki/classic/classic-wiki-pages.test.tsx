import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ClassicStoryPage } from "~/pages/wiki/classic/classic-story-page"
import { ClassicWikiPage } from "~/pages/wiki/classic/classic-wiki-page"

function response(payload: unknown) {
  return Promise.resolve(Response.json(payload))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location-search">{location.search}</output>
}

const agencies = [
  {
    id: 1,
    code: "765",
    name: "765PRO",
    color: "#f34f6d",
    bannerTitle: "765PRO ALLSTARS",
    iconUrl: null,
    idolCount: 1,
  },
  {
    id: 6,
    code: "sc",
    name: "闪耀色彩",
    color: "#8dbbff",
    bannerTitle: "283 Production",
    iconUrl: null,
    idolCount: 2,
  },
]

function catalogPayload(
  agencyName = "闪耀色彩",
  duplicateIdolAcrossGroups = false,
  includeUngroupedIdol = false
) {
  const agency = agencies.find((item) => item.name === agencyName)!
  const groups =
    agencyName === "765PRO"
      ? [
          {
            id: 1,
            code: "765pro",
            name: "765PRO",
            color: "#f34f6d",
            iconUrl: null,
            idols: [
              {
                id: 1,
                name: "天海春香",
                folderName: "amami_haruka",
                color: "#e22b30",
                imageUrl: "/image/haruka.webp",
                imageFit: "cover",
                textColor: "#ffffff",
              },
            ],
          },
        ]
      : [
          {
            id: 31,
            code: "illumination-stars",
            name: "illumination STARS",
            color: "#ffd700",
            iconUrl: null,
            idols: [
              {
                id: 6,
                name: "樱木真乃",
                folderName: "sakuragi_mano",
                color: "#f1b0c9",
                imageUrl: "/image/mano.webp",
                imageFit: "cover",
                textColor: "#ffffff",
              },
            ],
          },
          {
            id: 32,
            code: "straylight",
            name: "Straylight",
            color: "#f4bd00",
            iconUrl: null,
            idols: [
              ...(duplicateIdolAcrossGroups
                ? [
                    {
                      id: 6,
                      name: "樱木真乃",
                      folderName: "sakuragi_mano",
                      color: "#f1b0c9",
                      imageUrl: "/image/mano.webp",
                      imageFit: "cover",
                      textColor: "#ffffff",
                    },
                  ]
                : []),
              {
                id: 7,
                name: "芹泽朝日",
                folderName: "serizawa_asahi",
                color: "#f4bd00",
                imageUrl: "/image/asahi.webp",
                imageFit: "cover",
                textColor: "#111111",
              },
            ],
          },
        ]
  return {
    status: "success",
    agencies,
    searchEntries: [
      {
        id: 1,
        name: "天海春香",
        agencyId: agencies[0]!.id,
        agencyCode: agencies[0]!.code,
        agencyName: agencies[0]!.name,
        agencyColor: agencies[0]!.color,
        entryKind: "idol",
        entrySubtype: null,
      },
      {
        id: 6,
        name: "樱木真乃",
        agencyId: agencies[1]!.id,
        agencyCode: agencies[1]!.code,
        agencyName: agencies[1]!.name,
        agencyColor: agencies[1]!.color,
        entryKind: "idol",
        entrySubtype: null,
      },
      {
        id: 91,
        name: "同名偶像",
        agencyId: agencies[0]!.id,
        agencyCode: agencies[0]!.code,
        agencyName: agencies[0]!.name,
        agencyColor: agencies[0]!.color,
        entryKind: "idol",
        entrySubtype: null,
      },
      {
        id: 92,
        name: "同名偶像",
        agencyId: agencies[1]!.id,
        agencyCode: agencies[1]!.code,
        agencyName: agencies[1]!.name,
        agencyColor: agencies[1]!.color,
        entryKind: "idol",
        entrySubtype: null,
      },
    ],
    selection: {
      agency,
      layoutRevision: 0,
      groups,
      ungroupedIdols:
        agencyName === "闪耀色彩" && includeUngroupedIdol
          ? [
              {
                id: 8,
                name: "浅仓透",
                folderName: "asakura_toru",
                color: "#50d0d0",
                imageUrl: "/image/toru.webp",
                imageFit: "cover",
                textColor: "#111111",
              },
            ]
          : [],
    },
  }
}

function storyPayload(
  includeCardsWithoutStory = false,
  idolColor = "#f1b0c9",
  textColor = "#ffffff",
  wikiUrl: string | null = null
) {
  return {
    status: "success",
    agency: {
      id: 6,
      code: "sc",
      name: "闪耀色彩",
      color: "#8dbbff",
    },
    idol: {
      id: 6,
      name: "樱木真乃",
      folderName: "sakuragi_mano",
      color: idolColor,
      wikiUrl,
      imageUrl: "/image/mano.webp",
      imageFit: "cover",
      textColor,
    },
    categories: [
      {
        name: "enza主线",
        cards: [
          {
            id: 401,
            name: "【W.I.N.G.編】",
            img: "/image/wing.webp",
            subtitle: "全话",
            links: [
              {
                id: 1,
                up: "投稿者一",
                title: "卡片剧情",
                url: "https://www.bilibili.com/video/BV1xx411c7mD",
                contentType: "剧情",
                sourcePlatform: "Bilibili",
              },
              {
                id: 2,
                up: "投稿者二",
                title: "另一视角",
                url: "https://www.bilibili.com/video/BV1xx411c7mE",
                contentType: "语音",
                sourcePlatform: "Bilibili",
              },
            ],
          },
          ...(includeCardsWithoutStory
            ? [
                {
                  id: 402,
                  name: "【仅语音】",
                  img: "/image/audio.webp",
                  subtitle: "语音收录",
                  links: [
                    {
                      id: 3,
                      up: "投稿者三",
                      title: "语音试听",
                      url: "https://www.bilibili.com/video/BV1xx411c7mF",
                      contentType: "语音",
                      sourcePlatform: "Bilibili",
                    },
                  ],
                },
                {
                  id: 403,
                  name: "【来源待补】",
                  img: "",
                  subtitle: "待编辑",
                  links: [],
                },
              ]
            : []),
        ],
      },
      { name: "特殊剧情", cards: [] },
    ],
  }
}

function gakumasSCardPayload() {
  return {
    status: "success",
    agency: {
      id: 7,
      code: "gk",
      name: "学园偶像大师",
      color: "#f39800",
    },
    idol: {
      id: 42,
      name: "S卡",
      folderName: "s_card",
      color: "#f39800",
      imageUrl: "/image/s-card.webp",
      imageFit: "cover",
      textColor: "#ffffff",
    },
    categories: [
      {
        name: "S卡",
        cards: [
          {
            id: 501,
            name: "咲季与手毬登场",
            img: "",
            subtitle: "出场：咲季, 手毬",
            links: [],
          },
          {
            id: 502,
            name: "只有手毬登场",
            img: "",
            subtitle: "出场：手毬",
            links: [],
          },
          {
            id: 503,
            name: "尚未登记人物",
            img: "",
            subtitle: "",
            links: [],
          },
        ],
      },
    ],
  }
}

describe("classic Wiki pages", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("keeps the template-style navigation and grouped classic story links", async () => {
    let backgroundRequest = 0
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          window.location.origin
        )
        if (url.pathname === "/api/wiki/random_bg") {
          backgroundRequest += 1
          return response({
            url:
              backgroundRequest === 1
                ? "/image/background.webp"
                : "/image/background-two.webp",
            card_name:
              backgroundRequest === 1 ? "【花风Smiley】" : "【映す光】",
            idol_name: "樱木真乃",
            agency_name: "闪耀色彩",
          })
        }
        return response(
          catalogPayload(
            url.searchParams.get("agency") === "765PRO" ? "765PRO" : "闪耀色彩"
          )
        )
      })
    )
    const user = userEvent.setup()

    const { container } = render(
      <MemoryRouter initialEntries={["/wiki/classic?agency=闪耀色彩"]}>
        <ClassicWikiPage />
      </MemoryRouter>
    )

    expect(
      await screen.findByRole("heading", { name: "illumination STARS" })
    ).toBeVisible()
    expect(screen.getByRole("heading", { name: "Straylight" })).toBeVisible()
    const illuminationSection = screen
      .getByRole("heading", { name: "illumination STARS" })
      .closest("section")!
    const manoLink = within(illuminationSection).getByRole("link", {
      name: /樱木真乃/,
    })
    expect(manoLink).toHaveAttribute(
      "href",
      "/story/classic?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9&idol=%E6%A8%B1%E6%9C%A8%E7%9C%9F%E4%B9%83"
    )
    expect(within(manoLink).queryByText("其他")).not.toBeInTheDocument()
    const desktopViewSwitch = screen.getByRole("link", { name: "新版视图" })
    expect(desktopViewSwitch).toHaveAttribute(
      "href",
      "/wiki?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9"
    )
    expect(desktopViewSwitch.querySelector("img")).toHaveAttribute(
      "src",
      "/brand/wiki-view-switch.png"
    )
    const mobileViewSwitch = screen.getByRole("link", {
      name: "切换到新版视图",
    })
    expect(mobileViewSwitch).toHaveAttribute(
      "href",
      "/wiki?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9"
    )
    expect(mobileViewSwitch.querySelector("img")).toHaveAttribute(
      "src",
      "/brand/wiki-view-switch.png"
    )

    await user.click(screen.getByRole("button", { name: "全局搜索内容页" }))
    expect(
      screen
        .getByRole("textbox", { name: "全局搜索内容页" })
        .closest(".wiki-classic-search")
    ).toHaveClass("is-open")
    await user.type(
      screen.getByRole("textbox", { name: "全局搜索内容页" }),
      "芹泽朝日"
    )
    expect(
      screen.queryByRole("heading", { name: "illumination STARS" })
    ).toBeNull()
    expect(screen.getByRole("link", { name: /芹泽朝日/ })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "切换壁纸" }))
    await waitFor(() => {
      expect(
        container.querySelector(".wiki-classic-background.is-current")
      ).toHaveAttribute("src", "/image/background-two.webp")
    })
    expect(
      container.querySelector(".wiki-classic-background.is-previous")
    ).toHaveAttribute("src", "/image/background.webp")

    const agencyTabs = screen.getByRole("tablist", {
      name: "偶像大师企划",
    })
    const banner = screen
      .getByRole("heading", { name: "283 Production" })
      .closest("header")!
    const mobileSearch = screen.getByRole("textbox", {
      name: "移动端全局搜索内容页",
    })
    const firstGroup = screen
      .getByRole("heading", { name: "Straylight" })
      .closest("section")!
    const mobileBar = container.querySelector<HTMLElement>(
      ".wiki-classic-mobile-bar"
    )!
    const navigationButton = within(mobileBar).getByRole("button", {
      name: "打开企划导航",
    })
    const sidebar = container.querySelector(".wiki-classic-sidebar")!
    expect(navigationButton).toHaveAttribute("aria-expanded", "false")
    expect(sidebar).not.toHaveClass("is-open")
    await user.click(navigationButton)
    expect(navigationButton).toHaveAttribute("aria-expanded", "true")
    expect(sidebar).toHaveClass("is-open")
    expect(
      within(sidebar as HTMLElement).getByRole("link", { name: "返回首页" })
    ).toHaveAttribute("href", "/")
    await user.click(
      within(sidebar as HTMLElement).getByRole("button", {
        name: "关闭企划导航",
      })
    )
    expect(navigationButton).toHaveAttribute("aria-expanded", "false")
    expect(sidebar).not.toHaveClass("is-open")
    expect(agencyTabs).toBeInTheDocument()
    expect(
      banner.compareDocumentPosition(mobileSearch) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
    expect(
      mobileSearch.compareDocumentPosition(firstGroup) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
  })

  it("lists duplicate names from every agency in the classic global search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          window.location.origin
        )
        return url.pathname === "/api/wiki/random_bg"
          ? response({ url: "" })
          : response(catalogPayload())
      })
    )
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={["/wiki/classic?agency=闪耀色彩"]}>
        <ClassicWikiPage />
      </MemoryRouter>
    )
    await screen.findByRole("link", { name: /樱木真乃/ })
    await user.click(screen.getByRole("button", { name: "全局搜索内容页" }))
    await user.type(
      screen.getByRole("textbox", { name: "全局搜索内容页" }),
      "同名偶像"
    )

    const results = screen.getAllByRole("navigation", {
      name: "全局搜索结果",
    })[0]!
    const links = within(results).getAllByRole("link")
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute(
      "href",
      "/story/classic?agency=765PRO&idol=%E5%90%8C%E5%90%8D%E5%81%B6%E5%83%8F"
    )
    expect(links[1]).toHaveAttribute(
      "href",
      "/story/classic?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9&idol=%E5%90%8C%E5%90%8D%E5%81%B6%E5%83%8F"
    )
  })

  it("keeps the current series visible while the next catalog loads", async () => {
    const nextCatalog = deferred<Response>()
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          window.location.origin
        )
        if (url.pathname === "/api/wiki/random_bg") {
          return response({
            url: "/image/background.webp",
            idol_name: "樱木真乃",
            agency_name: "闪耀色彩",
          })
        }
        if (url.searchParams.get("agency") === "765PRO") {
          return nextCatalog.promise
        }
        return response(catalogPayload("闪耀色彩"))
      })
    )
    const user = userEvent.setup()

    const { container } = render(
      <MemoryRouter initialEntries={["/wiki/classic?agency=闪耀色彩"]}>
        <ClassicWikiPage />
      </MemoryRouter>
    )

    expect(
      await screen.findByRole("heading", { name: "illumination STARS" })
    ).toBeVisible()

    await user.click(screen.getByRole("tab", { name: /765PRO/ }))

    expect(
      screen.getByRole("heading", { name: "illumination STARS" })
    ).toBeVisible()
    expect(container.querySelector(".wiki-classic-loading")).toBeNull()
    expect(screen.getByRole("tab", { name: /765PRO/ })).toHaveClass(
      "is-pending"
    )
    expect(screen.getByRole("tab", { name: /765PRO/ })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(container.querySelector(".wiki-classic-content")).toHaveAttribute(
      "aria-busy",
      "true"
    )
    const pendingGroupTabs = screen.getByRole("tablist", {
      name: "按组合或分类筛选",
    })
    for (const tab of within(pendingGroupTabs).getAllByRole("tab")) {
      expect(tab).toBeDisabled()
    }

    nextCatalog.resolve(Response.json(catalogPayload("765PRO")))

    expect(
      await screen.findByRole("heading", { name: "765PRO ALLSTARS" })
    ).toBeVisible()
    expect(container.querySelector(".wiki-classic-content")).toHaveAttribute(
      "aria-busy",
      "false"
    )
    expect(
      within(
        screen.getByRole("tablist", { name: "按组合或分类筛选" })
      ).getByRole("tab", { name: /全部/ })
    ).toBeEnabled()
  })

  it("keeps a cross-group idol in both classic groups without inflating the total", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          window.location.origin
        )
        return url.pathname === "/api/wiki/random_bg"
          ? response({ url: "" })
          : response(catalogPayload("闪耀色彩", true))
      })
    )

    render(
      <MemoryRouter initialEntries={["/wiki/classic?agency=闪耀色彩"]}>
        <ClassicWikiPage />
      </MemoryRouter>
    )

    const illumination = (
      await screen.findByRole("heading", { name: "illumination STARS" })
    ).closest("section")!
    const straylight = screen
      .getByRole("heading", { name: "Straylight" })
      .closest("section")!
    expect(
      within(illumination).getByRole("link", { name: /樱木真乃/ })
    ).toBeVisible()
    expect(
      within(straylight).getByRole("link", { name: /樱木真乃/ })
    ).toBeVisible()

    const banner = screen
      .getByRole("heading", { level: 1, name: "283 Production" })
      .closest("header")!
    expect(within(banner).getByText("2 个内容页")).toBeVisible()
  })

  it("filters the classic directory from the group bar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          window.location.origin
        )
        return url.pathname === "/api/wiki/random_bg"
          ? response({ url: "" })
          : response(catalogPayload("闪耀色彩", false, true))
      })
    )
    const user = userEvent.setup()

    render(
      <MemoryRouter
        initialEntries={["/wiki/classic?agency=闪耀色彩&group=999"]}
      >
        <ClassicWikiPage />
        <LocationProbe />
      </MemoryRouter>
    )

    const banner = (
      await screen.findByRole("heading", { name: "283 Production" })
    ).closest("header")!
    const groupTabs = screen.getByRole("tablist", {
      name: "按组合或分类筛选",
    })
    const filterBar = groupTabs.closest("section")!
    const allTab = within(groupTabs).getByRole("tab", { name: /全部/ })
    const straylightTab = within(groupTabs).getByRole("tab", {
      name: /Straylight/,
    })

    expect(allTab).toHaveAttribute("aria-selected", "true")
    expect(
      banner.compareDocumentPosition(filterBar) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)

    await user.click(straylightTab)

    expect(straylightTab).toHaveAttribute("aria-selected", "true")
    expect(
      screen.queryByRole("heading", { name: "illumination STARS" })
    ).toBeNull()
    expect(screen.getByRole("heading", { name: "Straylight" })).toBeVisible()
    expect(screen.getByRole("link", { name: /芹泽朝日/ })).toBeVisible()
    expect(screen.getByTestId("location-search")).toHaveTextContent("group=32")

    await user.click(within(groupTabs).getByRole("tab", { name: /未归档/ }))

    expect(screen.queryByRole("heading", { name: "Straylight" })).toBeNull()
    expect(screen.getByRole("heading", { name: "未归档" })).toBeVisible()
    expect(screen.getByRole("link", { name: /浅仓透/ })).toBeVisible()

    await user.click(allTab)

    expect(
      screen.getByRole("heading", { name: "illumination STARS" })
    ).toBeVisible()
    expect(screen.getByRole("heading", { name: "Straylight" })).toBeVisible()
    expect(screen.getByTestId("location-search")).not.toHaveTextContent(
      "group="
    )
  })

  it("places ungrouped idols after every configured classic group", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          window.location.origin
        )
        return url.pathname === "/api/wiki/random_bg"
          ? response({ url: "" })
          : response(catalogPayload("闪耀色彩", false, true))
      })
    )

    render(
      <MemoryRouter initialEntries={["/wiki/classic?agency=闪耀色彩"]}>
        <ClassicWikiPage />
      </MemoryRouter>
    )

    const straylightHeading = await screen.findByRole("heading", {
      name: "Straylight",
    })
    const ungroupedHeading = screen.getByRole("heading", { name: "未归档" })
    const toruLink = screen.getByRole("link", { name: /浅仓透/ })
    expect(toruLink).toBeVisible()
    expect(within(toruLink).queryByText("其他")).not.toBeInTheDocument()
    expect(
      straylightHeading.compareDocumentPosition(ungroupedHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
  })

  it("filters classic categories and opens every dynamic story source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(storyPayload()))
    )
    const user = userEvent.setup()

    render(
      <MemoryRouter
        initialEntries={["/story/classic?agency=闪耀色彩&idol=樱木真乃"]}
      >
        <ClassicStoryPage />
      </MemoryRouter>
    )

    expect(
      await screen.findByRole("heading", { name: "樱木真乃" })
    ).toBeVisible()
    expect(screen.getByText("SC ARCHIVE")).toBeVisible()
    expect(screen.queryByText("其他")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("region", { name: "出场偶像快速筛选" })
    ).not.toBeInTheDocument()
    const modernViewLink = screen.getByRole("link", { name: "新版视图" })
    expect(modernViewLink).toHaveAttribute(
      "href",
      "/story?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9&idol=%E6%A8%B1%E6%9C%A8%E7%9C%9F%E4%B9%83"
    )
    expect(modernViewLink.querySelector("img")).toHaveAttribute(
      "src",
      "/brand/wiki-view-switch.png"
    )
    expect(
      screen.queryByRole("link", { name: "查看 Wiki" })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /enza主线/ }))
    expect(screen.queryByRole("heading", { name: /特殊剧情/ })).toBeNull()

    await user.click(screen.getByRole("button", { name: /W\.I\.N\.G/ }))
    expect(await screen.findByRole("dialog")).toBeVisible()
    expect(screen.getByRole("link", { name: /卡片剧情/ })).toHaveAttribute(
      "href",
      "https://www.bilibili.com/video/BV1xx411c7mD"
    )
    expect(screen.getByLabelText("剧情来源")).toBeVisible()
    expect(screen.getByLabelText("语音来源")).toBeVisible()
    expect(screen.getByRole("link", { name: /另一视角/ })).toBeVisible()
    expect(screen.getByText("剧情", { selector: "span" })).toBeVisible()
    expect(screen.getByText("语音", { selector: "span" })).toBeVisible()
    expect(screen.getAllByText("Bilibili", { selector: "span" })).toHaveLength(
      2
    )
    expect(screen.getByText("来源：投稿者一")).toBeVisible()
    expect(screen.getByText("来源：投稿者二")).toBeVisible()
  })

  it("shows the configured external Wiki link in the classic profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            storyPayload(
              false,
              "#f1b0c9",
              "#ffffff",
              "https://wiki.example.test/idols/sakuragi-mano"
            )
          )
        )
    )

    render(
      <MemoryRouter
        initialEntries={["/story/classic?agency=闪耀色彩&idol=樱木真乃"]}
      >
        <ClassicStoryPage />
      </MemoryRouter>
    )

    const link = await screen.findByRole("link", { name: "查看 Wiki" })
    expect(link).toHaveAttribute(
      "href",
      "https://wiki.example.test/idols/sakuragi-mano"
    )
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("temporarily filters Gakumas S cards by cast encoded in subtitles", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(gakumasSCardPayload()))
    )
    const user = userEvent.setup()

    render(
      <MemoryRouter
        initialEntries={["/story/classic?agency=学园偶像大师&idol=S卡"]}
      >
        <ClassicStoryPage />
      </MemoryRouter>
    )

    expect(
      await screen.findByRole("region", { name: "出场偶像快速筛选" })
    ).toBeVisible()
    expect(
      screen.queryByRole("navigation", { name: "剧情分类" })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "花海咲季" }))
    expect(screen.getByText("咲季与手毬登场")).toBeVisible()
    expect(screen.queryByText("只有手毬登场")).not.toBeInTheDocument()
    expect(screen.queryByText("尚未登记人物")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "全部显示" }))
    expect(screen.getByText("只有手毬登场")).toBeVisible()
    expect(screen.getByText("尚未登记人物")).toBeVisible()

    const toggle = screen.getByRole("button", {
      name: /出场偶像快速筛选/,
    })
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByRole("button", { name: "花海咲季" })
    ).not.toBeInTheDocument()
  })

  it("derives readable classic story colors from a pale idol accent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(storyPayload(false, "#dffaff", "#ffffff"))
        )
    )

    const { container } = render(
      <MemoryRouter
        initialEntries={["/story/classic?agency=闪耀色彩&idol=樱木真乃"]}
      >
        <ClassicStoryPage />
      </MemoryRouter>
    )

    expect(
      await screen.findByRole("heading", { name: "樱木真乃" })
    ).toBeVisible()
    const shell = container.querySelector<HTMLElement>(
      ".wiki-classic-story-shell"
    )!
    expect(shell.style.getPropertyValue("--classic-story-color")).toBe(
      "#dffaff"
    )
    expect(shell.style.getPropertyValue("--classic-story-ink")).not.toBe(
      "#dffaff"
    )
    expect(shell.style.getPropertyValue("--classic-story-on-color")).toBe(
      "#202126"
    )
  })

  it("only keeps classic cards with story sources in full color", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(storyPayload(true)))
    )
    const user = userEvent.setup()

    render(
      <MemoryRouter
        initialEntries={["/story/classic?agency=闪耀色彩&idol=樱木真乃"]}
      >
        <ClassicStoryPage />
      </MemoryRouter>
    )

    const sourcedCard = await screen.findByRole("button", {
      name: /W\.I\.N\.G/,
    })
    const audioOnlyCard = screen.getByRole("button", {
      name: "【仅语音】，暂无剧情来源",
    })
    const sourcelessCard = screen.getByRole("button", {
      name: "【来源待补】，暂无剧情来源",
    })
    expect(sourcedCard).toHaveAttribute("data-story-state", "available")
    expect(audioOnlyCard).toHaveAttribute("data-story-state", "unavailable")
    expect(sourcelessCard).toHaveAttribute("data-story-state", "unavailable")
    expect(sourcelessCard).toHaveClass(
      "wiki-classic-story-card",
      "is-text-only"
    )

    await user.click(audioOnlyCard)
    expect(screen.getByRole("dialog")).toBeVisible()
    expect(screen.getByRole("link", { name: /语音试听/ })).toBeVisible()
  })
})
