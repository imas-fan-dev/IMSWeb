import type { HomepageLinks } from "@imsweb/contracts/homepage-links"
import type { WikiPublicCatalog } from "@imsweb/contracts/wiki"
import type { Page } from "@playwright/test"

export const browserIconUrls = [
  "/brand/series/wall/765pro.webp",
  "/brand/series/wall/cinderella-girls.webp",
] as const

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

const wikiCatalog = {
  status: "success",
  agencies: browserIconUrls.map((iconUrl, index) => ({
    id: index + 1,
    code: index === 0 ? "765" : "cg",
    name: index === 0 ? "765PRO" : "灰姑娘女孩",
    color: index === 0 ? "#f34e6c" : "#2581c7",
    bannerTitle: index === 0 ? "765PRO" : "CINDERELLA GIRLS",
    iconUrl,
    idolCount: 0,
    entryCount: 0,
    imageTransform: {
      fit: "cover" as const,
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
      rotation: 0 as const,
    },
  })),
  searchEntries: [],
  selection: null,
} satisfies WikiPublicCatalog

export async function installHomepageLinksMock(page: Page) {
  await page.route(
    (url) => url.pathname === "/api/homepage-links",
    (route) => route.fulfill({ status: 200, json: homepageLinks })
  )
}

export async function installBrowserIconMock(page: Page) {
  await page.route(
    (url) => url.pathname === "/api/wiki/catalog",
    (route) => route.fulfill({ status: 200, json: wikiCatalog })
  )
}
