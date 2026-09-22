import { aboutPageContentSchema } from "@imsweb/contracts/about"
import {
  chronicleActivityListSchema,
  chronicleActivitySchema,
} from "@imsweb/contracts/chronicle"
import {
  editorialArticleSchema,
  editorialChroniclePageSchema,
  editorialLegacyInformationSchema,
  editorialSpotlightSchema,
} from "@imsweb/contracts/editorial"
import { eventPageSchema } from "@imsweb/contracts/events"
import {
  fudabaCardPageSchema,
  fudabaOfficeDetailSchema,
  fudabaOfficePageSchema,
  fudabaSeriesListSchema,
} from "@imsweb/contracts/fudaba"
import { homepageLinksSchema } from "@imsweb/contracts/homepage-links"
import {
  informationDetailSchema,
  informationListSchema,
} from "@imsweb/contracts/information"
import { liveScheduleListSchema } from "@imsweb/contracts/live"
import { namecardPageSchema, reactionSchema } from "@imsweb/contracts/namecards"
import { recommendationResponseSchema } from "@imsweb/contracts/news"
import {
  apiPath,
  eventChroniclePath,
  exchangePath,
  wikiPath,
} from "@imsweb/contracts/paths"
import { producerMapContentSchema } from "@imsweb/contracts/producer-map"
import { publicSitePackageSchema } from "@imsweb/contracts/site-packages"
import {
  wikiPublicCatalogSchema,
  wikiPublicStoriesSchema,
  wikiRandomBackgroundSchema,
  wikiRandomIdolSchema,
} from "@imsweb/contracts/wiki"
import { getResponse } from "msw"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import { publicHandlers } from "@/mocks/handlers/public"

/**
 * Every schema below is the one the matching `app/lib/api/endpoints/*` module
 * passes to `parsed(...)`. Keeping the pairing here, rather than only asserting
 * "the response is an object", is what makes a handler and its contract drift
 * fail a test instead of an empty page.
 */
type ContractSchema = { parse: (value: unknown) => unknown }

type PublicHandler = (typeof publicHandlers)[number]

type JsonPayload = Record<string, unknown>

/**
 * One declared handler paired with the schema its endpoint parses.
 *
 * `request` is the URL to ask for, which only differs from `path` for a detail
 * route: there the placeholder has to become a concrete id before a request can
 * be built at all. `carries` is the value the response has to echo back, so a
 * handler that ignores its parameter and returns fixture defaults fails here.
 */
type RouteCase = {
  path: string
  schema: ContractSchema
  request?: string
  carries?: unknown
  echoed?: (payload: JsonPayload) => unknown
}

const routeCases: RouteCase[] = [
  { path: apiPath("/about"), schema: aboutPageContentSchema },
  { path: apiPath("/homepage-links"), schema: homepageLinksSchema },
  { path: apiPath("/information"), schema: informationListSchema },
  { path: apiPath("/news"), schema: recommendationResponseSchema },
  { path: apiPath("/events"), schema: eventPageSchema },
  { path: apiPath("/cards"), schema: namecardPageSchema },
  { path: apiPath("/reactions"), schema: reactionSchema },
  {
    path: apiPath("/community-posts/spotlight"),
    schema: editorialSpotlightSchema,
  },
  { path: apiPath("/chronicle"), schema: editorialChroniclePageSchema },
  { path: apiPath("/producer-map"), schema: producerMapContentSchema },
  { path: wikiPath("/catalog"), schema: wikiPublicCatalogSchema },
  { path: wikiPath("/stories"), schema: wikiPublicStoriesSchema },
  { path: wikiPath("/random_bg"), schema: wikiRandomBackgroundSchema },
  { path: wikiPath("/random_idol"), schema: wikiRandomIdolSchema },
  { path: apiPath("/live-schedule"), schema: liveScheduleListSchema },
  { path: exchangePath("/series"), schema: fudabaSeriesListSchema },
  { path: exchangePath("/offices"), schema: fudabaOfficePageSchema },
  { path: exchangePath("/cards"), schema: fudabaCardPageSchema },
  {
    path: eventChroniclePath("/activities"),
    schema: chronicleActivityListSchema,
  },
  {
    path: apiPath("/information/:id"),
    request: apiPath("/information/info-42"),
    schema: informationDetailSchema,
    carries: "info-42",
    echoed: (payload) => (payload.card as { id?: unknown } | undefined)?.id,
  },
  {
    path: apiPath("/events/:id"),
    request: apiPath("/events/42"),
    schema: editorialArticleSchema,
    carries: 42,
    echoed: (payload) => payload.id,
  },
  {
    path: apiPath("/chronicle/:id"),
    request: apiPath("/chronicle/42"),
    schema: editorialArticleSchema,
    carries: 42,
    echoed: (payload) => payload.id,
  },
  {
    path: apiPath("/community-posts/legacy-information/:id"),
    request: apiPath("/community-posts/legacy-information/42"),
    schema: editorialLegacyInformationSchema,
    carries: 42,
    echoed: (payload) => payload.postId,
  },
  {
    path: apiPath("/site-packages/:slug"),
    request: apiPath("/site-packages/demo-site"),
    schema: publicSitePackageSchema,
    carries: "demo-site",
    echoed: (payload) => payload.slug,
  },
  {
    path: eventChroniclePath("/activities/:activityId"),
    request: eventChroniclePath("/activities/activity-9"),
    schema: chronicleActivitySchema,
    carries: "activity-9",
    echoed: (payload) => payload.id,
  },
  {
    path: exchangePath("/offices/:officeSlug"),
    request: exchangePath("/offices/gz-09"),
    schema: fudabaOfficeDetailSchema,
    carries: "gz-09",
    echoed: (payload) =>
      (payload.office as { slug?: unknown } | undefined)?.slug,
  },
]

