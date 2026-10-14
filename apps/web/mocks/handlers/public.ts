import {
  apiPath,
  eventChroniclePath,
  exchangePath,
  wikiPath,
} from "@imsweb/contracts/paths"
import { http, HttpResponse } from "msw"

import {
  makeAboutPageContent,
  makeChronicleActivity,
  makeChronicleActivitySummary,
  makeEditorialArticle,
  makeEditorialChroniclePage,
  makeEditorialLegacyInformation,
  makeEditorialSpotlight,
  makeEventPage,
  makeFudabaCardPage,
  makeFudabaOfficeDetail,
  makeFudabaOfficePage,
  makeFudabaSeriesList,
  makeHomepageLinks,
  makeInformationDetail,
  makeInformationList,
  makeLiveScheduleList,
  makeNamecardPage,
  makeNamecardReactions,
  makeProducerMapContent,
  makePublicSitePackage,
  makeRecommendationPage,
  makeWikiPublicCatalog,
  makeWikiPublicStories,
  makeWikiRandomBackground,
  makeWikiRandomIdol,
} from "../data"

/**
 * Public read endpoints.
 *
 * Each `path` is built with the same `@imsweb/contracts/paths` builder the
 * matching `app/lib/api/endpoints/*` module uses, so a path move updates both
 * sides. Each response is the output of a contract-typed fixture factory, and
 * `tests/unit/mocks/handlers/public.test.ts` asserts that pairing against the
 * very schema the endpoint passes to `parsed(...)`.
 *
 * Only reads are declared. A write cannot succeed without a backend, so mocking
 * one would hide the failure instead of previewing a page.
 *
 * The detail routes at the bottom echo their path parameter into the payload, so
 * a page opened from a mocked list shows the entity that list advertised rather
 * than a fixture default. The two guest-submission routes
 * (`/guest-submissions/:id` and its `/media/:side`) are deliberately absent: both
 * need a withdrawal token that only the real submission flow can mint.
 */
export const publicHandlers = [
  http.get(apiPath("/about"), () => HttpResponse.json(makeAboutPageContent())),
  http.get(apiPath("/homepage-links"), () =>
    HttpResponse.json(makeHomepageLinks())
  ),
  http.get(apiPath("/information"), () =>
    HttpResponse.json(makeInformationList())
  ),
  http.get(apiPath("/news"), () => HttpResponse.json(makeRecommendationPage())),
  http.get(apiPath("/events"), () => HttpResponse.json(makeEventPage())),
  http.get(apiPath("/cards"), () => HttpResponse.json(makeNamecardPage())),
  http.get(apiPath("/reactions"), () =>
    HttpResponse.json(makeNamecardReactions())
  ),
  http.get(apiPath("/community-posts/spotlight"), () =>
    HttpResponse.json(makeEditorialSpotlight())
  ),
  http.get(apiPath("/chronicle"), () =>
    HttpResponse.json(makeEditorialChroniclePage())
  ),
  http.get(apiPath("/producer-map"), () =>
    HttpResponse.json(makeProducerMapContent())
  ),
  http.get(wikiPath("/catalog"), () =>
    HttpResponse.json(makeWikiPublicCatalog())
  ),
  http.get(wikiPath("/stories"), () =>
    HttpResponse.json(makeWikiPublicStories())
  ),
  http.get(wikiPath("/random_bg"), () =>
    HttpResponse.json(makeWikiRandomBackground())
  ),
  http.get(wikiPath("/random_idol"), () =>
    HttpResponse.json(makeWikiRandomIdol())
  ),
  http.get(apiPath("/live-schedule"), () =>
    HttpResponse.json(makeLiveScheduleList())
  ),
  http.get(exchangePath("/series"), () =>
    HttpResponse.json(makeFudabaSeriesList())
  ),
  http.get(exchangePath("/offices"), () =>
    HttpResponse.json(makeFudabaOfficePage())
  ),
  // Auth-gated like `/series` and `/offices`, and mocked for the same reason:
  // the exchange page asks for it on load, and a 502 there is a hole in a page
  // the mock layer exists to render.
  http.get(exchangePath("/cards"), () =>
    HttpResponse.json(makeFudabaCardPage())
  ),
  http.get(eventChroniclePath("/activities"), () =>
    HttpResponse.json([makeChronicleActivitySummary()])
  ),

  /*
   * Detail routes. `app/lib/api/endpoints/*` asks for these with
   * `encodeURIComponent`, so the parameter is the entity's own id or slug.
   */
  http.get(apiPath("/information/:id"), ({ params }) =>
    HttpResponse.json(makeInformationDetail(String(params.id)))
  ),
  http.get(apiPath("/events/:id"), ({ params }) =>
    HttpResponse.json(makeEditorialArticle({ id: Number(params.id) }))
  ),
  http.get(apiPath("/chronicle/:id"), ({ params }) =>
    HttpResponse.json(makeEditorialArticle({ id: Number(params.id) }))
  ),
  http.get(apiPath("/community-posts/legacy-information/:id"), ({ params }) => {
    // The real endpoint resolves a legacy slug to a canonical post id and
    // reports null when it cannot; the mock echoes a numeric id, null otherwise.
    const legacyId = String(params.id)
    return HttpResponse.json(
      makeEditorialLegacyInformation(
        /^\d+$/.test(legacyId) ? Number(legacyId) : null
      )
    )
  }),
  http.get(apiPath("/site-packages/:slug"), ({ params }) =>
    HttpResponse.json(makePublicSitePackage(String(params.slug)))
  ),
  http.get(eventChroniclePath("/activities/:activityId"), ({ params }) =>
    HttpResponse.json(makeChronicleActivity({ id: String(params.activityId) }))
  ),
  http.get(exchangePath("/offices/:officeSlug"), ({ params }) =>
    // The wire carries `{ office }`; the client's `select` unwraps it.
    HttpResponse.json({
      office: makeFudabaOfficeDetail({ slug: String(params.officeSlug) }),
    })
  ),
]
