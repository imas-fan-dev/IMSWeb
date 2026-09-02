import {
  fudabaGuestSubmissionDetailSchema,
  fudabaGuestSubmissionReceiptSchema,
  fudabaGuestSubmissionWithdrawalSchema,
} from "@imsweb/contracts/fudaba/guest-submissions"
import { exchangePath } from "@imsweb/contracts/paths"

import { apiClient } from "../../client"
import { normalizeFudabaGuestSubmissionEnvelope } from "../../media-urls"
import { parsed } from "../../parsed"

export {
  fudabaGuestSubmissionDetailSchema,
  fudabaGuestSubmissionIdSchema,
  fudabaGuestSubmissionReceiptSchema,
  fudabaGuestSubmissionSchema,
  fudabaGuestSubmissionStatusSchema,
  fudabaGuestSubmissionSummarySchema,
  fudabaGuestSubmissionWithdrawalSchema,
} from "@imsweb/contracts/fudaba/guest-submissions"
export type * from "@imsweb/contracts/fudaba/guest-submissions"

export type FudabaGuestSubmissionMediaSide = "front" | "back"

export interface UploadFudabaGuestSubmissionMetadata {
  seriesCode: string
  favoriteIdolIds: number[]
  producerName?: string
  displayName?: string
  bio?: string
  accent?: string
}

export function uploadFudabaGuestSubmission(
  front: File,
  back: File,
  metadata: UploadFudabaGuestSubmissionMetadata
) {
  const form = new FormData()
  form.append("images", front)
  form.append("images", back)
  form.append("seriesCode", metadata.seriesCode)
  form.append("favoriteIdolIds", JSON.stringify(metadata.favoriteIdolIds))
  for (const field of [
    "producerName",
    "displayName",
    "bio",
    "accent",
  ] as const) {
    const value = metadata[field]?.trim()
    if (value) form.append(field, value)
  }
  return apiClient.Post(
    exchangePath("/guest-submissions"),
    form,
    parsed(fudabaGuestSubmissionReceiptSchema)
  )
}

export function getFudabaGuestSubmission(id: number, withdrawalToken: string) {
  return apiClient.Get(
    exchangePath(`/guest-submissions/${id}`),
    parsed(fudabaGuestSubmissionDetailSchema, {
      headers: {
        "X-Fudaba-Guest-Submission-Token": withdrawalToken,
      },
      select: normalizeFudabaGuestSubmissionEnvelope,
    })
  )
}

export function getFudabaGuestSubmissionMedia(
  id: number,
  side: FudabaGuestSubmissionMediaSide,
  withdrawalToken: string
) {
  return apiClient.Get<Blob>(
    exchangePath(`/guest-submissions/${id}/media/${side}`),
    {
      headers: {
        "X-Fudaba-Guest-Submission-Token": withdrawalToken,
      },
      meta: { responseType: "blob" },
    }
  )
}

export function withdrawFudabaGuestSubmission(
  id: number,
  withdrawalToken: string,
  expectedRevision: number
) {
  return apiClient.Post(
    exchangePath(`/guest-submissions/${id}/withdraw`),
    { expectedRevision },
    parsed(fudabaGuestSubmissionWithdrawalSchema, {
      headers: {
        "X-Fudaba-Guest-Submission-Token": withdrawalToken,
      },
      select: normalizeFudabaGuestSubmissionEnvelope,
    })
  )
}
