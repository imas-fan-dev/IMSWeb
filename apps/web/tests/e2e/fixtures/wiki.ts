import { wikiPath } from "@imsweb/contracts/paths"
import {
  wikiCatalogQuerySchema,
  wikiPublicCatalogSchema,
  wikiPublicStoriesSchema,
  wikiRandomBackgroundSchema,
  wikiRandomIdolSchema,
  wikiStoriesQuerySchema,
  type WikiPublicAgency,
  type WikiPublicCatalog,
  type WikiPublicGroup,
  type WikiPublicIdol,
  type WikiPublicStories,
  type WikiRandomBackground,
  type WikiRandomIdol,
} from "@imsweb/contracts/wiki"

import type { ApiDispatcher, ApiTimes } from "./api-dispatcher"

const imageTransform = {
  fit: "cover",
  focalX: 0.5,
  focalY: 0.5,
  zoom: 1,
  rotation: 0,
} as const

const agencies = [
  {
    id: 1,
    code: "765",
    name: "765PRO",
    color: "#f34f6d",
    bannerTitle: "765PRO ALLSTARS",
    iconUrl: "/brand/series/wall/765pro.webp",
    idolCount: 13,
    entryCount: 13,
    imageTransform,
  },
  {
    id: 2,
    code: "million-live",
    name: "百万现场",
    color: "#ffc30b",
    bannerTitle: "MILLION LIVE!",
    iconUrl: "/brand/series/wall/million-live.webp",
    idolCount: 1,
    entryCount: 1,
    imageTransform,
  },
  {
    id: 3,
    code: "shiny-colors",
    name: "闪耀色彩",
    color: "#8dbbff",
    bannerTitle: "闪耀色彩",
    iconUrl: "/brand/series/wall/shiny-colors.webp",
    idolCount: 12,
    entryCount: 12,
    imageTransform,
  },
  {
    id: 4,
    code: "876",
    name: "876PRO",
    color: "#42a5f5",
    bannerTitle: "876PRO",
    iconUrl: "/brand/series/wall/sidem.webp",
    idolCount: 1,
    entryCount: 1,
    imageTransform,
  },
  {
    id: 5,
    code: "gakuen",
    name: "学园偶像大师",
    color: "#f39800",
    bannerTitle: "初星学园",
    iconUrl: "/brand/series/wall/gakuen.webp",
    idolCount: 1,
    entryCount: 1,
    imageTransform,
  },
] satisfies WikiPublicAgency[]

function makeIdol(
  id: number,
  name: string,
  folderName: string,
  agency: WikiPublicAgency,
  imageUrl = agency.iconUrl!
): WikiPublicIdol {
  return {
    id,
    name,
    folderName,
    color: agency.color,
    wikiUrl: null,
    imageUrl,
    imageFit: "cover",
    textColor: "#ffffff",
    entryKind: "idol",
    entrySubtype: null,
    imageTransform,
  }
}

const haruka = makeIdol(1, "天海春香", "amami_haruka", agencies[0]!)
const mirai = makeIdol(2, "春日未来", "kasuga_mirai", agencies[1]!)
const mano = makeIdol(3, "樱木真乃", "sakuragi_mano", agencies[2]!)
const hiori = makeIdol(4, "风野灯织", "kazano_hiori", agencies[2]!)
const meguru = makeIdol(5, "八宫巡", "hachimiya_meguru", agencies[2]!)
const uchu = makeIdol(6, "上水流宇宙", "kamizuru_kosumo", agencies[3]!)
const lilja = makeIdol(7, "葛城莉莉娅", "katsuragi_lilja", agencies[4]!)

function makeFillerIdols(
  count: number,
  firstId: number,
  namePrefix: string,
  agency: WikiPublicAgency
) {
  return Array.from({ length: count }, (_, index) =>
    makeIdol(
      firstId + index,
      `${namePrefix}${index + 1}`,
      `${agency.code}_${index + 1}`,
      agency
    )
  )
}

const allStarsFillers = makeFillerIdols(12, 100, "765测试偶像", agencies[0]!)
const shinyFillers = makeFillerIdols(9, 200, "闪耀测试偶像", agencies[2]!)