const ORIGIN = "http://ims.test"

/**
 * Relative handler paths resolve against a base URL. In the browser
 * `setupWorker` supplies the page origin; a test has to pass it explicitly.
 */
const RESOLUTION_CONTEXT = { baseUrl: ORIGIN }

function handlerPath(handler: PublicHandler): string {
  return String(handler.info.path)
}

/**
 * Resolves through MSW's own matching rather than calling the resolver
 * directly, so a handler whose path or method stopped matching fails here
 * instead of only in a browser.
 */
async function resolveFrom(
  routeCase: RouteCase
): Promise<Response | undefined> {
  const handler = publicHandlers.find(
    (candidate) => handlerPath(candidate) === routeCase.path
  )
  expect(handler, `no handler for ${routeCase.path}`).toBeDefined()
  if (!handler) return undefined

  return getResponse(
    [handler],
    new Request(new URL(routeCase.request ?? routeCase.path, ORIGIN)),
    RESOLUTION_CONTEXT
  )
}

describe("public mock handlers", () => {
  it("declares only GET handlers", () => {
    expect(publicHandlers.map((handler) => handler.info.method)).toEqual(
      publicHandlers.map(() => "GET")
    )
  })

  it("has a contract case for every declared handler", () => {
    expect(routeCases.map(({ path }) => path).sort()).toEqual(
      publicHandlers.map(handlerPath).sort()
    )
  })

  it("gives every dynamic handler a concrete request path", () => {
    const unresolved = publicHandlers
      .map(handlerPath)
      .filter((path) => path.includes(":"))
      .filter((path) => !routeCases.some((c) => c.path === path && c.request))

    expect(unresolved).toEqual([])
  })

  it("answers each route with a payload its endpoint schema accepts", async () => {
    for (const routeCase of routeCases) {
      const response = await resolveFrom(routeCase)
      expect(response, `no mocked response for ${routeCase.path}`).toBeDefined()
      if (!response) continue

      const payload = await response.json()
      assertFactoryCoversSchema(routeCase.schema, payload)
      expect(routeCase.schema.parse(payload), routeCase.path).toEqual(payload)
    }
  })

  it("echoes the path parameter into the payload", async () => {
    const carrying = routeCases.filter(({ carries }) => carries !== undefined)
    expect(carrying).toHaveLength(7)

    for (const routeCase of carrying) {
      const response = await resolveFrom(routeCase)
      expect(response, `no mocked response for ${routeCase.path}`).toBeDefined()
      if (!response) continue

      const payload = (await response.json()) as JsonPayload
      expect(routeCase.echoed?.(payload), routeCase.path).toEqual(
        routeCase.carries
      )
    }
  })

  it("rejects a payload that drops a required contract key", async () => {
    const routeCase = routeCases.find((c) => c.path === apiPath("/events"))
    expect(routeCase).toBeDefined()
    if (!routeCase) return

    const response = await resolveFrom(routeCase)
    const payload = (await response?.json()) as { pageInfo?: unknown }

    expect(() =>
      eventPageSchema.parse({ pageInfo: payload.pageInfo })
    ).toThrow()
  })
})
