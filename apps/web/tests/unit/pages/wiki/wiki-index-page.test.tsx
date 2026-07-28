import { render, screen, within } from "@testing-library/react"
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
    bannerTitle: code === "sc" ? "283 Production" : "765PRO ALLSTARS",
    iconUrl: code === "sc" ? "/icon/agencies/6.webp" : null,
    idolCount,
    entryCount: idolCount,
  }
}

function catalogPayload(
  selected: "765PRO" | "闪耀色彩" = "闪耀色彩",
  duplicateIdolAcrossGroups = false,
  includeUngroupedIdol = false
) {
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
          entryKind: "idol" as const,
          entrySubtype: null,
        }
      : {
          id: 6,
          name: "樱木真乃",
          folderName: "sakuragi_mano",
          color: "#f1b0c9",
          imageUrl: "/image/mano.webp",
          imageFit: "cover",
          textColor: "#ffffff",
          entryKind: "idol" as const,
          entrySubtype: null,
        }
  const groups = [
    {
      id: selected === "765PRO" ? 1 : 6,
      code: selected === "765PRO" ? "765pro" : "illumination-stars",
      name: selected === "765PRO" ? "765PRO" : "illumination STARS",
      color: selectedAgency.color,
      iconUrl: null,
      idols: [idol],
    },
  ]
  if (selected === "闪耀色彩" && duplicateIdolAcrossGroups) {
    groups.push({
      id: 7,
      code: "project-luminous",
      name: "Project Luminous",
      color: "#8b5cf6",
      iconUrl: null,
      idols: [idol],
    })
  }

  return {
    status: "success",
    agencies,
    selection: {
      agency: selectedAgency,
      layoutRevision: 0,
      groups,
      ungroupedIdols:
        selected === "闪耀色彩" && includeUngroupedIdol
          ? [
              {
                id: 8,
                name: "浅仓透",
                folderName: "asakura_toru",
                color: "#50d0d0",
                imageUrl: "/image/toru.webp",
                imageFit: "cover",
                textColor: "#111111",
                entryKind: "story" as const,
                entrySubtype: "event" as const,
              },
            ]
          : [],
    },
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

    expect(screen.getByLabelText("正在加载内容目录")).toBeVisible()
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
    ).toHaveAttribute("src", "/icon/agencies/6.webp")
    await user.click(screen.getByRole("tab", { name: /765PRO/ }))
    expect(await screen.findByRole("link", { name: /天海春香/ })).toBeVisible()
    expect(
      screen.getByRole("tab", { name: /765PRO/ }).querySelector("img")
    ).toBeNull()
    expect(
      screen.getByRole("heading", { level: 3, name: "765PRO" })
    ).toBeVisible()

    await user.type(screen.getByLabelText("搜索内容页"), "不存在")
    expect(await screen.findByText("没有匹配的内容页")).toBeVisible()
  })

  it("renders a cross-group idol in every group but counts them once", async () => {
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

    renderWiki()

    const illumination = (
      await screen.findByRole("heading", { name: "illumination STARS" })
    ).closest("section")!
    const luminous = screen
      .getByRole("heading", { name: "Project Luminous" })
      .closest("section")!
    expect(
      within(illumination).getByRole("link", { name: /樱木真乃/ })
    ).toBeVisible()
    expect(
      within(luminous).getByRole("link", { name: /樱木真乃/ })
    ).toBeVisible()

    const summary = screen.getByRole("heading", {
      level: 2,
      name: "闪耀色彩",
    }).parentElement!
    expect(within(summary).getByText("1 个内容页")).toBeVisible()
  })

  it("renders idols without memberships in a final ungrouped section", async () => {
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

    renderWiki()

    const groupedHeading = await screen.findByRole("heading", {
      level: 3,
      name: "illumination STARS",
    })
    const ungroupedHeading = screen.getByRole("heading", {
      level: 3,
      name: "未归档",
    })
    expect(screen.getByRole("link", { name: /浅仓透/ })).toBeVisible()
    expect(screen.getByText("活动")).toBeVisible()
    expect(
      groupedHeading.compareDocumentPosition(ungroupedHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
    const summary = screen.getByRole("heading", {
      level: 2,
      name: "闪耀色彩",
    }).parentElement!
    expect(within(summary).getByText("2 个内容页")).toBeVisible()
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
