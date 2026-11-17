import { adminExchangePath } from "@imsweb/contracts/paths"
import { parsed } from "../../parsed"
import { adminApiClient } from "../../admin-client"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"

import {
  fudabaAdminLocationReviewHttpErrorSchema,
  fudabaLocationReviewErrorSchema,
  fudabaLocationReviewListSchema,
  fudabaLocationReviewMutationSchema,
  fudabaLocationReviewQuerySchema,
  fudabaLocationReviewRequestSchema,
} from "@imsweb/contracts/fudaba/location-review"

import type {
  FudabaLocationReviewDecision,
  FudabaLocationReviewState,
} from "@imsweb/contracts/fudaba/location-review"

export {
  fudabaLocationReviewSchema,
  fudabaLocationReviewListSchema,
  fudabaLocationReviewMutationSchema,
} from "@imsweb/contracts/fudaba/location-review"
export type * from "@imsweb/contracts/fudaba/location-review"

export function getFudabaLocationReviews(
  state: FudabaLocationReviewState,
  limit = 50
) {
  const request = fudabaLocationReviewQuerySchema.parse({
    state,
    limit: String(limit),
  })
  const query = new URLSearchParams({
    state: request.state ?? "pending",
    limit: request.limit ?? "50",
  })
  return adminApiClient.Get(
    adminExchangePath(`/office-locations?${query}`),
    parsed(fudabaLocationReviewListSchema, {
      errorSchema: fudabaAdminLocationReviewHttpErrorSchema,
      businessErrorSchema: fudabaLocationReviewErrorSchema,
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
  const submission = fudabaLocationReviewRequestSchema.parse(input)
  return adminApiClient.Put(
    adminExchangePath(`/office-locations/${encodeURIComponent(officeId)}`),
    submission,
    parsed(fudabaLocationReviewMutationSchema, {
      errorSchema: fudabaAdminLocationReviewHttpErrorSchema,
      businessErrorSchema: fudabaLocationReviewErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}
