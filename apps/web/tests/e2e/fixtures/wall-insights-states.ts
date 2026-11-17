import {
  namecardContributorsQuerySchema,
  namecardContributorsSchema,
  namecardErrorResponseSchema,
  type WallInsights,
  type WallInsightContributor,
} from "@imsweb/contracts/namecards"
import { apiPath } from "@imsweb/contracts/paths"
import type { Page } from "@playwright/test"
import type { ApiDispatcher } from "./api-dispatcher"
import { mockNamecardBrowsing } from "./namecard-browsing"
import { installPlatformSessionMock } from "./platform-auth"

export const wallInsightStates = [
  {
    id: "panel-low",
    pageId: "wall-panel",
    title: "少量贡献 · 0.1% / 0.5% 与两位贡献者",
  },
  { id: "panel-tiny", pageId: "wall-panel", title: "极低进度 · 小于 0.1%" },
  {
    id: "panel-pending",
    pageId: "wall-panel",
    title: "维护进行中 · 两类待审数量",
  },
  { id: "panel-complete", pageId: "wall-panel", title: "全部完成 · 100% 进度" },
  {
    id: "panel-empty",
    pageId: "wall-panel",
    title: "空名片墙 · 零分母与空贡献榜",
  },
  {
    id: "panel-anonymous",
    pageId: "wall-panel",
    title: "未登录 · 贡献榜与登录提示",
  },
  {
    id: "panel-unranked",
    pageId: "wall-panel",
    title: "已登录 · 尚未取得贡献值",
  },
  {
    id: "panel-outside-top",
    pageId: "wall-panel",
    title: "个人排名在预览之外 · 第 32 名",
  },
  {
    id: "panel-long",
    pageId: "wall-panel",
    title: "长用户名 · 大贡献值与并列积分",
  },
  {
    id: "panel-collapsed",
    pageId: "wall-panel",
    title: "收起状态 · 记忆选择与重新展开",
  },
  { id: "panel-loading", pageId: "wall-panel", title: "维护摘要加载中" },
  {
    id: "panel-error",
    pageId: "wall-panel",
    title: "维护摘要失败 · 当前面板隐藏",
  },
  {
    id: "dialog-first",
    pageId: "leaderboard-dialog",
    title: "完整榜单 · 首页面与个人高亮",
  },
  {
    id: "dialog-middle",
    pageId: "leaderboard-dialog",
    title: "完整榜单 · 中间页与全局序号",
  },
  {
    id: "dialog-last",
    pageId: "leaderboard-dialog",
    title: "完整榜单 · 尾页与翻页边界",
  },
  {
    id: "dialog-short",
    pageId: "leaderboard-dialog",
    title: "完整榜单 · 仅两位贡献者",
  },
  {
    id: "dialog-empty",
    pageId: "leaderboard-dialog",
    title: "完整榜单 · 无贡献记录",
  },
  {
    id: "dialog-loading",
    pageId: "leaderboard-dialog",
    title: "完整榜单 · 加载中",
  },
  {
    id: "dialog-error",
    pageId: "leaderboard-dialog",
    title: "完整榜单 · 首次加载失败",
  },
  {
    id: "dialog-retry",
    pageId: "leaderboard-dialog",
    title: "完整榜单 · 失败后重试成功",
  },
  {
    id: "dialog-page-error",
    pageId: "leaderboard-dialog",
    title: "完整榜单 · 第二页加载失败",
  },
  {
    id: "dialog-page-empty",
    pageId: "leaderboard-dialog",
    title: "完整榜单 · 翻页后数据减少为空",
  },
] as const

export type WallInsightState = (typeof wallInsightStates)[number]

const shortLeaders: WallInsightContributor[] = [
  { accountId: "zhei", displayName: "ZheiZhei", points: 2, cards: 2 },
  { accountId: "texas", displayName: "TexasOct", points: 1, cards: 1 },
]

function leaders(): WallInsightContributor[] {
  return Array.from({ length: 63 }, (_, index) => ({
    accountId: index === 1 ? "texas" : "producer-" + (index + 1),
    displayName:
      index === 0
        ? "ZheiZhei"
        : index === 1
          ? "TexasOct"
          : "名片维护制作人 " + (index + 1),
    points: 630 - index * 7,
    cards: 126 - index,
  }))
}

