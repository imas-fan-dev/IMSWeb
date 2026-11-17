import { z } from "zod"
import {
  errorResponseSchema,
  failureMessageResponseSchema,
  legacyStripRequestObject,
  messageErrorResponseSchema,
} from "./common.js"

export const namecardMediaParamsSchema = legacyStripRequestObject({
  filename: z.string().optional(),
})

export const mediaAuthorizationErrorResponseSchema =
  messageErrorResponseSchema

export const mediaHttpErrorSchema = z.union([
  errorResponseSchema,
  messageErrorResponseSchema,
  failureMessageResponseSchema,
])

export type NamecardMediaParams = z.infer<typeof namecardMediaParamsSchema>

export type MediaAuthorizationErrorResponse = z.infer<
  typeof mediaAuthorizationErrorResponseSchema
>

export type MediaHttpError = z.infer<typeof mediaHttpErrorSchema>
