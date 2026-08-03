import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WikiIndexPage } from "~/pages/wiki/modern/wiki-index-page"

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

function renderWiki(initialEntry = "/wiki/modern?agency=闪耀色彩") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WikiIndexPage />
      <LocationProbe />
    </MemoryRouter>
  )
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location-search">{location.search}</output>
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
          card_id: 401,
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

    const loadingDirectory = screen.getByLabelText("正在加载内容目录")
    expect(loadingDirectory).toBeVisible()
    expect(
      within(loadingDirectory).getAllByTestId("wiki-idol-avatar-skeleton")
    ).toHaveLength(12)
    for (const skeleton of within(loadingDirectory).getAllByTestId(
      "wiki-idol-avatar-skeleton"
    )) {
      expect(skeleton).toHaveClass("aspect-square")
      expect(skeleton).not.toHaveClass("aspect-4/5")
    }
    const manoLink = await screen.findByRole("link", { name: /樱木真乃/ })
    expect(manoLink).toHaveAttribute(
      "href",
      "/story/modern?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9&idol=%E6%A8%B1%E6%9C%A8%E7%9C%9F%E4%B9%83"
    )
    expect(within(manoLink).queryByText("偶像")).not.toBeInTheDocument()
    expect(within(manoLink).getByTestId("wiki-idol-avatar")).toHaveClass(
      "aspect-square"
    )
    expect(within(manoLink).getByTestId("wiki-idol-avatar")).not.toHaveClass(
      "aspect-4/5"
    )
    expect(screen.getByRole("link", { name: "查看对应卡片" })).toHaveAttribute(
      "href",
      "/story/modern?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9&idol=%E6%A8%B1%E6%9C%A8%E7%9C%9F%E4%B9%83#story-card-401"
    )
    const classicViewLink = screen.getByRole("link", { name: "经典视图" })
    expect(classicViewLink).toHaveAttribute(
      "href",
      "/wiki?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9"
    )
    expect(classicViewLink.querySelector("img")).toHaveAttribute(
      "src",
      "/brand/wiki-view-switch.png"
    )
    expect(
      screen.getByRole("heading", { name: "illumination STARS" })
    ).toBeVisible()
    const agencyTabs = screen.getByRole("tablist", { name: "偶像大师企划" })
    expect(
      within(agencyTabs)
        .getByRole("tab", { name: /闪耀色彩/ })
        .querySelector("img")
    ).toHaveAttribute("src", "/icon/agencies/6.webp")
    await user.click(within(agencyTabs).getByRole("tab", { name: /765PRO/ }))
    expect(await screen.findByRole("link", { name: /天海春香/ })).toBeVisible()
    expect(
      within(agencyTabs)
        .getByRole("tab", { name: /765PRO/ })
        .querySelector("img")
    ).toBeNull()
    expect(
      screen.getByRole("heading", { level: 3, name: "765PRO" })
    ).toBeVisible()

    await user.type(screen.getByLabelText("全局搜索内容页"), "不存在")
    expect(await screen.findByText("没有匹配的内容页")).toBeVisible()
  })

  it("lists every cross-agency match as an independent modern story link", async () => {
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

    renderWiki()
    await screen.findByRole("link", { name: /樱木真乃/ })
    await user.type(screen.getByLabelText("全局搜索内容页"), "同名偶像")

    const results = screen.getByRole("navigation", {
      name: "全局搜索结果",
    })
    const links = within(results).getAllByRole("link")
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute(
      "href",
      "/story/modern?agency=765PRO&idol=%E5%90%8C%E5%90%8D%E5%81%B6%E5%83%8F"
    )
    expect(links[1]).toHaveAttribute(
      "href",
      "/story/modern?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9&idol=%E5%90%8C%E5%90%8D%E5%81%B6%E5%83%8F"
    )
  })

  it("keeps the agency rail stable while the next agency loads", async () => {
    const nextCatalog = deferred<Response>()
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          window.location.origin
        )
        if (url.pathname === "/api/wiki/random_bg") {
          return response({ url: "" })
        }
        if (url.searchParams.get("agency") === "765PRO") {
          return nextCatalog.promise
        }
        return response(catalogPayload("闪耀色彩"))
      })
    )
    const user = userEvent.setup()

    renderWiki()

    expect(await screen.findByRole("link", { name: /樱木真乃/ })).toBeVisible()
    const agencyTabs = screen.getByTestId("wiki-agency-tabs")
    const targetAgency = within(agencyTabs).getByRole("tab", {
      name: /765PRO/,
    })
    expect(within(agencyTabs).getAllByRole("tab")).toHaveLength(2)

    await user.click(targetAgency)

    expect(agencyTabs).toHaveAttribute("aria-busy", "true")
    expect(within(agencyTabs).getAllByRole("tab")).toHaveLength(2)
    expect(targetAgency).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "agency=765PRO"
    )

    nextCatalog.resolve(Response.json(catalogPayload("765PRO")))

    expect(await screen.findByRole("link", { name: /天海春香/ })).toBeVisible()
    expect(agencyTabs).toHaveAttribute("aria-busy", "false")
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

  it("filters each agency by group and keeps the selection in the URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          window.location.origin
        )
        return url.pathname === "/api/wiki/random_bg"
          ? response({ url: "" })
          : response(
              catalogPayload(
                url.searchParams.get("agency") === "765PRO"
                  ? "765PRO"
                  : "闪耀色彩",
                true
              )
            )
      })
    )
    const user = userEvent.setup()

    renderWiki()

    const groupTabs = await screen.findByRole("tablist", {
      name: "按组合或分类筛选",
    })
    const allTab = within(groupTabs).getByRole("tab", { name: /全部/ })
    const luminousTab = within(groupTabs).getByRole("tab", {
      name: /Project Luminous/,
    })
    expect(allTab).toHaveAttribute("aria-selected", "true")

    await user.click(luminousTab)

    expect(luminousTab).toHaveAttribute("aria-selected", "true")
    expect(
      screen.queryByRole("heading", { name: "illumination STARS" })
    ).toBeNull()
    expect(
      screen.getByRole("heading", { name: "Project Luminous" })
    ).toBeVisible()
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9&group=7"
    )

    const searchInput = screen.getByLabelText("全局搜索内容页")
    await user.type(searchInput, "不存在")
    expect(await screen.findByText("没有匹配的内容页")).toBeVisible()
    await user.clear(searchInput)
    expect(
      await screen.findByRole("heading", { name: "Project Luminous" })
    ).toBeVisible()

    await user.click(allTab)
    expect(screen.getByTestId("location-search")).not.toHaveTextContent(
      "group="
    )

    await user.click(luminousTab)
    const agencyTabs = screen.getByRole("tablist", { name: "偶像大师企划" })
    await user.click(within(agencyTabs).getByRole("tab", { name: /765PRO/ }))

    expect(await screen.findByRole("link", { name: /天海春香/ })).toBeVisible()
    expect(screen.getByTestId("location-search")).not.toHaveTextContent(
      "group="
    )
  })

  it("filters ungrouped entries and falls back to all for an invalid group", async () => {
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

    renderWiki("/wiki/modern?agency=闪耀色彩&group=999")

    const groupTabs = await screen.findByRole("tablist", {
      name: "按组合或分类筛选",
    })
    expect(
      within(groupTabs).getByRole("tab", { name: /全部/ })
    ).toHaveAttribute("aria-selected", "true")

    await user.click(within(groupTabs).getByRole("tab", { name: /未归档/ }))

    expect(
      screen.queryByRole("heading", { name: "illumination STARS" })
    ).toBeNull()
    expect(screen.getByRole("heading", { name: "未归档" })).toBeVisible()
    expect(screen.getByRole("link", { name: /浅仓透/ })).toBeVisible()
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
    const toruLink = screen.getByRole("link", { name: /浅仓透/ })
    expect(toruLink).toBeVisible()
    expect(within(toruLink).queryByText("活动")).not.toBeInTheDocument()
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
