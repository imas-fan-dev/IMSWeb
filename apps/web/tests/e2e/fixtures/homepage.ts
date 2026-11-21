import {
  homepageLinksSchema,
  type HomepageLinks,
} from "@imsweb/contracts/homepage-links"
import { apiPath, wikiPath } from "@imsweb/contracts/paths"
import { wikiPublicCatalogSchema } from "@imsweb/contracts/wiki"

import type { ApiDispatcher, ApiTimes } from "./api-dispatcher"
import { catalogBirthdaysSchema } from "@imsweb/contracts/catalog"
import { createCatalogBirthdays } from "../../../mocks/data/catalog"

export function installBirthdaysMock(api: ApiDispatcher, times: ApiTimes = 1) {
  api.expect({
    method: "GET",
    path: apiPath("/birthdays"),
    responses: { 200: catalogBirthdaysSchema },
    times,
    handle: () => ({ json: createCatalogBirthdays() }),
  })
}

const homepageLinks = {
  sections: {
    navigation: [
      {
        id: "navigation-events",
        section: "navigation",
        title: "活动中心",
        description: "浏览近期活动与公开信息",
        href: "/events",
        icon: "calendar",
        accent: "franchise-765",
        displayOrder: 0,
      },
      {
        id: "navigation-wiki",
        section: "navigation",
        title: "剧情站",
        description: "查阅偶像剧情档案与中文资料",
        href: "/wiki",
        icon: "library",
        accent: "franchise-sc",
        displayOrder: 1,
      },
      {
        id: "navigation-exchange",
        section: "navigation",
        title: "名片交换事务所",
        description: "查找线下交换点",
        href: "/community/exchange",
        icon: "contact",
        accent: "franchise-ml",
        displayOrder: 2,
      },
      {
        id: "navigation-cards",
        section: "navigation",
        title: "制作人名片墙",
        description: "浏览制作人名片与社区成员",
        href: "/community/cards",
        icon: "id-card",
        accent: "franchise-sidem",
        displayOrder: 3,
      },
      {
        id: "navigation-map",
        section: "navigation",
        title: "制作人地图",
        description: "查看各地制作人的公开分布",
        href: "/producer-map",
        icon: "map",
        accent: "franchise-gk",
        displayOrder: 4,
      },
      {
        id: "navigation-works",
        section: "navigation",
        title: "作品与工具",
        description: "浏览社区创作与实用工具",
        href: "/works",
        icon: "gamepad",
        accent: "franchise-sidem",
        displayOrder: 5,
      },
      {
        id: "navigation-chronicle",
        section: "navigation",
        title: "活动编年史",
        description: "回顾社区线下活动与共同记忆",
        href: "/chronicle",
        icon: "history",
        accent: "franchise-765",
        displayOrder: 6,
      },
      {
        id: "navigation-about",
        section: "navigation",
        title: "关于 IMSWeb",
        description: "了解项目定位与维护方式",
        href: "/about",
        icon: "info",
        accent: "franchise-gk",
        displayOrder: 7,
      },
    ],
    friend: [
      {
        id: "friend-sp",
        section: "friend",
        title: "偶像大师 SP 汉化",
        description: "SP 中文化项目",
        href: "https://sp.idolmaster.top/",
        icon: "external-link",
        accent: "franchise-765",
        displayOrder: 0,
      },
    ],
    support: [
      {
        id: "support-rainyun-compute",
        section: "support",
        title: "本站由雨云提供计算服务",
        description: "IMSWeb 当前站点支持",
        href: "https://app.rainyun.com/",
        icon: "external-link",
        accent: "info",
        displayOrder: 0,
      },
    ],
  },
} satisfies HomepageLinks

export function installHomepageLinksMock(
  api: ApiDispatcher,
  times: ApiTimes = 1
) {
  api.expect({
    method: "GET",
    path: apiPath("/homepage-links"),
    responses: { 200: homepageLinksSchema },
    times,
    handle: () => ({ status: 200, json: homepageLinks }),
  })
}

export function installPublicShellMocks(api: ApiDispatcher, times: ApiTimes) {
  installEmptyWikiCatalogMock(api, times)
  installHomepageLinksMock(api, times)
  installBirthdaysMock(api, times)
  api.mockRoute(
    "/api/wiki/random_idol",
    (route) => route.fulfill({ status: 500, json: { error: "Unavailable" } }),
    "GET",
    times
  )
  api.mockRoute(
    "/api/community-posts/spotlight",
    (route) => route.fulfill({ status: 200, json: { items: [] } }),
    "GET",
    times
  )
  api.mockRoute(
    "/api/news",
    (route) => route.fulfill({ status: 200, json: [] }),
    "GET",
    times
  )
  api.mockRoute(
    "/api/events",
    (route) =>
      route.fulfill({
        status: 200,
        json: {
          items: [],
          pageInfo: {
            nextCursor: null,
            hasNextPage: false,
            snapshotAt: null,
          },
        },
      }),
    "GET",
    times
  )
}

export function installEmptyWikiCatalogMock(
  api: ApiDispatcher,
  times: ApiTimes = 1
) {
  api.expect({
    name: "empty public Wiki catalog",
    method: "GET",
    path: wikiPath("/catalog"),
    responses: { 200: wikiPublicCatalogSchema },
    times,
    handle: () => ({
      status: 200,
      json: {
        status: "success",
        agencies: [],
        searchEntries: [],
        selection: null,
      },
    }),
  })
}
