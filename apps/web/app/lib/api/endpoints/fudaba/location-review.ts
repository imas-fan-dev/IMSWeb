import { parsed } from "../../parsed"
import { adminApiClient } from "../../admin-client"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"

import {
  fudabaLocationReviewListSchema,
  fudabaLocationReviewMutationSchema,
} from "@imsweb/contracts/fudaba/location-review"

import type {
  FudabaLocationReviewDecision,
  FudabaLocationReviewState,
} from "@imsweb/contracts/fudaba/location-review"

export * from "@imsweb/contracts/fudaba/location-review"

export function getFudabaLocationReviews(
  state: FudabaLocationReviewState,
  limit = 50
) {
  const query = new URLSearchParams({
    state,
    limit: String(limit),
  })
  return adminApiClient.Get(
    `/api/admin/community/exchange/office-locations?${query}`,
    parsed(fudabaLocationReviewListSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function reviewFudabaLocation(
  officeId: string,
  input: {
    decision: FudabaLocationReviewDecision
    expectedRevision: number
    note: string
  }
) {
  return adminApiClient.Put(
    `/api/admin/community/exchange/office-locations/${encodeURIComponent(officeId)}`,
    input,
    parsed(fudabaLocationReviewMutationSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}
