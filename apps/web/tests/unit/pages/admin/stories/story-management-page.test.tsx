import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider } from "react-router"
import { beforeEach, describe, expect, it } from "vitest"

import {
  installFetchMock,
  requestDetails,
} from "@/tests/unit/support/api-client"
import { setCsrfCookie } from "@/tests/unit/support/auth-cookies"
import { StoryManagementPage } from "~/pages/admin/stories"
import type { WikiAdminCatalog, WikiAdminStories } from "~/lib/api"
import { createAdminCatalog } from "@/mocks/data/catalog"

function json(payload: unknown) {
  return Promise.resolve(Response.json(payload))
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
      imageTransform: {
        fit: "cover",
        focalX: 0.5,
        focalY: 0.5,
        zoom: 1,
        rotation: 0,
      },
      mediaRevision: 0,
      idols: [
        {
          id: 10,
          agencyId: 1,
          name: "天海春香",
          folderName: "amami_haruka",
          color: "#e22b30",
          wikiUrl: null,
          textColor: "#ffffff",
          displayOrder: 0,
          imageUrl: "",
          imageFit: "cover",
          imageTransform: {
            fit: "cover",
            focalX: 0.5,
            focalY: 0.5,
            zoom: 1,
            rotation: 0,
          },
          mediaRevision: 0,
          wikiEnabled: true,
          groupIds: [2],
          entryKind: "idol",
          entrySubtype: null,
        },
      ],
      groups: [
        {
          id: 2,
          code: "allstars",
          name: "ALLSTARS",
          color: "#f34f6d",
          iconUrl: null,
          displayOrder: 0,
          isFallback: true,
          idolIds: [10],
          imageTransform: {
            fit: "cover",
            focalX: 0.5,
            focalY: 0.5,
            zoom: 1,
            rotation: 0,
          },
          mediaRevision: 0,
          idols: [
            {
              id: 10,
              agencyId: 1,
              name: "天海春香",
              folderName: "amami_haruka",
              color: "#e22b30",
              wikiUrl: null,
              textColor: "#ffffff",
              displayOrder: 0,
              imageUrl: "",
              imageFit: "cover",
              imageTransform: {
                fit: "cover",
                focalX: 0.5,
                focalY: 0.5,
                zoom: 1,
                rotation: 0,
              },
              mediaRevision: 0,
              wikiEnabled: true,
              groupIds: [2],
              entryKind: "idol",
              entrySubtype: null,
            },
          ],
        },
      ],
    },
  ],
} satisfies WikiAdminCatalog

const stories = {
  status: "success",
  agency: { id: 1, code: "765pro", name: "765PRO", color: "#f34f6d" },
  idol: {
    id: 10,
    agencyId: 1,
    name: "天海春香",
    folderName: "amami_haruka",
    color: "#e22b30",
    wikiUrl: null,
    textColor: "#ffffff",
    displayOrder: 0,
    imageUrl: "",
    imageFit: "cover",
    imageTransform: {
      fit: "cover",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
      rotation: 0,
    },
    mediaRevision: 0,
    entryKind: "idol",
    entrySubtype: null,
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
      imageTransform: {
        fit: "cover",
        focalX: 0.5,
        focalY: 0.5,
        zoom: 1,
        rotation: 0,
      },
      mediaRevision: 7,
      revision: 7,
    },
  ],
  stories: [],
} satisfies WikiAdminStories

describe("StoryManagementPage", () => {
  it("selects a role profile directly and opens its ungrouped story entry by stable ID", async () => {
    const linkedCatalog = structuredClone(catalog)
    const shared = createAdminCatalog()
    const bodyWrites: unknown[] = []
    let linked = false
    let finishLinkedStories: () => void = () => undefined
    const linkedStoriesReady = new Promise<void>((resolve) => {
      finishLinkedStories = () => resolve()
    })
    installFetchMock((...args) => {
      const request = requestDetails(args)
      const url = new URL(request.url, window.location.origin)
      if (url.pathname === "/api/admin/catalog") return json(shared)
      if (url.pathname === "/api/admin/catalog/story-target") {
        bodyWrites.push(JSON.parse(String(request.body)))
        expect(request.headers.get("X-CSRFToken")).toBe("wiki-workbench-test")
        linked = true
        linkedCatalog.agencies[0].idols.push({
          ...linkedCatalog.agencies[0].idols[0],
          id: 55,
          name: "新关联人物",
          folderName: "character_profile_7",
          groupIds: [],
        })
        return json({
          success: true,
          entryId: 55,
          characterId: 20,
          profileId: 7,
          projectId: 1,
          projectCode: "765pro",
        })
      }
      if (url.pathname === "/api/admin/wiki/catalog") return json(linkedCatalog)
      if (url.pathname === "/api/admin/wiki/story-source-catalog")
        return json({
          status: "success",
          contentTypes: [],
          sourcePlatforms: [],
        })
      if (url.pathname.endsWith("/story-cover-assets"))
        return json({
          status: "success",
          agency: { id: 1, code: "765pro", name: "765PRO" },
          assets: [],
        })
      if (url.pathname === "/api/admin/wiki/stories")
        return linked
          ? linkedStoriesReady.then(() =>
              Response.json({
                ...stories,
                idol: { ...stories.idol, id: 55, name: "新关联人物" },
              })
            )
          : json(stories)
      return Promise.reject(new Error(`Unexpected request: ${request.url}`))
    })
    const router = createMemoryRouter(
      [{ path: "/admin/stories", element: <StoryManagementPage /> }],
      { initialEntries: ["/admin/stories?agencyId=1&idolId=10"] }
    )
    render(<RouterProvider router={router} />)
    const user = userEvent.setup()
    await screen.findByRole("textbox", { name: "搜索剧情" })
    await user.click(screen.getByRole("button", { name: "从角色档案选择" }))
    await user.click(
      await screen.findByRole("button", { name: "天海春香 · 本家" })
    )
    await waitFor(() =>
      expect(
        new URLSearchParams(router.state.location.search).get("idolId")
      ).toBe("55")
    )
    expect(bodyWrites).toEqual([{ profileId: 7 }])
    finishLinkedStories()
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "打开公开页" })
      ).toHaveAttribute(
        "href",
        expect.stringContaining(encodeURIComponent("新关联人物"))
      )
    )
  })

  beforeEach(() => {
    setCsrfCookie("legacy", "wiki-workbench-test")
  })

  it("persists outline state in the URL and sends the current card revision", async () => {
    const deleteForms: FormData[] = []
    installFetchMock((...args) => {
      const request = requestDetails(args)
      const url = new URL(request.url, window.location.origin)
      if (url.pathname === "/api/admin/wiki/catalog") return json(catalog)
      if (url.pathname === "/api/admin/wiki/story-source-catalog") {
        return json({
          status: "success",
          contentTypes: [],
          sourcePlatforms: [],
        })
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
    for (const name of [
      "编辑企划",
      "新增企划",
      "新增栏目",
      "新增内容页",
      "编辑内容页",
    ]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
    }
    const manageLink = new URL(
      screen.getByRole("link", { name: "Wiki 条目管理" }).getAttribute("href")!,
      window.location.origin
    )
    expect(manageLink.searchParams.get("idolId")).toBe("10")
    expect(manageLink.searchParams.get("returnTo")).toContain(
      "query=%E7%AC%AC%E4%B8%80&expanded=1"
    )

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
