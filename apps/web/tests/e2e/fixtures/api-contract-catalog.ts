import {
  aboutAdminSnapshotSchema,
  aboutAdminUpdateSchema,
  aboutErrorResponseSchema,
  aboutImageUploadSchema,
  aboutPageContentSchema,
  aboutPageUpdateRequestSchema,
} from "@imsweb/contracts/about"
import {
  adminAccountEndpointErrorResponseSchema,
  adminAccountListSchema,
} from "@imsweb/contracts/admin"
import {
  backofficeProtectedHttpErrorSchema,
  successFlagSchema,
} from "@imsweb/contracts/common"
import {
  editorialArticleSchema,
  editorialChroniclePageSchema,
  editorialChronicleQuerySchema,
  editorialErrorResponseSchema,
  editorialSpotlightSchema,
} from "@imsweb/contracts/editorial"
import {
  adminCardClaimListSchema,
  claimEnvelopeListSchema,
  claimMutationSchema,
  envelopeMutationSchema,
  fudabaCardReviewRequestSchema,
  fudabaClaimEnvelopeActionRequestSchema,
  fudabaLegacyCardClaimRequestSchema,
  fudabaAdminCardClaimHttpErrorSchema,
  fudabaCardClaimErrorSchema,
  registeredCardReviewListSchema,
  reviewMutationSchema,
} from "@imsweb/contracts/fudaba/card-claims"
import {
  fudabaAdminLocationReviewHttpErrorSchema,
  fudabaLocationReviewErrorSchema,
  fudabaLocationReviewListSchema,
  fudabaLocationReviewMutationSchema,
  fudabaLocationReviewQuerySchema,
  fudabaLocationReviewRequestSchema,
} from "@imsweb/contracts/fudaba/location-review"
import {
  fudabaGuestSubmissionErrorSchema,
  fudabaGuestSubmissionReceiptSchema,
} from "@imsweb/contracts/fudaba/guest-submissions"
import {
  fudabaCardPageSchema,
  fudabaCardPlacementDeleteRequestSchema,
  fudabaCardPlacementDeleteResponseSchema,
  fudabaCardPlacementSaveRequestSchema,
  fudabaCardPlacementSaveResponseSchema,
  fudabaCardQuerySchema,
  fudabaCardReactionsResponseSchema,
  fudabaCardUpdateRequestSchema,
  fudabaCardMutationResponseSchema,
  fudabaErrorResponseSchema,
  fudabaIgnoredQuerySchema,
  fudabaMapConfigSchema,
  fudabaMapOfficeListSchema,
  fudabaMapQuerySchema,
  fudabaOfficeDetailSchema,
  fudabaOfficeMutationResponseSchema,
  fudabaOfficePageSchema,
  fudabaOfficeQuerySchema,
  fudabaOfficeUpdateRequestSchema,
  fudabaOwnerCardDetailSchema,
  fudabaOwnerCardListSchema,
  fudabaOwnerLocationDetailSchema,
  fudabaOwnerLocationMutationResponseSchema,
  fudabaOwnerLocationSaveRequestSchema,
  fudabaOwnerLocationWithdrawalResponseSchema,
  fudabaOwnerOfficeDetailSchema,
  fudabaOwnerOfficeListSchema,
  fudabaPlaceSearchQuerySchema,
  fudabaPlaceSearchResponseSchema,
  fudabaRevisionRequestSchema,
  fudabaSeriesListSchema,
} from "@imsweb/contracts/fudaba"
import {
  liveScheduleErrorResponseSchema,
  liveScheduleListSchema,
  liveScheduleQuerySchema,
} from "@imsweb/contracts/live"
import {
  homepageLinkErrorResponseSchema,
  homepageLinkOrderRequestSchema,
  homepageLinksSchema,
} from "@imsweb/contracts/homepage-links"
import {
  adminNamecardHttpErrorSchema,
  adminNamecardListQuerySchema,
  adminNamecardListResponseSchema,
  namecardErrorResponseSchema,
  namecardListErrorResponseSchema,
  namecardListQuerySchema,
  namecardPageSchema,
  namecardReactionListQuerySchema,
  reactionSchema,
} from "@imsweb/contracts/namecards"
import {
  newsErrorResponseSchema,
  newsListQuerySchema,
  recommendationResponseSchema,
} from "@imsweb/contracts/news"
import {
  platformHttpErrorSchema,
  platformLoginRequestSchema,
  platformOAuthProvidersResponseSchema,
  platformProfileHttpErrorSchema,
  platformProfileMutationResponseSchema,
  platformProfileResponseSchema,
  platformProfileUpdateRequestSchema,
  platformRegisterRequestSchema,
  platformRegistrationVerificationRequestSchema,
  platformRegistrationVerificationResponseSchema,
  platformSessionSchema,
} from "@imsweb/contracts/platform"
import { producerMapAdminSnapshotSchema } from "@imsweb/contracts/producer-map"
import {
  sitePackageHttpErrorSchema,
  sitePackageListSchema,
} from "@imsweb/contracts/site-packages"
import {
  wikiAdminCatalogSchema,
  wikiErrorResponseSchema,
  wikiHttpErrorResponseSchema,
  wikiCatalogQuerySchema,
  wikiPublicCatalogSchema,
  wikiPublicStoriesSchema,
  wikiRandomBackgroundSchema,
  wikiRandomIdolSchema,
  wikiStoriesQuerySchema,
  wikiStoryCoverAssetsSchema,
} from "@imsweb/contracts/wiki"
import {
  eventErrorResponseSchema,
  eventListQuerySchema,
  eventPageSchema,
} from "@imsweb/contracts/events"
import { z } from "@imsweb/contracts/z"

