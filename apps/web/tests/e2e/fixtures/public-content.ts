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
  fudabaSeriesListSchema,
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
