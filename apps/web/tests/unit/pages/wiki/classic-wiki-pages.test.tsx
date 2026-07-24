import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ClassicStoryPage } from "~/pages/wiki/classic-story-page"
import { ClassicWikiPage } from "~/pages/wiki/classic-wiki-page"

function response(payload: unknown) {
  return Promise.resolve(Response.json(payload))
}

const agencies = [
  {
    id: 1,
    code: "765",
    name: "765PRO",
    color: "#f34f6d",
    iconUrl: null,
    idolCount: 1,
  },
  {
    id: 6,
    code: "sc",
    name: "闪耀色彩",
    color: "#8dbbff",
    iconUrl: null,
    idolCount: 2,
  },
]

function catalogPayload(agencyName = "闪耀色彩") {
  const agency = agencies.find((item) => item.name === agencyName)!
  const idols =
    agencyName === "765PRO"
      ? [
          {
            id: 1,
            name: "天海春香",
            folderName: "amami_haruka",
            color: "#e22b30",
            imageUrl: "/image/haruka.webp",
            imageFit: "cover",
            textColor: "#ffffff",
          },
        ]
      : [
          {
            id: 6,
            name: "樱木真乃",
            folderName: "sakuragi_mano",
            color: "#f1b0c9",
            imageUrl: "/image/mano.webp",
            imageFit: "cover",
            textColor: "#ffffff",
          },
          {
            id: 7,
            name: "芹泽朝日",
            folderName: "serizawa_asahi",
            color: "#f4bd00",
            imageUrl: "/image/asahi.webp",
            imageFit: "cover",
            textColor: "#111111",
          },
        ]
  return { status: "success", agencies, selection: { agency, idols } }
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
            card_name: "【花风Smiley】",
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

    render(
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
    await user.type(
      screen.getByRole("textbox", { name: "搜索角色" }),
      "芹泽朝日"
    )
    expect(
      screen.queryByRole("heading", { name: "illumination STARS" })
    ).toBeNull()
    expect(screen.getByRole("link", { name: /芹泽朝日/ })).toBeVisible()
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