const groupsByAgency = new Map<string, WikiPublicGroup[]>([
  [
    "765PRO",
    [
      {
        id: 1,
        code: "765-allstars",
        name: "765PRO ALLSTARS",
        color: agencies[0]!.color,
        iconUrl: null,
        imageTransform,
        idols: [haruka, ...allStarsFillers],
      },
    ],
  ],
  [
    "百万现场",
    [
      {
        id: 2,
        code: "million-stars",
        name: "MILLIONSTARS",
        color: agencies[1]!.color,
        iconUrl: null,
        imageTransform,
        idols: [mirai],
      },
    ],
  ],
  [
    "闪耀色彩",
    [
      {
        id: 3,
        code: "illumination-stars",
        name: "illumination STARS",
        color: agencies[2]!.color,
        iconUrl: null,
        imageTransform,
        idols: [mano, hiori, meguru],
      },
      {
        id: 4,
        code: "shiny-fixture-group",
        name: "测试组合",
        color: agencies[2]!.color,
        iconUrl: null,
        imageTransform,
        idols: shinyFillers,
      },
    ],
  ],
  [
    "学园偶像大师",
    [
      {
        id: 5,
        code: "hatsuboshi",
        name: "初星学园",
        color: agencies[4]!.color,
        iconUrl: null,
        imageTransform,
        idols: [lilja],
      },
    ],
  ],
])

const ungroupedIdolsByAgency = new Map<string, WikiPublicIdol[]>([
  ["876PRO", [uchu]],
])

const allIdols = [
  haruka,
  ...allStarsFillers,
  mirai,
  mano,
  hiori,
  meguru,
  ...shinyFillers,
  uchu,
  lilja,
]
const idolAgency = new Map(
  allIdols.map((idol) => [
    idol.id,
    agencies.find((agency) => agency.iconUrl === idol.imageUrl) ?? agencies[0]!,
  ])
)

function catalogFor(requestedAgency?: string): WikiPublicCatalog {
  const agency = requestedAgency
    ? agencies.find(
        (candidate) =>
          candidate.name === requestedAgency ||
          candidate.code === requestedAgency
      )
    : agencies[0]
  if (!agency) {
    throw new Error(`Unsupported deterministic Wiki agency: ${requestedAgency}`)
  }

  return {
    status: "success",
    agencies,
    searchEntries: allIdols.map((idol) => {
      const owner = idolAgency.get(idol.id)!
      return {
        id: idol.id,
        name: idol.name,
        agencyId: owner.id,
        agencyCode: owner.code,
        agencyName: owner.name,
        agencyColor: owner.color,
        entryKind: idol.entryKind,
        entrySubtype: idol.entrySubtype,
      }
    }),
    selection: {
      agency,
      layoutRevision: 0,
      groups: groupsByAgency.get(agency.name) ?? [],
      ungroupedIdols: ungroupedIdolsByAgency.get(agency.name) ?? [],
    },
  }
}

const sourcedLink = {
  id: 1,
  up: "IMSWeb 测试",
  title: "第一话",
  url: "https://www.bilibili.com/video/BV1test",
  contentType: "剧情",
  contentTypeIcon: "video",
  sourcePlatform: "Bilibili",
} as const

function storyResponse(
  agency: WikiPublicAgency,
  idol: WikiPublicIdol,
  categories: WikiPublicStories["categories"]
): WikiPublicStories {
  return {
    status: "success",
    agency: {
      id: agency.id,
      code: agency.code,
      name: agency.name,
      color: agency.color,
    },
    idol,
    categories,
  }
}

const storiesByIdol = new Map<string, WikiPublicStories>([
  [
    haruka.name,
    storyResponse(agencies[0]!, haruka, [
      {
        name: "主线",
        cards: [
          {
            id: 101,
            name: "春香剧情",
            img: haruka.imageUrl,
            subtitle: "第一话",
            imageTransform,
            links: [sourcedLink],
          },
        ],
      },
    ]),
  ],
  [
    mirai.name,
    storyResponse(agencies[1]!, mirai, [
      {
        name: "竖卡",
        cards: [
          {
            id: 201,
            name: "未来竖卡剧情",
            img: mirai.imageUrl,
            subtitle: "第一话",
            imageTransform,
            links: [sourcedLink],
          },
        ],
      },
    ]),
  ],
  [
    mano.name,
    storyResponse(agencies[2]!, mano, [
      {
        name: "主线",
        cards: [
          {
            id: 301,
            name: "真乃剧情",
            img: mano.imageUrl,
            subtitle: "第一话",
            imageTransform,
            links: [sourcedLink],
          },
        ],
      },
    ]),
  ],
  [
    uchu.name,
    storyResponse(agencies[3]!, uchu, [
      {
        name: "主线",
        cards: [
          {
            id: 401,
            name: "宇宙视觉剧情",
            img: uchu.imageUrl,
            subtitle: "暂无来源",
            imageTransform,
            links: [],
          },
          {
            id: 402,
            name: "宇宙文字剧情",
            img: "",
            subtitle: "暂无来源",
            imageTransform,
            links: [],
          },
        ],
      },
    ]),
  ],
  [
    lilja.name,
    storyResponse(agencies[4]!, lilja, [
      {
        name: "主线",
        cards: [
          {
            id: 501,
            name: "莉莉娅文字剧情",
            img: "",
            subtitle: "文字剧情",
            imageTransform,
            links: [sourcedLink],
          },
        ],
      },
    ]),
  ],
])

