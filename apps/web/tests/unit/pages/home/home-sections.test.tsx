import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ActivityHighlights } from "~/pages/home/components/activity-highlights"
import { RandomIdol } from "~/pages/home/components/random-idol"
import { SiteSupport } from "~/pages/home/components/site-support"

function randomIdolPayload(
  name = "天海春香",
  agency = "765PRO",
  imageUrl = "/image/765PRO/天海春香/icon.webp"
) {
  return {
    status: "success",
    eligibleCount: 345,
    idol: {
      id: name === "天海春香" ? 1 : 6,
      name,
      color: "#e22b30",
      textColor: "#ffffff",
      imageUrl,
      imageTransform: {
        fit: "cover",
        focalX: 0.35,
        focalY: 0.4,
        zoom: 1.25,
        rotation: 0,
      },
      agency: {
        id: name === "天海春香" ? 1 : 6,
        code: name === "天海春香" ? "765pro" : "sc",
        name: agency,
        color: name === "天海春香" ? "#f34f6d" : "#8dbbff",
      },
    },
  }
}

function stubInformation(
  cards: unknown[],
  randomIdols: unknown[] = [randomIdolPayload()]
) {
  let randomRequest = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const rawUrl = input instanceof Request ? input.url : String(input)
    const url = new URL(rawUrl, window.location.origin)
    const payload =
      url.pathname === "/api/wiki/random_idol"
        ? randomIdols[Math.min(randomRequest++, randomIdols.length - 1)]
        : { cards }
    return new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
    })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function HomeSections() {
  return (
    <MemoryRouter>
      <ActivityHighlights />
      <RandomIdol />
      <SiteSupport />
    </MemoryRouter>
  )
}

describe("home supporting sections", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("renders activity highlights only from the Information API", async () => {
    stubInformation([
      {
        id: "stored-activity-001",
        category: "activity",
        contentType: "external",
        title: "存储中的活动资讯",
        image: "/uploads/information/original/stored.png",
        link: "https://example.com/stored",
        updatedAt: "2026-07-24T00:00:00.000Z",
      },
    ])
    render(<HomeSections />)

    expect(
      screen.getByRole("region", { name: "活动资讯与同人活动" })
    ).toBeVisible()
    expect(
      await screen.findByRole("link", { name: /存储中的活动资讯/ })
    ).toHaveAttribute("href", "https://example.com/stored")
    expect(screen.queryByText("篠泽广研讨会")).not.toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: /雨云|云计算/ })).toHaveLength(3)
  })

  it("shows an empty state instead of code-backed activity fallback data", async () => {
    stubInformation([])
    render(<HomeSections />)

    expect(await screen.findByText("当前没有已发布的活动资讯。")).toBeVisible()
    expect(screen.queryByText("篠泽广研讨会")).not.toBeInTheDocument()
  })

  it("renders Wiki-managed idol artwork and selects another Wiki idol", async () => {
    const fetchMock = stubInformation(
      [],
      [
        randomIdolPayload(),
        randomIdolPayload(
          "樱木真乃",
          "闪耀色彩",
          "/image/闪耀色彩/樱木真乃/icon.webp"
        ),
      ]
    )
    const user = userEvent.setup()
    render(<HomeSections />)

    const initialAvatar = await screen.findByRole("img", {
      name: "天海春香头像",
    })
    expect(initialAvatar).toHaveAttribute(
      "src",
      "/image/765PRO/天海春香/icon.webp"
    )
    expect(initialAvatar).toHaveStyle({
      objectPosition: "35% 40%",
      transform: "rotate(0deg) scale(1.25)",
    })
    expect(screen.getByText("Wiki 收录 · 345 位可抽取偶像")).toBeVisible()
    expect(screen.getByRole("link", { name: "查看剧情档案" })).toHaveAttribute(
      "href",
      "/story?agency=765PRO&idol=%E5%A4%A9%E6%B5%B7%E6%98%A5%E9%A6%99"
    )

    await user.click(screen.getByRole("button", { name: "随机选择" }))

    expect(await screen.findByText("樱木真乃")).toBeVisible()
    expect(screen.getByRole("img", { name: "樱木真乃头像" })).toHaveAttribute(
      "src",
      "/image/闪耀色彩/樱木真乃/icon.webp"
    )
    expect(screen.getByRole("link", { name: "查看剧情档案" })).toHaveAttribute(
      "href",
      "/story?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9&idol=%E6%A8%B1%E6%9C%A8%E7%9C%9F%E4%B9%83"
    )
    expect(
      fetchMock.mock.calls.filter(([input]) => {
        const rawUrl = input instanceof Request ? input.url : String(input)
        return (
          new URL(rawUrl, window.location.origin).pathname ===
          "/api/wiki/random_idol"
        )
      })
    ).toHaveLength(2)
  })
})
