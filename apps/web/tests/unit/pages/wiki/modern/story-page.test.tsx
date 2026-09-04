import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { StoryPage } from "~/pages/wiki/modern/story-page"

function storyPayload(
  withCards = true,
  includeCardsWithoutStory = false,
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
      color: "#f1b0c9",
      wikiUrl,
      imageUrl: "/image/mano.webp",
      imageFit: "cover",
      textColor: "#ffffff",
    },
    categories: [
      {
        name: "enzaP卡",
        cards: withCards
          ? [
              {
                id: 401,
                name: "【花风Smiley】",
                img: "/image/story.webp",
                subtitle: "全话",
                links: [
                  {
                    id: 21,
                    up: "投稿者一",
                    title: "卡片剧情",
                    url: "https://www.bilibili.com/video/BV1xx411c7mD",
                    contentType: "剧情",
                    contentTypeIcon: "phone",
                    sourcePlatform: "Bilibili",
                  },
                  {
                    id: 22,
                    up: "投稿者二",
                    title: "另一视角",
                    url: "https://www.bilibili.com/video/BV1xx411c7mE",
                    contentType: "语音",
                    contentTypeIcon: "mic-2",
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
                          id: 23,
                          up: "投稿者三",
                          title: "语音试听",
                          url: "https://www.bilibili.com/video/BV1xx411c7mF",
                          contentType: "语音",
                          contentTypeIcon: "mic-2",
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
            ]
          : [],
      },
    ],
  }
}

function gakumasSCardPayload() {
  return {
    status: "success",
    agency: {
      id: 27,
      code: "gk",
      name: "学园偶像大师",
      color: "#f39800",
    },
    idol: {
      id: 170,
      name: "S卡",
      folderName: "s_card",
      color: "#f39800",
      imageUrl: "/image/gakumas-s-card.webp",
      imageFit: "cover",
      textColor: "#ffffff",
    },
    categories: [
      {
        name: "S卡",
        cards: [
          {
            id: 701,
            name: "【咲季与手毬】",
            img: "",
            subtitle: "出场：咲季，手毬",
            links: [],
          },
          {
            id: 702,
            name: "【只有手毬】",
            img: "",
            subtitle: "出场：手毬",
            links: [],
          },
          {
            id: 703,
            name: "【待补元数据】",
            img: "",
            subtitle: "",
            links: [],
          },
        ],
      },
    ],
  }
}

function renderStory(initialEntry = "/story?agency=闪耀色彩&idol=樱木真乃") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <StoryPage />
    </MemoryRouter>
  )
}

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView"
)

