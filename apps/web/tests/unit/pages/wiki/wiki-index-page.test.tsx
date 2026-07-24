import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WikiIndexPage } from "~/pages/wiki/wiki-index-page"

function response(payload: unknown) {
  return Promise.resolve(Response.json(payload))
}

function agency(
  id: number,
  code: string,
  name: string,
  color: string,
  idolCount = 1
) {
  return {
    id,
    code,
    name,
    color,
    iconUrl: code === "sc" ? "/icon/agencies/sc.webp?v=test" : null,
    idolCount,
  }
}

function catalogPayload(selected: "765PRO" | "闪耀色彩" = "闪耀色彩") {
  const agencies = [
    agency(1, "765", "765PRO", "#f34f6d"),
    agency(6, "sc", "闪耀色彩", "#8dbbff"),
  ]
  const selectedAgency = agencies.find((item) => item.name === selected)!
  const idol =
    selected === "765PRO"
      ? {
          id: 1,
          name: "天海春香",
          folderName: "amami_haruka",
          color: "#e22b30",
          imageUrl: "/image/haruka.webp",
          imageFit: "cover",
          textColor: "#ffffff",
        }
      : {
          id: 6,
          name: "樱木真乃",
          folderName: "sakuragi_mano",
          color: "#f1b0c9",
          imageUrl: "/image/mano.webp",
          imageFit: "cover",
          textColor: "#ffffff",
        }
  return {
    status: "success",
    agencies,
    selection: { agency: selectedAgency, idols: [idol] },
  }
}

function renderWiki(initialEntry = "/wiki?agency=闪耀色彩") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WikiIndexPage />
    </MemoryRouter>
  )
}

describe("WikiIndexPage", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("switches dynamic agencies and filters the selected idol directory", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
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
      if (url.pathname === "/api/wiki/catalog") {
        return response(
          catalogPayload(
            url.searchParams.get("agency") === "765PRO" ? "765PRO" : "闪耀色彩"
          )
        )
      }
      return Promise.reject(new Error(`Unexpected request ${url.pathname}`))
    })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    renderWiki()

    expect(screen.getByLabelText("正在加载角色目录")).toBeVisible()
    expect(
      await screen.findByRole("link", { name: /樱木真乃/ })
    ).toHaveAttribute(
      "href",
      "/story?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9&idol=%E6%A8%B1%E6%9C%A8%E7%9C%9F%E4%B9%83"
    )
    expect(
      screen.getByRole("heading", { name: "illumination STARS" })
    ).toBeVisible()
    expect(
      screen.getByRole("tab", { name: /闪耀色彩/ }).querySelector("img")
    ).toHaveAttribute("src", "/icon/agencies/sc.webp?v=test")
    await user.click(screen.getByRole("tab", { name: /765PRO/ }))
    expect(await screen.findByRole("link", { name: /天海春香/ })).toBeVisible()
    expect(
      screen.getByRole("tab", { name: /765PRO/ }).querySelector("img")
    ).toHaveAttribute("src", "/icon/765pro.webp")
    expect(
      screen.getByRole("heading", { level: 3, name: "765PRO" })
    ).toBeVisible()

    await user.type(screen.getByLabelText("搜索角色"), "不存在")
    expect(await screen.findByText("没有匹配的角色")).toBeVisible()
  })

  it("recovers from an API error", async () => {
    let catalogAttempts = 0
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.origin
      )
      if (url.pathname === "/api/wiki/random_bg") return response({ url: "" })
      catalogAttempts += 1
      return catalogAttempts === 1
        ? Promise.reject(new TypeError("offline"))
        : response(catalogPayload())
    })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    renderWiki()

    expect(await screen.findByText("剧情档案暂时无法加载")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "重新加载" }))
    expect(await screen.findByRole("link", { name: /樱木真乃/ })).toBeVisible()
  })
})
