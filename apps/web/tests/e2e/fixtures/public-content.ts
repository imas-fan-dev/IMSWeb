import {
  aboutPageContentSchema,
  type AboutPageContent,
} from "@imsweb/contracts/about"
import {
  editorialChroniclePageSchema,
  editorialChronicleQuerySchema,
  editorialSpotlightSchema,
  type EditorialChroniclePage,
  type EditorialSpotlight,
} from "@imsweb/contracts/editorial"
import {
  eventListQuerySchema,
  eventPageSchema,
  type EventPage,
} from "@imsweb/contracts/events"
import {
  fudabaCardPageSchema,
  fudabaCardQuerySchema,
  fudabaMapConfigSchema,
  fudabaMapOfficeListSchema,
  fudabaMapQuerySchema,
  fudabaOfficePageSchema,
  fudabaOfficeQuerySchema,
  fudabaSeriesListSchema,
  type FudabaCardPage,
  type FudabaMapConfig,
  type FudabaMapOfficeList,
  type FudabaOfficePage,
  type FudabaSeriesList,
} from "@imsweb/contracts/fudaba"
import {
  liveScheduleListSchema,
  liveScheduleQuerySchema,
  type LiveScheduleList,
} from "@imsweb/contracts/live"
import {
  newsListQuerySchema,
  recommendationResponseSchema,
  type RecommendationResponse,
} from "@imsweb/contracts/news"
import { apiPath, exchangePath } from "@imsweb/contracts/paths"

import type { ApiDispatcher, ApiTimes } from "./api-dispatcher"
import { installHomepageLinksMock } from "./homepage"
import { installNamecardListMock } from "./namecards"
import { installPlatformOAuthProvidersMock } from "./platform-auth"
import { installSeededWikiApis, type SeededWikiApiRegistration } from "./wiki"

const emptyEventPage = {
  items: [],
  pageInfo: {
    nextCursor: null,
    hasNextPage: false,
    snapshotAt: null,
  },
} satisfies EventPage

const emptyNews = [] satisfies RecommendationResponse
const emptySpotlight = { items: [] } satisfies EditorialSpotlight
const emptyChronicle = {
  items: [],
  pageInfo: { nextCursor: null, hasNextPage: false },
} satisfies EditorialChroniclePage
const emptyLiveSchedule = [] satisfies LiveScheduleList
const emptyExchangeSeries = { items: [] } satisfies FudabaSeriesList
const emptyExchangeOffices = {
  items: [],
  pageInfo: { hasNextPage: false, nextCursor: null },
} satisfies FudabaOfficePage
const emptyExchangeCards = {
  items: [],
  pageInfo: { hasNextPage: false, nextCursor: null },
} satisfies FudabaCardPage
const exchangeMapConfig = {
  styleUrl: "/maps/exchange-test-style.json",
} satisfies FudabaMapConfig
const emptyExchangeMapOffices = {
  items: [],
  truncated: false,
} satisfies FudabaMapOfficeList
const emptyAbout = {
  version: 1,
  siteName: "IMSWeb",
  siteNameEn: "IMSWeb",
  tagline: "偶像大师中文资料与社区",
  heroImageUrl: null,
  heroImageAlt: "",
  heroImageScale: 100,
  heroImageOffsetX: 0,
  heroImageOffsetY: 0,
  accentColorStart: "#f34f6d",
  accentColorEnd: "#2581c7",
  welcome: "",
  manifesto: [],
  sinceYear: 2024,
  overviewTitle: "IMSWeb",
  overview: [],
  groups: [],
  updatedAt: null,
} satisfies AboutPageContent

export type SeededPublicApiRegistration = {
  path:
    | SeededWikiApiRegistration["path"]
    | "/api/about"
    | "/api/cards"
    | "/api/chronicle"
    | "/api/community-posts/spotlight"
    | "/api/community/exchange/cards"
    | "/api/community/exchange/map/config"
    | "/api/community/exchange/map/offices"
    | "/api/community/exchange/offices"
    | "/api/community/exchange/series"
    | "/api/events"
    | "/api/homepage-links"
    | "/api/live-schedule"
    | "/api/news"
    | "/api/platform/auth/oauth/providers"
  times: ApiTimes
}

function installEventsMock(api: ApiDispatcher, times: ApiTimes) {
  api.expect({
    name: "deterministic public events",
    method: "GET",
    path: apiPath("/events"),
    query: eventListQuerySchema,
    responses: { 200: eventPageSchema },
    times,
    handle: () => ({ status: 200, json: emptyEventPage }),
  })
}

function installNewsMock(api: ApiDispatcher, times: ApiTimes) {
  api.expect({
    name: "deterministic public recommendations",
    method: "GET",
    path: apiPath("/news"),
    query: newsListQuerySchema,
    responses: { 200: recommendationResponseSchema },
    times,
    handle: () => ({ status: 200, json: emptyNews }),
  })
}

