import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
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
  includeSourcelessCard = false,
  idolColor = "#f1b0c9",
  textColor = "#ffffff"
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
          ...(includeSourcelessCard
            ? [
                {
                  id: 402,
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
    expect(
      within(illuminationSection).getByRole("link", { name: /樱木真乃/ })
    ).toHaveAttribute(
      "href",
      "/story/classic?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9&idol=%E6%A8%B1%E6%9C%A8%E7%9C%9F%E4%B9%83"
    )

    await user.click(screen.getByRole("button", { name: "搜索内容页" }))
    expect(
      screen.getByRole("textbox", { name: "搜索内容页" }).closest("label")
    ).toHaveClass("is-open")
    await user.type(
      screen.getByRole("textbox", { name: "搜索内容页" }),
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
      name: "搜索当前企划内容页",
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

    nextCatalog.resolve(Response.json(catalogPayload("765PRO")))

    expect(
      await screen.findByRole("heading", { name: "765PRO ALLSTARS" })
    ).toBeVisible()
    expect(container.querySelector(".wiki-classic-content")).toHaveAttribute(
      "aria-busy",
      "false"
    )
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
    expect(screen.getByRole("link", { name: /浅仓透/ })).toBeVisible()
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
    await user.click(screen.getByRole("button", { name: /enza主线/ }))
    expect(screen.queryByRole("heading", { name: /特殊剧情/ })).toBeNull()

    await user.click(screen.getByRole("button", { name: /W\.I\.N\.G/ }))
    expect(await screen.findByRole("dialog")).toBeVisible()
    expect(screen.getByRole("link", { name: /卡片剧情/ })).toHaveAttribute(
      "href",
      "https://www.bilibili.com/video/BV1xx411c7mD"
    )
    expect(screen.getByRole("link", { name: /另一视角/ })).toBeVisible()
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

  it("marks only source-free classic cards as faded and keeps them openable", async () => {
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
    const sourcelessCard = screen.getByRole("button", {
      name: "【来源待补】，暂无来源",
    })
    expect(sourcedCard).toHaveAttribute("data-source-state", "available")
    expect(sourcelessCard).toHaveAttribute("data-source-state", "empty")
    expect(sourcelessCard).toHaveClass(
      "wiki-classic-story-card",
      "is-text-only"
    )

    await user.click(sourcelessCard)
    expect(screen.getByRole("dialog")).toBeVisible()
    expect(screen.getByText("暂无可用剧情来源")).toBeVisible()
  })
})
