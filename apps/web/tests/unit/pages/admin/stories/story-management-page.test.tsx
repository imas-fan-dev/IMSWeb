import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { StoryManagementPage } from "~/pages/admin/stories"

function json(payload: unknown) {
  return Promise.resolve(Response.json(payload))
}

function requestDetails(call: unknown[]) {
  const [input, init] = call as [RequestInfo | URL, RequestInit | undefined]
  return input instanceof Request
    ? { body: input.body, method: input.method, url: input.url }
    : {
        body: init?.body ?? null,
        method: init?.method ?? "GET",
        url: String(input),
      }
}

const catalog = {
  status: "success",
  agencies: [
    {
      id: 1,
      code: "765pro",
      name: "765PRO",
      color: "#f34f6d",
      wikiEnabled: true,
      bannerTitle: "765PRO ALLSTARS",
      displayOrder: 0,
      layoutRevision: 0,
      iconUrl: null,
      groups: [
        {
          id: 2,
          code: "allstars",
          name: "ALLSTARS",
          color: "#f34f6d",
          iconUrl: null,
          displayOrder: 0,
          isFallback: true,
          idols: [
            {
              id: 10,
              name: "天海春香",
              folderName: "amami_haruka",
              color: "#e22b30",
              textColor: "#ffffff",
              displayOrder: 0,
              imageUrl: "",
              imageFit: "cover",
            },
          ],
        },
      ],
    },
  ],
}

const stories = {
  status: "success",
  agency: { id: 1, code: "765pro", name: "765PRO", color: "#f34f6d" },
  idol: {
    id: 10,
    name: "天海春香",
    folderName: "amami_haruka",
    color: "#e22b30",
    textColor: "#ffffff",
    displayOrder: 0,
    imageUrl: "",
    imageFit: "cover",
  },
  categories: [
    {
      id: 1,
      name: "主线",
      storageSlug: "main",
      displayOrder: 0,
      showWhenEmpty: true,
      backgroundEligible: false,
      revision: 5,
    },
  ],
  contentTypes: [],
  sourcePlatforms: [],
  cards: [
    {
      cardId: 20,
      category: "主线",
      cardName: "【第一话】",
      subtitle: "开场",
      imageFile: null,
      imageUrl: "",
      mediaRevision: 7,
      revision: 7,
    },
  ],
  stories: [],
}

describe("StoryManagementPage", () => {
  beforeEach(() => {
    document.cookie = "csrf_token=wiki-workbench-test; path=/"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("persists outline state in the URL and sends the current card revision", async () => {
    const deleteForms: FormData[] = []
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((...args) => {
      const request = requestDetails(args)
      const url = new URL(request.url, window.location.origin)
      if (url.pathname === "/api/admin/wiki/catalog") return json(catalog)
      if (url.pathname === "/api/admin/wiki/story-source-catalog") {
        return json({ status: "success", contentTypes: [], sourcePlatforms: [] })
      }
      if (url.pathname.endsWith("/story-cover-assets")) {
        return json({
          status: "success",
          agency: { id: 1, code: "765pro", name: "765PRO" },
          assets: [],
        })
      }
      if (url.pathname === "/api/admin/wiki/stories") return json(stories)
      if (url.pathname === "/api/wiki/delete_story") {
        deleteForms.push(request.body as FormData)
        return json({ status: "success" })
      }
      return Promise.reject(new Error(`Unexpected request: ${request.url}`))
    })
    vi.stubGlobal("fetch", fetchMock)
    const router = createMemoryRouter(
      [{ path: "/admin/stories", element: <StoryManagementPage /> }],
      {
        initialEntries: [
          "/admin/stories?agencyId=1&idolId=10&query=%E7%AC%AC%E4%B8%80&expanded=1",
        ],
      }
    )
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    const search = await screen.findByRole("textbox", { name: "搜索剧情" })
    expect(search).toHaveValue("第一")
    expect(screen.getByText("【第一话】")).toBeVisible()

    await user.clear(search)
    await user.type(search, "开场")
    await waitFor(() => {
      expect(router.state.location.search).toContain(
        `query=${encodeURIComponent("开场")}`
      )
    })

    await user.click(
      screen.getByRole("button", { name: "删除卡片 【第一话】" })
    )
    await user.click(screen.getByRole("button", { name: "确认删除" }))
    await waitFor(() => expect(deleteForms).toHaveLength(1))
    expect(deleteForms[0]?.get("expected_revision")).toBe("7")
  })
})
