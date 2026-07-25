import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ClassicStoryPage } from "~/pages/wiki/classic-story-page"
import { ClassicWikiPage } from "~/pages/wiki/classic-wiki-page"

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

function catalogPayload(agencyName = "闪耀色彩") {
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
    selection: { agency, layoutRevision: 0, groups },
  }
}

function storyPayload() {
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
      color: "#f1b0c9",
      imageUrl: "/image/mano.webp",
      imageFit: "cover",
      textColor: "#ffffff",
    },
    categories: [
      {
        name: "enza主线",
        cards: [
          {
            name: "【W.I.N.G.編】",
            img: "/image/wing.webp",
            subtitle: "全话",
            links: [
              {
                id: 1,
                up: "投稿者一",
                title: "卡片剧情",
                url: "https://www.bilibili.com/video/BV1xx411c7mD",
              },
              {
                id: 2,
                up: "投稿者二",
                title: "另一视角",
                url: "https://www.bilibili.com/video/BV1xx411c7mE",
              },
            ],
          },
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

    await user.click(screen.getByRole("button", { name: "搜索角色" }))
    expect(
      screen.getByRole("textbox", { name: "搜索角色" }).closest("label")
    ).toHaveClass("is-open")
    await user.type(
      screen.getByRole("textbox", { name: "搜索角色" }),
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

    await user.click(screen.getByRole("button", { name: "打开企划导航" }))
    expect(screen.getByRole("complementary", { name: "企划导航" })).toHaveClass(
      "is-open"
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

    await user.click(screen.getByRole("button", { name: /765PRO/ }))

    expect(
      screen.getByRole("heading", { name: "illumination STARS" })
    ).toBeVisible()
    expect(container.querySelector(".wiki-classic-loading")).toBeNull()
    expect(screen.getByRole("button", { name: /765PRO/ })).toHaveClass(
      "is-pending"
    )
    expect(screen.getByRole("button", { name: /765PRO/ })).toHaveAttribute(
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
})
