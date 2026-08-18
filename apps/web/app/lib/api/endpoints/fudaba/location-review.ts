import { z } from "@imsweb/contracts/z"

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
  return adminApiClient.Get<
    z.infer<typeof fudabaLocationReviewListSchema>,
    unknown
  >(`/api/admin/community/exchange/office-locations?${query}`, {
    meta: withBackofficeAuth(),
    transform: (payload) => fudabaLocationReviewListSchema.parse(payload),
  })
}

export function reviewFudabaLocation(
  officeId: string,
  input: {
    decision: FudabaLocationReviewDecision
    expectedRevision: number
    note: string
  }
) {
  return adminApiClient.Put<
    z.infer<typeof fudabaLocationReviewMutationSchema>,
    unknown
  >(
    `/api/admin/community/exchange/office-locations/${encodeURIComponent(officeId)}`,
    input,
    {
      meta: withBackofficeCsrf(),
      transform: (payload) => fudabaLocationReviewMutationSchema.parse(payload),
    }
  )
}