export async function prepareWallInsightState(
  page: Page,
  api: ApiDispatcher,
  state: WallInsightState
) {
  const contributors = leaders()
  const summary: WallInsights = {
    guestTotal: 831,
    ownerless: 830,
    ownerlessMissingSeries: 827,
    claimed: 1,
    claimsPending: 0,
    supplemented: 4,
    supplementsPending: 0,
    contributors: contributors.slice(0, 5),
    viewer: {
      accountId: "texas",
      displayName: "TexasOct",
      points: 623,
      rank: 2,
    },
  }
  switch (state.id) {
    case "panel-low":
      summary.contributors = shortLeaders
      summary.viewer = {
        accountId: "texas",
        displayName: "TexasOct",
        points: 1,
        rank: 2,
      }
      break
    case "panel-tiny":
      summary.guestTotal = 12000
      summary.claimed = 1
      summary.supplemented = 4
      break
    case "panel-pending":
      summary.claimed = 316
      summary.supplemented = 540
      summary.claimsPending = 4
      summary.supplementsPending = 7
      break
    case "panel-complete":
      summary.claimed = 831
      summary.supplemented = 831
      summary.ownerless = 0
      summary.ownerlessMissingSeries = 0
      break
    case "panel-empty":
      Object.assign(summary, {
        guestTotal: 0,
        ownerless: 0,
        ownerlessMissingSeries: 0,
        claimed: 0,
        supplemented: 0,
        contributors: [],
        viewer: null,
      })
      break
    case "panel-anonymous":
      summary.viewer = null
      break
    case "panel-unranked":
      summary.viewer = {
        accountId: "new-producer",
        displayName: "新加入的制作人",
        points: 0,
        rank: null,
      }
      break
    case "panel-outside-top":
      summary.viewer = {
        accountId: "producer-32",
        displayName: "名片维护制作人 32",
        points: 413,
        rank: 32,
      }
      break
    case "panel-long":
      summary.contributors = contributors.slice(0, 5).map((item, index) => ({
        ...item,
        displayName:
          index === 0
            ? "一直在收集和维护偶像大师系列名片的制作人名字很长很长P"
            : item.displayName,
        points: index < 2 ? 1234567 : 999999,
        cards: 12345 - index,
      }))
      summary.viewer = {
        accountId: "texas",
        displayName: "TexasOct",
        points: 1234567,
        rank: 2,
      }
      break
  }
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await mockNamecardBrowsing(
    page,
    api,
    2,
    {},
    { cards: 1, reactionReads: 2, reactionWrites: 0 },
    state.id === "panel-loading" || state.id === "panel-error"
      ? async () => {
          if (state.id === "panel-loading") await held
          return state.id === "panel-error"
            ? { status: 503, json: { error: "维护摘要暂不可用" } }
            : { status: 200, json: summary }
        }
      : summary
  )
  if (summary.viewer) {
    await page.context().addCookies([
      {
        name: "ims_platform_csrf",
        value: "wall-state-browser-csrf",
        domain: "127.0.0.1",
        path: "/",
      },
    ])
    installPlatformSessionMock(api, {
      success: true,
      account: { id: summary.viewer.accountId, status: "active" },
      profile: {
        uid: 1,
        displayName: summary.viewer.displayName,
        avatarUrl: null,
        homeCity: null,
        bio: "",
      },
    })
  }
  if (state.pageId === "leaderboard-dialog") {
    let requests = 0
    const calls =
      state.id === "dialog-middle" ||
      state.id === "dialog-page-error" ||
      state.id === "dialog-page-empty" ||
      state.id === "dialog-retry"
        ? 2
        : state.id === "dialog-last"
          ? 3
          : 1
    api.expect({
      method: "GET",
      path: apiPath("/cards/contributors"),
      query: namecardContributorsQuerySchema,
      responses: {
        200: namecardContributorsSchema,
        503: namecardErrorResponseSchema,
      },
      times: calls,
      handle: async ({ query }) => {
        requests += 1
        if (state.id === "dialog-loading") await held
        if (
          state.id === "dialog-error" ||
          (state.id === "dialog-retry" && requests === 1) ||
          (state.id === "dialog-page-error" && requests === 2)
        ) {
          return { status: 503, json: { error: "贡献榜暂不可用" } }
        }
        const all =
          state.id === "dialog-empty"
            ? []
            : state.id === "dialog-short"
              ? shortLeaders
              : state.id === "dialog-page-empty" && requests === 2
                ? contributors.slice(0, 10)
                : contributors
        const current = Number(query.page),
          size = Number(query.limit)
        return {
          status: 200,
          json: {
            contributors: all.slice((current - 1) * size, current * size),
            pageInfo: {
              page: current,
              pageSize: size,
              total: all.length,
              totalPages: Math.ceil(all.length / size),
              hasNextPage: current * size < all.length,
            },
          },
        }
      },
    })
  }
  return { release, viewerName: summary.viewer?.displayName }
}