const guestSubmissionMultipartSchema = z
  .string()
  .min(1)
  .refine(
    (body) =>
      (body.match(/name="images"/g)?.length ?? 0) === 2 &&
      body.includes('name="seriesCode"') &&
      body.includes('name="favoriteIdolIds"'),
    "expected two images, seriesCode, and favoriteIdolIds multipart fields"
  )
const aboutAvatarMultipartSchema = z
  .string()
  .min(1)
  .refine(
    (body) => body.includes('name="image"'),
    "expected image multipart field"
  )
const multipartFormDataContentTypeSchema = z
  .string()
  .regex(/^multipart\/form-data;\s*boundary=\S+$/i)

export type CatalogContract = {
  query?: z.ZodTypeAny
  body?: z.ZodTypeAny
  rawBody?: {
    name: string
    reason: string
    schema: z.ZodTypeAny
    contentType?: z.ZodTypeAny
  }
  responses: Record<number, z.ZodTypeAny | readonly z.ZodTypeAny[]>
}

const protectedErrors = {
  400: backofficeProtectedHttpErrorSchema,
  401: backofficeProtectedHttpErrorSchema,
  403: backofficeProtectedHttpErrorSchema,
  404: backofficeProtectedHttpErrorSchema,
  500: backofficeProtectedHttpErrorSchema,
}
const fudabaErrors = {
  400: fudabaErrorResponseSchema,
  401: fudabaErrorResponseSchema,
  403: fudabaErrorResponseSchema,
  404: fudabaErrorResponseSchema,
  409: fudabaErrorResponseSchema,
  503: fudabaErrorResponseSchema,
}
const fudabaClaimErrors = {
  400: fudabaCardClaimErrorSchema,
  401: fudabaCardClaimErrorSchema,
  403: fudabaCardClaimErrorSchema,
  404: fudabaCardClaimErrorSchema,
  409: fudabaCardClaimErrorSchema,
}
const fudabaGuestSubmissionErrors = {
  400: fudabaGuestSubmissionErrorSchema,
  404: fudabaGuestSubmissionErrorSchema,
  409: fudabaGuestSubmissionErrorSchema,
  413: fudabaGuestSubmissionErrorSchema,
  429: fudabaGuestSubmissionErrorSchema,
  500: fudabaGuestSubmissionErrorSchema,
}

