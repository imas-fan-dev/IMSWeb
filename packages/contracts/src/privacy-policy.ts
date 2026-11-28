import { z } from "zod"
import {
  errorResponseSchema,
  exactJsonResponse,
  strictRequestObject,
  successEnvelope,
} from "./common.js"

export const privacyPolicyTitleMaxLength = 120
export const privacyPolicyBodyMaxLength = 20000

const privacyPolicyDraftFields = {
  enabled: z.boolean(),
  title: z.string().min(1).max(privacyPolicyTitleMaxLength),
  body: z.string().min(1).max(privacyPolicyBodyMaxLength),
}

/** 登录页展示的条款正文；updatedAt 为 null 表示使用的是内置默认文本。 */
export const privacyPolicyContentSchema = exactJsonResponse({
  ...privacyPolicyDraftFields,
  updatedAt: z.string().datetime().nullable(),
})

/** 公开读取：未配置时返回内置默认条款，管理端关闭后 policy 为 null。 */
export const privacyPolicyPublicResponseSchema = exactJsonResponse({
  policy: privacyPolicyContentSchema.nullable(),
})

export const privacyPolicyDraftSchema = strictRequestObject(privacyPolicyDraftFields)

export const adminPrivacyPolicySnapshotSchema = exactJsonResponse({
  content: privacyPolicyContentSchema,
  revision: z.string().nullable(),
})

export const adminPrivacyPolicyUpdateRequestSchema = strictRequestObject({
  content: privacyPolicyDraftSchema,
  revision: z.string().min(1).nullable(),
})

export const adminPrivacyPolicyUpdateSchema = successEnvelope({
  content: privacyPolicyContentSchema,
  revision: z.string().min(1),
})

export const privacyPolicyErrorResponseSchema = errorResponseSchema

export type PrivacyPolicyDraft = z.infer<typeof privacyPolicyDraftSchema>
export type PrivacyPolicyContent = z.infer<typeof privacyPolicyContentSchema>
export type PrivacyPolicyPublicResponse = z.infer<typeof privacyPolicyPublicResponseSchema>
export type AdminPrivacyPolicySnapshot = z.infer<typeof adminPrivacyPolicySnapshotSchema>
export type AdminPrivacyPolicyUpdateRequest = z.infer<typeof adminPrivacyPolicyUpdateRequestSchema>
export type AdminPrivacyPolicyUpdate = z.infer<typeof adminPrivacyPolicyUpdateSchema>
export type PrivacyPolicyErrorResponse = z.infer<typeof privacyPolicyErrorResponseSchema>
