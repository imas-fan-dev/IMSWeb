import { z } from "zod"
import { exactJsonResponse } from "./common.js"

export const healthLiveResponseSchema = exactJsonResponse({
  status: z.literal("ok"),
})

export const healthReadySuccessResponseSchema = exactJsonResponse({
  status: z.literal("ok"),
})

export const healthReadyUnavailableResponseSchema = exactJsonResponse({
  status: z.literal("unavailable"),
})

export const healthReadyResponseSchema = z.union([
  healthReadySuccessResponseSchema,
  healthReadyUnavailableResponseSchema,
])

export type HealthLiveResponse = z.infer<typeof healthLiveResponseSchema>
export type HealthReadySuccessResponse = z.infer<
  typeof healthReadySuccessResponseSchema
>
export type HealthReadyUnavailableResponse = z.infer<
  typeof healthReadyUnavailableResponseSchema
>
export type HealthReadyResponse = z.infer<typeof healthReadyResponseSchema>