function installSpotlightMock(api: ApiDispatcher, times: ApiTimes) {
  api.expect({
    name: "deterministic public editorial spotlight",
    method: "GET",
    path: apiPath("/community-posts/spotlight"),
    responses: { 200: editorialSpotlightSchema },
    times,
    handle: () => ({ status: 200, json: emptySpotlight }),
  })
}

function installAboutMock(api: ApiDispatcher, times: ApiTimes) {
  api.expect({
    name: "deterministic public About content",
    method: "GET",
    path: apiPath("/about"),
    responses: { 200: aboutPageContentSchema },
    times,
    handle: () => ({ status: 200, json: emptyAbout }),
  })
}

function installChronicleMock(api: ApiDispatcher, times: ApiTimes) {
  api.expect({
    name: "deterministic public Chronicle",
    method: "GET",
    path: apiPath("/chronicle"),
    query: editorialChronicleQuerySchema,
    responses: { 200: editorialChroniclePageSchema },
    times,
    handle: () => ({ status: 200, json: emptyChronicle }),
  })
}

function installLiveScheduleMock(api: ApiDispatcher, times: ApiTimes) {
  api.expect({
    name: "deterministic public live schedule",
    method: "GET",
    path: apiPath("/live-schedule"),
    query: liveScheduleQuerySchema,
    responses: { 200: liveScheduleListSchema },
    times,
    handle: () => ({ status: 200, json: emptyLiveSchedule }),
  })
}

function installExchangeSeriesMock(api: ApiDispatcher, times: ApiTimes) {
  api.expect({
    name: "deterministic public exchange series",
    method: "GET",
    path: exchangePath("/series"),
    responses: { 200: fudabaSeriesListSchema },
    times,
    handle: () => ({ status: 200, json: emptyExchangeSeries }),
  })
}

function installExchangeOfficesMock(api: ApiDispatcher, times: ApiTimes) {
  api.expect({
    name: "deterministic public exchange offices",
    method: "GET",
    path: exchangePath("/offices"),
    query: fudabaOfficeQuerySchema,
    responses: { 200: fudabaOfficePageSchema },
    times,
    handle: () => ({ status: 200, json: emptyExchangeOffices }),
  })
}

function installExchangeCardsMock(api: ApiDispatcher, times: ApiTimes) {
  api.expect({
    name: "deterministic public exchange cards",
    method: "GET",
    path: exchangePath("/cards"),
    query: fudabaCardQuerySchema,
    responses: { 200: fudabaCardPageSchema },
    times,
    handle: () => ({ status: 200, json: emptyExchangeCards }),
  })
}

function installExchangeMapConfigMock(api: ApiDispatcher, times: ApiTimes) {
  api.expect({
    name: "deterministic public exchange map config",
    method: "GET",
    path: exchangePath("/map/config"),
    responses: { 200: fudabaMapConfigSchema },
    times,
    handle: () => ({ status: 200, json: exchangeMapConfig }),
  })
}

function installExchangeMapOfficesMock(api: ApiDispatcher, times: ApiTimes) {
  api.expect({
    name: "deterministic public exchange map offices",
    method: "GET",
    path: exchangePath("/map/offices"),
    query: fudabaMapQuerySchema,
    responses: { 200: fudabaMapOfficeListSchema },
    times,
    handle: () => ({ status: 200, json: emptyExchangeMapOffices }),
  })
}

export function installSeededPublicApis(
  api: ApiDispatcher,
  registrations: SeededPublicApiRegistration[]
) {
  for (const registration of registrations) {
    const { path, times } = registration
    if (
      path === "/api/wiki/catalog" ||
      path === "/api/wiki/random_bg" ||
      path === "/api/wiki/random_idol" ||
      path === "/api/wiki/stories"
    ) {
      installSeededWikiApis(api, [{ path, times }])
    } else if (path === "/api/about") {
      installAboutMock(api, times)
    } else if (path === "/api/cards") {
      installNamecardListMock(api, times)
    } else if (path === "/api/chronicle") {
      installChronicleMock(api, times)
    } else if (path === "/api/community-posts/spotlight") {
      installSpotlightMock(api, times)
    } else if (path === "/api/community/exchange/cards") {
      installExchangeCardsMock(api, times)
    } else if (path === "/api/community/exchange/map/config") {
      installExchangeMapConfigMock(api, times)
    } else if (path === "/api/community/exchange/map/offices") {
      installExchangeMapOfficesMock(api, times)
    } else if (path === "/api/community/exchange/offices") {
      installExchangeOfficesMock(api, times)
    } else if (path === "/api/community/exchange/series") {
      installExchangeSeriesMock(api, times)
    } else if (path === "/api/events") {
      installEventsMock(api, times)
    } else if (path === "/api/homepage-links") {
      installHomepageLinksMock(api, times)
    } else if (path === "/api/live-schedule") {
      installLiveScheduleMock(api, times)
    } else if (path === "/api/news") {
      installNewsMock(api, times)
    } else if (path === "/api/platform/auth/oauth/providers") {
      installPlatformOAuthProvidersMock(api, times)
    } else {
      const unsupportedPath: never = path
      throw new Error(
        `Unsupported deterministic public API: ${unsupportedPath}`
      )
    }
  }
}
