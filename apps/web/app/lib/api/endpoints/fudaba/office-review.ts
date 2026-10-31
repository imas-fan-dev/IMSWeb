import { adminExchangePath } from "@imsweb/contracts/paths"
import {
  adminOfficeReviewSchema,
  adminOfficeReviewListSchema,
  adminOfficeReviewDetailSchema,
  adminOfficeMutationSchema,
  adminOfficeReviewQuerySchema,
  adminOfficeReviewRequestSchema,
  adminOfficeHttpErrorSchema,
} from "@imsweb/contracts/fudaba/office-review"
import {
  fudabaOfficeUpdateRequestSchema,
  fudabaMapConfigSchema,
  fudabaSeriesListSchema,
  fudabaPlaceSearchResponseSchema,
  fudabaPlaceReverseResponseSchema,
  fudabaPlaceReverseQuerySchema,
  fudabaPlaceSearchQuerySchema,
} from "@imsweb/contracts/fudaba"
import type { FudabaPlaceReverseQuery } from "@imsweb/contracts/fudaba"
import type {
  AdminOfficeReviewState,
  AdminOfficeReviewDecision,
} from "@imsweb/contracts/fudaba/office-review"
import type { UpdateFudabaOfficeInput } from "./index"
import { adminApiClient } from "../../admin-client"
import { parsed } from "../../parsed"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"

export { adminOfficeReviewSchema }
export type * from "@imsweb/contracts/fudaba/office-review"

export function getAdminOfficeReviews(
  state: AdminOfficeReviewState,
  limit = 50
) {
  const query = adminOfficeReviewQuerySchema.parse({
    state,
    limit: String(limit),
  })
  return adminApiClient.Get(
    adminExchangePath(
      `/offices?${new URLSearchParams({ state: query.state ?? "pending", limit: query.limit ?? "50" })}`
    ),
    parsed(adminOfficeReviewListSchema, {
      errorSchema: adminOfficeHttpErrorSchema,
      businessErrorSchema: adminOfficeHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}
export function getAdminOffice(officeId: string) {
  return adminApiClient.Get(
    adminExchangePath(`/offices/${encodeURIComponent(officeId)}`),
    parsed(adminOfficeReviewDetailSchema, {
      errorSchema: adminOfficeHttpErrorSchema,
      businessErrorSchema: adminOfficeHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}
export function updateAdminOffice(
  officeId: string,
  input: UpdateFudabaOfficeInput
) {
  return adminApiClient.Put(
    adminExchangePath(`/offices/${encodeURIComponent(officeId)}`),
    fudabaOfficeUpdateRequestSchema.parse(input),
    parsed(adminOfficeMutationSchema, {
      errorSchema: adminOfficeHttpErrorSchema,
      businessErrorSchema: adminOfficeHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}
export function reviewAdminOffice(
  officeId: string,
  input: {
    decision: AdminOfficeReviewDecision
    expectedRevision: number
    note: string
  }
) {
  return adminApiClient.Put(
    adminExchangePath(`/offices/${encodeURIComponent(officeId)}/review`),
    adminOfficeReviewRequestSchema.parse(input),
    parsed(adminOfficeMutationSchema, {
      errorSchema: adminOfficeHttpErrorSchema,
      businessErrorSchema: adminOfficeHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}
export function getAdminOfficeSeries() {
  return adminApiClient.Get(
    adminExchangePath("/office-series"),
    parsed(fudabaSeriesListSchema, {
      errorSchema: adminOfficeHttpErrorSchema,
      businessErrorSchema: adminOfficeHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}
export function getAdminOfficeMapConfig() {
  return adminApiClient.Get(
    adminExchangePath("/map/config"),
    parsed(fudabaMapConfigSchema, {
      errorSchema: adminOfficeHttpErrorSchema,
      businessErrorSchema: adminOfficeHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}
export function reverseAdminOfficePlace(point: FudabaPlaceReverseQuery) {
  const query = fudabaPlaceReverseQuerySchema.parse(point)
  return adminApiClient.Get(
    adminExchangePath(
      `/places/reverse?${new URLSearchParams({ longitude: String(query.longitude), latitude: String(query.latitude) })}`
    ),
    parsed(fudabaPlaceReverseResponseSchema, {
      errorSchema: adminOfficeHttpErrorSchema,
      businessErrorSchema: adminOfficeHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}
export function searchAdminOfficePlaces(value: string) {
  const query = fudabaPlaceSearchQuerySchema.parse({ q: value })
  return adminApiClient.Get(
    adminExchangePath(`/places/search?${new URLSearchParams(query)}`),
    parsed(fudabaPlaceSearchResponseSchema, {
      errorSchema: adminOfficeHttpErrorSchema,
      businessErrorSchema: adminOfficeHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}
