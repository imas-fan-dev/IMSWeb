import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { StoryPage } from "~/pages/wiki/story-page"

function storyPayload(withCards = true) {
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
        name: "enzaP卡",
        cards: withCards
          ? [
              {
                name: "【花风Smiley】",
                img: "/image/story.webp",
                subtitle: "全话",
                links: [
                  {
                    id: 21,
                    up: "投稿者一",
                    title: "卡片剧情",
                    url: "https://www.bilibili.com/video/BV1xx411c7mD",
                  },
                  {
                    id: 22,
                    up: "投稿者二",
                    title: "另一视角",
                    url: "https://www.bilibili.com/video/BV1xx411c7mE",
                  },
                ],
              },
            ]
          : [],
      },
    ],
  }
}

function renderStory() {
  return render(
    <MemoryRouter initialEntries={["/story?agency=闪耀色彩&idol=樱木真乃"]}>
      <StoryPage />
    </MemoryRouter>
  )
}

describe("StoryPage", () => {
  afterEach(() => vi.unstubAllGlobals())

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

    // Click the card to open the Dialog with links
    await user.click(
      screen.getByRole("button", { name: /【花风Smiley】/ })
    )
    expect(screen.getByRole("dialog")).toBeVisible()
    expect(screen.getByRole("link", { name: /卡片剧情/ })).toHaveAttribute(
      "href",
      "https://www.bilibili.com/video/BV1xx411c7mD"
    )
    expect(screen.getByRole("link", { name: /另一视角/ })).toBeVisible()

    await user.type(screen.getByLabelText("搜索剧情"), "不存在")
    expect(await screen.findByText("没有匹配的剧情")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "清除搜索词" }))
    expect(await screen.findByText("【花风Smiley】")).toBeVisible()
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
})