const randomBackground = {
  url: "/brand/series/wall/shiny-colors.webp",
  card_id: 301,
  card_name: "真乃剧情",
  idol_name: mano.name,
  agency_name: agencies[2]!.name,
} satisfies WikiRandomBackground

const randomIdol = {
  status: "success",
  eligibleCount: allIdols.length,
  idol: {
    id: mano.id,
    name: mano.name,
    color: mano.color,
    textColor: mano.textColor,
    imageUrl: mano.imageUrl,
    imageTransform: mano.imageTransform,
    agency: {
      id: agencies[2]!.id,
      code: agencies[2]!.code,
      name: agencies[2]!.name,
      color: agencies[2]!.color,
      iconUrl: agencies[2]!.iconUrl,
      imageTransform: agencies[2]!.imageTransform,
    },
  },
} satisfies WikiRandomIdol

export type SeededWikiApiRegistration = {
  path:
    | "/api/wiki/catalog"
    | "/api/wiki/random_bg"
    | "/api/wiki/random_idol"
    | "/api/wiki/stories"
  times: ApiTimes
}

export function installWikiCatalogMock(
  api: ApiDispatcher,
  times: ApiTimes = 1
) {
  api.expect({
    name: "deterministic public Wiki catalog",
    method: "GET",
    path: wikiPath("/catalog"),
    query: wikiCatalogQuerySchema,
    responses: { 200: wikiPublicCatalogSchema },
    times,
    handle: ({ query }) => ({
      status: 200,
      json: catalogFor(query.agency),
    }),
  })
}

export function installWikiStoriesMock(
  api: ApiDispatcher,
  times: ApiTimes = 1
) {
  api.expect({
    name: "deterministic public Wiki stories",
    method: "GET",
    path: wikiPath("/stories"),
    query: wikiStoriesQuerySchema,
    responses: { 200: wikiPublicStoriesSchema },
    times,
    handle: ({ query }) => {
      if (!query.agency || !query.idol) {
        throw new Error(
          "Deterministic Wiki stories require both agency and idol selectors"
        )
      }
      const stories = storiesByIdol.get(query.idol)
      if (
        !stories ||
        (stories.agency.name !== query.agency &&
          stories.agency.code !== query.agency)
      ) {
        throw new Error(
          `Unsupported deterministic Wiki story: ${query.agency}/${query.idol}`
        )
      }
      return { status: 200, json: stories }
    },
  })
}

export function installWikiRandomBackgroundMock(
  api: ApiDispatcher,
  times: ApiTimes = 1
) {
  api.expect({
    name: "deterministic public Wiki background",
    method: "GET",
    path: wikiPath("/random_bg"),
    responses: { 200: wikiRandomBackgroundSchema },
    times,
    handle: () => ({ status: 200, json: randomBackground }),
  })
}

export function installWikiRandomIdolMock(
  api: ApiDispatcher,
  times: ApiTimes = 1
) {
  api.expect({
    name: "deterministic public Wiki random idol",
    method: "GET",
    path: wikiPath("/random_idol"),
    responses: { 200: wikiRandomIdolSchema },
    times,
    handle: () => ({ status: 200, json: randomIdol }),
  })
}

export function installSeededWikiApis(
  api: ApiDispatcher,
  registrations: SeededWikiApiRegistration[]
) {
  for (const registration of registrations) {
    const { path, times } = registration
    if (path === "/api/wiki/catalog") {
      installWikiCatalogMock(api, times)
    } else if (path === "/api/wiki/stories") {
      installWikiStoriesMock(api, times)
    } else if (path === "/api/wiki/random_bg") {
      installWikiRandomBackgroundMock(api, times)
    } else if (path === "/api/wiki/random_idol") {
      installWikiRandomIdolMock(api, times)
    } else {
      const unsupportedPath: never = path
      throw new Error(`Unsupported deterministic Wiki API: ${unsupportedPath}`)
    }
  }
}
