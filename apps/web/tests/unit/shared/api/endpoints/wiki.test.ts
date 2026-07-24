import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  deleteWikiAgencyIcon,
  deleteWikiCategory,
  deleteWikiStoryGroup,
  getWikiCatalog,
  getWikiRandomBackground,
  getWikiStories,
  getAdminWikiCatalog,
  getAdminWikiStories,
  uploadWikiAgencyIcon,
  updateWikiStory,
} from "~/shared/api/endpoints/wiki"

function requestDetails(call: unknown[]) {
  const [input, init] = call as [RequestInfo | URL, RequestInit | undefined]
  if (input instanceof Request) {
    return {
      body: input.body,
      headers: input.headers,
      method: input.method,
      url: input.url,
    }
  }
  return {
    body: init?.body ?? null,
    headers: new Headers(init?.headers),
    method: init?.method ?? "GET",
    url: String(input),
  }
}

function successResponse(payload: unknown = { status: "success" }) {
  return Response.json(payload)
}

describe("Wiki admin API", () => {
  beforeEach(() => {
    document.cookie = "csrf_token=wiki-api-test; path=/"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("validates the dynamic catalog and selected idol story view", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        successResponse({
          status: "success",
          agencies: [
            {
              id: 1,
              code: "765pro",
              name: "765PRO",
              color: null,
              iconUrl: null,
              idols: [
                {
                  id: 10,
                  name: "天海春香",
                  folderName: "amami_haruka",
                  color: "#e22b30",
                },
              ],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        successResponse({
          status: "success",
          agency: {
            id: 1,
            code: "765pro",
            name: "765PRO",
            color: null,
          },
          idol: {
            id: 10,
            name: "天海春香",
            folderName: "amami_haruka",
            color: "#e22b30",
          },
          categories: ["主线"],
          stories: [
            {
              id: 21,
              category: "主线",
              cardName: "【第一话】",
              upName: "投稿者",
              videoTitle: "第一话",
              url: "https://www.bilibili.com/video/BV1xx411c7mD",
              subtitle: "开场",
              imageFile: null,
              imageUrl: "",
            },
          ],
        })
      )
    vi.stubGlobal("fetch", fetchMock)

    const catalog = await getAdminWikiCatalog().send()
    const stories = await getAdminWikiStories("765PRO", "天海春香").send()

    expect(catalog.agencies[0]?.idols[0]?.name).toBe("天海春香")
    expect(stories.stories[0]?.id).toBe(21)
    const storyRequest = requestDetails(fetchMock.mock.calls[1] ?? [])
    const storyUrl = new URL(storyRequest.url, window.location.origin)
    expect(storyUrl.pathname).toBe("/api/admin/wiki/stories")
    expect(storyUrl.searchParams.get("agency")).toBe("765PRO")
    expect(storyUrl.searchParams.get("idol")).toBe("天海春香")
  })

  it("validates public catalog, grouped stories, and random artwork", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        successResponse({
          status: "success",
          agencies: [
            {
              id: 6,
              code: "sc",
              name: "闪耀色彩",
              color: "#8dbbff",
              iconUrl: "/icon/agencies/sc.webp?v=test",
              idolCount: 1,
            },
          ],
          selection: {
            agency: {
              id: 6,
              code: "sc",
              name: "闪耀色彩",
              color: "#8dbbff",
              iconUrl: "/icon/agencies/sc.webp?v=test",
              idolCount: 1,
            },
            idols: [
              {
                id: 10,
                name: "樱木真乃",
                folderName: "sakuragi_mano",
                color: "#f1b0c9",
                imageUrl: "/image/mano.webp",
                imageFit: "cover",
                textColor: "#ffffff",
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        successResponse({
          status: "success",
          agency: {
            id: 6,
            code: "sc",
            name: "闪耀色彩",
            color: "#8dbbff",
          },
          idol: {
            id: 10,
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
              cards: [
                {
                  name: "【花风Smiley】",
                  img: "/image/story.webp",
                  subtitle: "全话",
                  links: [
                    {
                      id: 21,
                      up: "投稿者",
                      title: "卡片剧情",
                      url: "https://www.bilibili.com/video/BV1xx411c7mD",
                    },
                  ],
                },
              ],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        successResponse({
          url: "/image/background.webp",
          card_name: "【花风Smiley】",
          idol_name: "樱木真乃",
          agency_name: "闪耀色彩",
        })
      )
    vi.stubGlobal("fetch", fetchMock)

    const catalog = await getWikiCatalog("闪耀色彩").send()
    const stories = await getWikiStories("闪耀色彩", "樱木真乃").send()
    const background = await getWikiRandomBackground().send()

    expect(catalog.selection?.idols[0]?.imageFit).toBe("cover")
    expect(stories.categories[0]?.cards[0]?.links[0]?.id).toBe(21)
    expect(background.card_name).toBe("【花风Smiley】")
    const requests = fetchMock.mock.calls.map(
      (call) => new URL(requestDetails(call).url, window.location.origin)
    )
    expect(requests.map((url) => url.pathname)).toEqual([
      "/api/wiki/catalog",
      "/api/wiki/stories",
      "/api/wiki/random_bg",
    ])
    expect(requests[0]?.searchParams.get("agency")).toBe("闪耀色彩")
    expect(requests[1]?.searchParams.get("idol")).toBe("樱木真乃")
  })

  it("sends exact story edits and destructive group operations with CSRF", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(successResponse())
    vi.stubGlobal("fetch", fetchMock)

    await updateWikiStory(
      21,
      { category: "旧分类", cardName: "【旧卡片】" },
      {
        agency: "765PRO",
        idol: "天海春香",
        category: "新分类",
        cardName: "新卡片|特典",
        upName: "投稿者",
        videoTitle: "第二话",
        url: "https://www.bilibili.com/video/BV1xx411c7mD|ignored",
        subtitle: "备注|补充",
      }
    ).send()
    await deleteWikiStoryGroup({
      agency: "765PRO",
      idol: "天海春香",
      category: "新分类",
      cardName: "【新卡片｜特典】",
    }).send()
    await deleteWikiCategory({
      agency: "765PRO",
      idol: "天海春香",
      category: "新分类",
    }).send()

    const requests = fetchMock.mock.calls.map((call) => requestDetails(call))
    expect(requests.map(({ method }) => method)).toEqual([
      "POST",
      "POST",
      "POST",
    ])
    for (const request of requests) {
      expect(request.headers.get("X-CSRFToken")).toBe("wiki-api-test")
      expect(request.body).toBeInstanceOf(FormData)
    }

    const edit = requests[0]?.body as FormData
    expect(edit.get("story_id")).toBe("21")
    expect(edit.get("old_category_name")).toBe("旧分类")
    expect(edit.get("old_card_name")).toBe("【旧卡片】")
    expect(edit.get("category_name")).toBe("新分类")
    expect(edit.get("card_name")).toBe("【新卡片｜特典】")
    expect(edit.get("url")).toBe(
      "https://www.bilibili.com/video/BV1xx411c7mDignored | 备注｜补充"
    )

    const cardDelete = requests[1]?.body as FormData
    expect(cardDelete.get("card_name")).toBe("【新卡片｜特典】")
    const categoryDelete = requests[2]?.body as FormData
    expect(categoryDelete.get("category_name")).toBe("新分类")
  })

  it("uploads and deletes agency icons through the Wiki CSRF boundary", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        successResponse({
          status: "success",
          url: "/icon/agencies/sc.webp?v=test",
        })
      )
      .mockResolvedValueOnce(successResponse())
    vi.stubGlobal("fetch", fetchMock)
    const file = new File(["icon"], "series.png", { type: "image/png" })

    const uploaded = await uploadWikiAgencyIcon("闪耀色彩", file).send()
    await deleteWikiAgencyIcon("闪耀色彩").send()

    expect(uploaded.url).toBe("/icon/agencies/sc.webp?v=test")
    const requests = fetchMock.mock.calls.map((call) => requestDetails(call))
    expect(requests.map(({ method }) => method)).toEqual(["POST", "DELETE"])
    expect(
      requests.map(({ url }) => new URL(url, window.location.origin).pathname)
    ).toEqual(["/api/wiki/agency-icon", "/api/wiki/agency-icon"])
    expect(requests[0]?.headers.get("X-CSRFToken")).toBe("wiki-api-test")
    expect(requests[1]?.headers.get("X-CSRFToken")).toBe("wiki-api-test")
    expect(requests[0]?.body).toBeInstanceOf(FormData)
    const form = requests[0]?.body as FormData
    expect(form.get("agency")).toBe("闪耀色彩")
    expect(form.get("image")).toBe(file)
  })
})