describe("StoryPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    if (scrollIntoViewDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollIntoView",
        scrollIntoViewDescriptor
      )
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
    }
  })

  it("renders grouped cards and multiple sources, then filters them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(storyPayload()))
    )
    const user = userEvent.setup()

    renderStory()

    expect(screen.getByLabelText("正在加载剧情")).toBeVisible()
    expect(
      await screen.findByRole("heading", { name: "樱木真乃" })
    ).toBeVisible()
    expect(
      screen.getByRole("heading", { name: "【花风Smiley】" })
    ).toBeVisible()
    const profile = screen.getByTestId("story-profile-grid")
    expect(profile).toHaveClass(
      "grid-cols-[6.5rem_minmax(0,1fr)]",
      "items-start"
    )
    expect(within(profile).queryByText("其他")).not.toBeInTheDocument()
    expect(
      within(profile).getByRole("link", { name: "闪耀色彩" })
    ).toHaveAttribute(
      "href",
      "/wiki?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9"
    )
    const classicViewLink = within(profile).getByRole("link", {
      name: "经典视图",
    })
    expect(classicViewLink).toHaveAttribute(
      "href",
      "/story/classic?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9&idol=%E6%A8%B1%E6%9C%A8%E7%9C%9F%E4%B9%83"
    )
    expect(classicViewLink.querySelector("img")).toHaveAttribute(
      "src",
      "/brand/wiki-view-switch.png"
    )
    expect(
      within(profile).queryByRole("link", { name: "查看 Wiki" })
    ).not.toBeInTheDocument()
    expect(screen.getByTestId("story-search-bar")).not.toHaveClass("sticky")
    const sidebar = screen.getByTestId("story-navigation-sidebar")
    expect(sidebar).toHaveClass("sticky", "top-20", "lg:block")
    expect(within(sidebar).getByRole("link", { name: "首页" })).toHaveAttribute(
      "href",
      "/"
    )
    expect(
      screen.getByRole("heading", { name: "enzaP卡" }).closest("section")
    ).toHaveClass("scroll-mt-20")

    // Click the card to open the Dialog with links
    await user.click(screen.getByRole("button", { name: /【花风Smiley】/ }))
    expect(screen.getByRole("dialog")).toBeVisible()
    expect(screen.getByRole("link", { name: /卡片剧情/ })).toHaveAttribute(
      "href",
      "https://www.bilibili.com/video/BV1xx411c7mD"
    )
    expect(screen.getByRole("link", { name: /另一视角/ })).toBeVisible()
    expect(screen.getByLabelText("剧情来源")).toBeVisible()
    expect(screen.getByLabelText("语音来源")).toBeVisible()
    await waitFor(() => {
      expect(
        screen
          .getByLabelText("剧情来源")
          .querySelector('[data-lucide-icon="phone"]')
      ).toBeInTheDocument()
    })
    expect(screen.getByText("来源：投稿者一")).toBeVisible()
    expect(screen.getByText("来源：投稿者二")).toBeVisible()

    await user.type(screen.getByTestId("story-primary-search"), "不存在")
    expect(await screen.findByText("没有匹配的剧情")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "清除筛选" }))
    expect(await screen.findByText("【花风Smiley】")).toBeVisible()
  })

  it("shows the configured external Wiki link in the profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            storyPayload(
              true,
              false,
              "https://wiki.example.test/idols/sakuragi-mano"
            )
          )
        )
    )

    renderStory()

    const link = await screen.findByRole("link", { name: "查看 Wiki" })
    expect(link).toHaveAttribute(
      "href",
      "https://wiki.example.test/idols/sakuragi-mano"
    )
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("filters Gakumas S-card stories by cast in the modern view", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(gakumasSCardPayload()))
    )
    const user = userEvent.setup()

    renderStory("/story?agency=学园偶像大师&idol=S卡")

    const filter = await screen.findByRole("region", {
      name: "按登场人物筛选",
    })
    const allButton = within(filter).getByRole("button", {
      name: "全部显示",
    })
    expect(filter).toHaveAttribute(
      "data-temporary-compatibility",
      "subtitle-cast-filter"
    )
    expect(allButton).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("【咲季与手毬】")).toBeVisible()
    expect(screen.getByText("【只有手毬】")).toBeVisible()
    expect(screen.getByText("【待补元数据】")).toBeVisible()

    const sakiButton = within(filter).getByRole("button", {
      name: "花海咲季",
    })
    await user.click(sakiButton)

    expect(sakiButton).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("【咲季与手毬】")).toBeVisible()
    expect(screen.queryByText("【只有手毬】")).not.toBeInTheDocument()
    expect(screen.queryByText("【待补元数据】")).not.toBeInTheDocument()

    await user.type(screen.getByTestId("story-primary-search"), "不存在")
    expect(await screen.findByText("没有匹配的剧情")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "清除筛选" }))

    expect(allButton).toHaveAttribute("aria-pressed", "true")
    expect(await screen.findByText("【只有手毬】")).toBeVisible()
    expect(screen.getByText("【待补元数据】")).toBeVisible()

    const collapseButton = within(filter).getByRole("button", {
      name: "收起登场人物筛选",
    })
    expect(collapseButton).toHaveAttribute("aria-expanded", "true")
    await user.click(collapseButton)
    expect(
      within(filter).getByRole("button", { name: "展开登场人物筛选" })
    ).toHaveAttribute("aria-expanded", "false")
  })

  it("shows the dynamic empty state when no cards are available", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(storyPayload(false)))
    )

    renderStory()

    expect(await screen.findByText("当前没有已收录剧情")).toBeVisible()
  })

  it("uses two mobile columns for landscape cards and three for portrait cards", async () => {
    const payload = storyPayload()
    const landscapeCategory = {
      ...payload.categories[0],
      name: "enza主线",
    }
    const portraitCategory = {
      ...payload.categories[0],
      name: "竖卡",
      cards: payload.categories[0].cards.map((card) => ({
        ...card,
        id: card.id + 100,
        name: `${card.name}竖卡`,
      })),
    }
    payload.categories = [landscapeCategory, portraitCategory]
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload))
    )

    renderStory()

    const landscapeSection = (
      await screen.findByRole("heading", { name: "enza主线" })
    ).closest("section")
    const portraitSection = screen
      .getByRole("heading", { name: "竖卡" })
      .closest("section")
    const landscapeGrid = landscapeSection?.querySelector(
      '[data-card-layout="landscape"]'
    )
    const portraitGrid = portraitSection?.querySelector(
      '[data-card-layout="portrait"]'
    )

    expect(landscapeGrid).toHaveClass(
      "grid-cols-2",
      "sm:grid-cols-(--story-card-columns)"
    )
    expect(portraitGrid).toHaveClass(
      "grid-cols-3",
      "sm:grid-cols-(--story-card-columns)"
    )
  })

  it("focuses, scrolls to, highlights, then clears a linked card", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    })
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(storyPayload()))
    )

    renderStory("/story?agency=闪耀色彩&idol=樱木真乃#story-card-401")

    const target = await screen.findByRole("button", {
      name: /【花风Smiley】/,
    })
    await waitFor(() => expect(target).toHaveFocus())
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      inline: "nearest",
      behavior: "auto",
    })
    expect(target).toHaveAttribute("id", "story-card-401")
    expect(target).toHaveAttribute("data-cover-target", "true")
    expect(target).toHaveClass(
      "ring-3",
      "ring-primary",
      "ring-offset-3",
      "scroll-mt-24"
    )
    await waitFor(
      () => expect(target).not.toHaveAttribute("data-cover-target"),
      { timeout: 2600 }
    )
    expect(target).not.toHaveFocus()
    expect(target).not.toHaveClass("ring-primary", "ring-offset-3")
  })

  it.each([
    ["the hash is absent", "/story?agency=闪耀色彩&idol=樱木真乃"],
    [
      "the card ID does not exist",
      "/story?agency=闪耀色彩&idol=樱木真乃#story-card-999",
    ],
  ])("does not scroll when %s", async (_reason, initialEntry) => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    })
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(storyPayload()))
    )

    renderStory(initialEntry)

    await screen.findByRole("button", { name: /【花风Smiley】/ })
    await act(
      () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    )
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("only keeps cards with story sources in full color", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(storyPayload(true, true)))
    )
    const user = userEvent.setup()

    renderStory()

    const sourcedCard = await screen.findByRole("button", {
      name: /【花风Smiley】/,
    })
    const audioOnlyCard = screen.getByRole("button", {
      name: "【仅语音】，暂无剧情来源",
    })
    const sourcelessCard = screen.getByRole("button", {
      name: "【来源待补】，暂无剧情来源",
    })
    expect(sourcedCard).toHaveAttribute("data-story-state", "available")
    expect(sourcedCard).toHaveClass("border")
    expect(sourcedCard).not.toHaveClass("grayscale", "opacity-60")
    expect(audioOnlyCard).toHaveAttribute("data-story-state", "unavailable")
    expect(audioOnlyCard).toHaveClass("grayscale", "opacity-60")
    expect(sourcelessCard).toHaveAttribute("data-story-state", "unavailable")
    expect(sourcelessCard).toHaveClass("border")
    expect(sourcelessCard).not.toHaveClass("border-2")
    expect(sourcelessCard.style.borderColor).toBe("")
    expect(sourcelessCard.style.color).toBe("")
    expect(sourcelessCard.style.backgroundColor).toBe("")
    expect(sourcelessCard).toHaveClass(
      "grayscale",
      "opacity-60",
      "hover:opacity-80",
      "focus-visible:opacity-80"
    )

    await user.click(audioOnlyCard)
    expect(screen.getByRole("dialog")).toBeVisible()
    expect(screen.getByRole("link", { name: /语音试听/ })).toBeVisible()
  })

  it("opens the mobile navigation and closes it after selection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(storyPayload()))
    )
    const user = userEvent.setup()

    renderStory()

    const trigger = await screen.findByRole("button", {
      name: "打开樱木真乃剧情导航",
    })
    expect(trigger).toHaveClass("fixed", "bottom-4", "left-4", "lg:hidden")

    await user.click(trigger)
    const drawer = screen.getByRole("dialog")
    expect(
      within(drawer).getByRole("heading", {
        name: "樱木真乃 · 快捷导航",
      })
    ).toBeVisible()
    expect(within(drawer).getByRole("link", { name: "首页" })).toHaveAttribute(
      "href",
      "/"
    )
    expect(within(drawer).getByLabelText("快速搜索剧情")).toBeVisible()

    await user.click(within(drawer).getByRole("link", { name: /enzaP卡/ }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })
})