export function resolveApiContract(
  method: string,
  path: string
): CatalogContract {
  if (method === "GET" && path === "/api/events")
    return {
      query: eventListQuerySchema,
      responses: { 200: eventPageSchema, 503: eventErrorResponseSchema },
    }
  if (method === "GET" && path === "/api/chronicle")
    return {
      query: editorialChronicleQuerySchema,
      responses: {
        200: editorialChroniclePageSchema,
        500: editorialErrorResponseSchema,
      },
    }
  if (method === "GET" && path === "/api/live-schedule")
    return {
      query: liveScheduleQuerySchema,
      responses: {
        200: liveScheduleListSchema,
        500: liveScheduleErrorResponseSchema,
      },
    }
  if (method === "GET" && path === "/api/about")
    return {
      responses: {
        200: aboutPageContentSchema,
        500: aboutErrorResponseSchema,
      },
    }
  if (method === "GET" && /^\/api\/events\/[^/]+$/.test(path))
    return {
      responses: {
        200: editorialArticleSchema,
        404: editorialErrorResponseSchema,
      },
    }
  if (method === "GET" && path === "/api/news")
    return {
      query: newsListQuerySchema,
      responses: {
        200: recommendationResponseSchema,
        500: newsErrorResponseSchema,
      },
    }
  if (method === "GET" && path === "/api/community-posts/spotlight")
    return {
      responses: {
        200: editorialSpotlightSchema,
        500: editorialErrorResponseSchema,
      },
    }
  if (method === "GET" && path === "/api/homepage-links")
    return {
      responses: {
        200: homepageLinksSchema,
        500: homepageLinkErrorResponseSchema,
      },
    }
  if (method === "GET" && path === "/api/wiki/catalog")
    return {
      query: wikiCatalogQuerySchema,
      responses: {
        200: [wikiPublicCatalogSchema, wikiErrorResponseSchema],
        400: wikiHttpErrorResponseSchema,
        500: wikiHttpErrorResponseSchema,
      },
    }
  if (method === "GET" && path === "/api/wiki/random_idol")
    return {
      responses: {
        200: [wikiRandomIdolSchema, wikiErrorResponseSchema],
        400: wikiHttpErrorResponseSchema,
        500: wikiHttpErrorResponseSchema,
      },
    }
  if (method === "GET" && path === "/api/wiki/random_bg")
    return {
      responses: {
        200: [wikiRandomBackgroundSchema, wikiErrorResponseSchema],
        400: wikiHttpErrorResponseSchema,
        500: wikiHttpErrorResponseSchema,
      },
    }
  if (method === "GET" && path === "/api/wiki/stories")
    return {
      query: wikiStoriesQuerySchema,
      responses: {
        200: [wikiPublicStoriesSchema, wikiErrorResponseSchema],
        400: wikiHttpErrorResponseSchema,
        500: wikiHttpErrorResponseSchema,
      },
    }
  if (method === "GET" && path === "/api/cards")
    return {
      query: namecardListQuerySchema,
      responses: {
        200: namecardPageSchema,
        400: namecardErrorResponseSchema,
        500: namecardErrorResponseSchema,
        503: namecardListErrorResponseSchema,
      },
    }
  if (method === "GET" && path === "/api/reactions")
    return {
      query: namecardReactionListQuerySchema,
      responses: {
        200: reactionSchema,
        400: namecardErrorResponseSchema,
        500: namecardErrorResponseSchema,
      },
    }

  const exchange = "/api/community/exchange"
  if (method === "GET" && path === `${exchange}/series`)
    return { responses: { 200: fudabaSeriesListSchema, ...fudabaErrors } }
  if (method === "GET" && path === `${exchange}/offices`)
    return {
      query: fudabaOfficeQuerySchema,
      responses: { 200: fudabaOfficePageSchema, ...fudabaErrors },
    }
  if (method === "GET" && path === `${exchange}/cards`)
    return {
      query: fudabaCardQuerySchema,
      responses: { 200: fudabaCardPageSchema, ...fudabaErrors },
    }
  if (
    method === "GET" &&
    /^\/api\/community\/exchange\/cards\/[^/]+\/reactions$/.test(path)
  )
    return {
      responses: { 200: fudabaCardReactionsResponseSchema, ...fudabaErrors },
    }
  if (
    method === "GET" &&
    /^\/api\/community\/exchange\/offices\/[^/]+$/.test(path)
  )
    return { responses: { 200: fudabaOfficeDetailSchema, ...fudabaErrors } }
  if (method === "GET" && path === `${exchange}/map/config`)
    return { responses: { 200: fudabaMapConfigSchema, ...fudabaErrors } }
  if (method === "GET" && path === `${exchange}/map/offices`)
    return {
      query: fudabaMapQuerySchema,
      responses: { 200: fudabaMapOfficeListSchema, ...fudabaErrors },
    }
  if (method === "GET" && path === `${exchange}/places/search`)
    return {
      query: fudabaPlaceSearchQuerySchema,
      responses: { 200: fudabaPlaceSearchResponseSchema, ...fudabaErrors },
    }
  if (method === "GET" && path === `${exchange}/me/series`)
    return {
      query: fudabaIgnoredQuerySchema,
      responses: { 200: fudabaSeriesListSchema, ...fudabaErrors },
    }
  if (method === "GET" && path === `${exchange}/me/cards`)
    return {
      query: fudabaIgnoredQuerySchema,
      responses: { 200: fudabaOwnerCardListSchema, ...fudabaErrors },
    }
  if (
    method === "GET" &&
    /^\/api\/community\/exchange\/me\/cards\/[^/]+$/.test(path)
  )
    return { responses: { 200: fudabaOwnerCardDetailSchema, ...fudabaErrors } }
  if (
    method === "PUT" &&
    /^\/api\/community\/exchange\/me\/cards\/[^/]+$/.test(path)
  )
    return {
      body: fudabaCardUpdateRequestSchema,
      responses: { 200: fudabaCardMutationResponseSchema, ...fudabaErrors },
    }
  if (method === "GET" && path === `${exchange}/me/favorites`)
    return {
      query: fudabaCardQuerySchema,
      responses: { 200: fudabaCardPageSchema, ...fudabaErrors },
    }
  if (method === "GET" && path === `${exchange}/me/offices`)
    return {
      query: fudabaIgnoredQuerySchema,
      responses: { 200: fudabaOwnerOfficeListSchema, ...fudabaErrors },
    }
  if (
    method === "GET" &&
    /^\/api\/community\/exchange\/me\/offices\/[^/]+$/.test(path)
  )
    return {
      responses: { 200: fudabaOwnerOfficeDetailSchema, ...fudabaErrors },
    }
  if (
    method === "PUT" &&
    /^\/api\/community\/exchange\/me\/offices\/[^/]+$/.test(path)
  )
    return {
      body: fudabaOfficeUpdateRequestSchema,
      responses: { 200: fudabaOfficeMutationResponseSchema, ...fudabaErrors },
    }
  if (
    method === "GET" &&
    /^\/api\/community\/exchange\/me\/offices\/[^/]+\/location$/.test(path)
  )
    return {
      responses: { 200: fudabaOwnerLocationDetailSchema, ...fudabaErrors },
    }
  if (
    method === "PUT" &&
    /^\/api\/community\/exchange\/me\/offices\/[^/]+\/location$/.test(path)
  )
    return {
      body: fudabaOwnerLocationSaveRequestSchema,
      responses: {
        200: fudabaOwnerLocationMutationResponseSchema,
        ...fudabaErrors,
      },
    }
  if (
    method === "DELETE" &&
    /^\/api\/community\/exchange\/me\/offices\/[^/]+\/location$/.test(path)
  )
    return {
      body: fudabaRevisionRequestSchema,
      responses: {
        200: fudabaOwnerLocationWithdrawalResponseSchema,
        ...fudabaErrors,
      },
    }
  if (
    method === "PUT" &&
    /^\/api\/community\/exchange\/offices\/[^/]+\/cards\/[^/]+\/placement$/.test(
      path
    )
  )
    return {
      body: fudabaCardPlacementSaveRequestSchema,
      responses: {
        200: fudabaCardPlacementSaveResponseSchema,
        201: fudabaCardPlacementSaveResponseSchema,
        ...fudabaErrors,
      },
    }
  if (
    method === "DELETE" &&
    /^\/api\/community\/exchange\/offices\/[^/]+\/cards\/[^/]+\/placement$/.test(
      path
    )
  )
    return {
      body: fudabaCardPlacementDeleteRequestSchema,
      responses: {
        200: fudabaCardPlacementDeleteResponseSchema,
        ...fudabaErrors,
      },
    }
  if (method === "POST" && path === `${exchange}/guest-submissions`)
    return {
      rawBody: {
        name: "guest namecard multipart request",
        reason:
          "FormData is a Web-local non-JSON boundary without a shared request schema",
        schema: guestSubmissionMultipartSchema,
        contentType: multipartFormDataContentTypeSchema,
      },
      responses: {
        200: fudabaGuestSubmissionReceiptSchema,
        ...fudabaGuestSubmissionErrors,
      },
    }
  if (
    method === "POST" &&
    /^\/api\/community\/exchange\/legacy-cards\/[^/]+\/claims$/.test(path)
  )
    return {
      body: fudabaLegacyCardClaimRequestSchema,
      responses: {
        200: claimMutationSchema,
        201: claimMutationSchema,
        ...fudabaClaimErrors,
      },
    }
  if (method === "GET" && path === `${exchange}/me/claim-envelopes`)
    return {
      responses: { 200: claimEnvelopeListSchema, ...fudabaClaimErrors },
    }
  if (
    method === "PUT" &&
    /^\/api\/community\/exchange\/me\/claim-envelopes\/[^/]+$/.test(path)
  )
    return {
      body: fudabaClaimEnvelopeActionRequestSchema,
      responses: { 200: envelopeMutationSchema, ...fudabaClaimErrors },
    }

  if (method === "GET" && path === "/api/platform/auth/oauth/providers")
    return {
      responses: {
        200: platformOAuthProvidersResponseSchema,
        500: platformHttpErrorSchema,
      },
    }
  if (method === "GET" && path === "/api/platform/auth/session")
    return {
      responses: { 200: platformSessionSchema, 401: platformHttpErrorSchema },
    }
  if (method === "POST" && path === "/api/platform/auth/refresh")
    return {
      responses: { 200: platformSessionSchema, 401: platformHttpErrorSchema },
    }
  if (method === "POST" && path === "/api/platform/auth/logout")
    return {
      responses: { 200: successFlagSchema, 401: platformHttpErrorSchema },
    }
  if (method === "POST" && path === "/api/platform/auth/login")
    return {
      body: platformLoginRequestSchema,
      responses: {
        200: platformSessionSchema,
        400: platformHttpErrorSchema,
        401: platformHttpErrorSchema,
      },
    }
  if (
    method === "POST" &&
    path === "/api/platform/auth/register/verification-code"
  )
    return {
      body: platformRegistrationVerificationRequestSchema,
      responses: {
        200: platformRegistrationVerificationResponseSchema,
        202: platformRegistrationVerificationResponseSchema,
        400: platformHttpErrorSchema,
        429: platformHttpErrorSchema,
      },
    }
  if (method === "POST" && path === "/api/platform/auth/register")
    return {
      body: platformRegisterRequestSchema,
      responses: {
        200: platformSessionSchema,
        201: platformSessionSchema,
        400: platformHttpErrorSchema,
        409: platformHttpErrorSchema,
      },
    }
  if (method === "GET" && path === "/api/platform/me")
    return {
      responses: {
        200: platformProfileResponseSchema,
        401: platformHttpErrorSchema,
      },
    }
  if (method === "PUT" && path === "/api/platform/me")
    return {
      body: platformProfileUpdateRequestSchema,
      responses: {
        200: platformProfileMutationResponseSchema,
        400: platformProfileHttpErrorSchema,
        401: platformProfileHttpErrorSchema,
        409: platformProfileHttpErrorSchema,
      },
    }

  if (method === "GET" && path === "/api/admin/homepage-links")
    return {
      responses: { 200: homepageLinksSchema, ...protectedErrors },
    }
  if (method === "PUT" && path === "/api/admin/homepage-links/navigation/order")
    return {
      body: homepageLinkOrderRequestSchema,
      responses: { 200: successFlagSchema, ...protectedErrors },
    }
  if (
    method === "GET" &&
    path === "/api/admin/community/exchange/office-locations"
  )
    return {
      query: fudabaLocationReviewQuerySchema,
      responses: {
        200: [fudabaLocationReviewListSchema, fudabaLocationReviewErrorSchema],
        400: fudabaLocationReviewErrorSchema,
        401: fudabaAdminLocationReviewHttpErrorSchema,
        403: fudabaAdminLocationReviewHttpErrorSchema,
      },
    }
  if (
    method === "PUT" &&
    /^\/api\/admin\/community\/exchange\/office-locations\/[^/]+$/.test(path)
  )
    return {
      body: fudabaLocationReviewRequestSchema,
      responses: {
        200: [
          fudabaLocationReviewMutationSchema,
          fudabaLocationReviewErrorSchema,
        ],
        400: fudabaLocationReviewErrorSchema,
        401: fudabaAdminLocationReviewHttpErrorSchema,
        403: fudabaAdminLocationReviewHttpErrorSchema,
      },
    }
  if (method === "GET" && path === "/api/admin/community/exchange/card-reviews")
    return {
      responses: {
        200: [registeredCardReviewListSchema, fudabaCardClaimErrorSchema],
        400: fudabaCardClaimErrorSchema,
        401: fudabaAdminCardClaimHttpErrorSchema,
        403: fudabaAdminCardClaimHttpErrorSchema,
      },
    }
  if (
    method === "PUT" &&
    /^\/api\/admin\/community\/exchange\/card-reviews\/[^/]+$/.test(path)
  )
    return {
      body: fudabaCardReviewRequestSchema,
      responses: {
        200: [reviewMutationSchema, fudabaCardClaimErrorSchema],
        400: fudabaCardClaimErrorSchema,
        401: fudabaAdminCardClaimHttpErrorSchema,
        403: fudabaAdminCardClaimHttpErrorSchema,
      },
    }
  if (method === "GET" && path === "/api/admin/community/exchange/card-claims")
    return {
      responses: {
        200: [adminCardClaimListSchema, fudabaCardClaimErrorSchema],
        400: fudabaCardClaimErrorSchema,
        401: fudabaAdminCardClaimHttpErrorSchema,
        403: fudabaAdminCardClaimHttpErrorSchema,
      },
    }
  if (
    method === "PUT" &&
    /^\/api\/admin\/community\/exchange\/card-claims\/[^/]+$/.test(path)
  )
    return {
      body: fudabaCardReviewRequestSchema,
      responses: {
        200: [reviewMutationSchema, fudabaCardClaimErrorSchema],
        400: fudabaCardClaimErrorSchema,
        401: fudabaAdminCardClaimHttpErrorSchema,
        403: fudabaAdminCardClaimHttpErrorSchema,
      },
    }
  if (method === "GET" && path === "/api/admin/cards")
    return {
      query: adminNamecardListQuerySchema,
      responses: {
        200: adminNamecardListResponseSchema,
        401: adminNamecardHttpErrorSchema,
      },
    }
  if (method === "GET" && path === "/api/admin/accounts")
    return {
      responses: {
        200: adminAccountListSchema,
        401: adminAccountEndpointErrorResponseSchema,
        403: adminAccountEndpointErrorResponseSchema,
      },
    }
  if (method === "GET" && path === "/api/admin/site-packages")
    return {
      responses: {
        200: sitePackageListSchema,
        401: sitePackageHttpErrorSchema,
      },
    }
  if (method === "GET" && path === "/api/admin/producer-map")
    return {
      responses: { 200: producerMapAdminSnapshotSchema, ...protectedErrors },
    }
  if (method === "GET" && path === "/api/admin/about")
    return {
      responses: { 200: aboutAdminSnapshotSchema, ...protectedErrors },
    }
  if (method === "PUT" && path === "/api/admin/about")
    return {
      body: aboutPageUpdateRequestSchema,
      responses: { 200: aboutAdminUpdateSchema, ...protectedErrors },
    }
  if (method === "POST" && path === "/api/admin/about/member-avatar")
    return {
      rawBody: {
        name: "about avatar multipart request",
        reason:
          "FormData is a Web-local non-JSON boundary without a shared request schema",
        schema: aboutAvatarMultipartSchema,
        contentType: multipartFormDataContentTypeSchema,
      },
      responses: { 200: aboutImageUploadSchema, ...protectedErrors },
    }
  if (method === "GET" && path === "/api/admin/wiki/catalog")
    return {
      responses: {
        200: [wikiAdminCatalogSchema, wikiErrorResponseSchema],
        400: wikiHttpErrorResponseSchema,
        401: wikiHttpErrorResponseSchema,
        403: wikiHttpErrorResponseSchema,
        500: wikiHttpErrorResponseSchema,
      },
    }
  if (
    method === "GET" &&
    /^\/api\/admin\/wiki\/agencies\/[^/]+\/story-cover-assets$/.test(path)
  )
    return {
      responses: {
        200: [wikiStoryCoverAssetsSchema, wikiErrorResponseSchema],
        400: wikiHttpErrorResponseSchema,
        401: wikiHttpErrorResponseSchema,
        403: wikiHttpErrorResponseSchema,
        500: wikiHttpErrorResponseSchema,
      },
    }

  throw new Error(`No contracts catalog entry for ${method} ${path}`)
}
