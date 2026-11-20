import { z } from "zod"
import {
  NAMECARD_TAG_LIMIT,
  NAMECARD_TAG_MAX_LENGTH,
  NAMECARD_TAG_FILTER_LIMIT,
} from "./namecards-runtime.js"
import {
  exactJsonResponse,
  numberedPageInfoSchema,
  strictRequestObject,
  successEnvelope,
} from "./common.js"

/** 一个可提交的标签文本：修剪后 1–64 字。 */
export const namecardTagNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(NAMECARD_TAG_MAX_LENGTH)

/** 写请求里的整组标签：最多 20 项，去重由服务端在归一化之后完成。 */
export const namecardTagNamesSchema = z
  .array(namecardTagNameSchema)
  .max(NAMECARD_TAG_LIMIT)

/** 名片墙的重复标签筛选参数：每个词一个 `EXISTS`，词之间 OR。 */
export const namecardTagFilterNamesSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) =>
    value === undefined ? [] : Array.isArray(value) ? value : [value]
  )
  .pipe(
    z
      .array(namecardTagNameSchema)
      .max(NAMECARD_TAG_FILTER_LIMIT)
      .transform((values) => [...new Set(values)])
  )

/** 公开名片上显示的标签：显示名 + 命中的预设 id（自由标签为 null）。 */
export const namecardTagSchema = exactJsonResponse({
  name: z.string().trim().min(1).max(NAMECARD_TAG_MAX_LENGTH),
  presetId: z.number().int().positive().nullable(),
})

export const namecardTagListSchema = z
  .array(namecardTagSchema)
  .max(NAMECARD_TAG_LIMIT)

/** 独立标签端点：整组替换，返回落库后的规范形态。 */
export const namecardTagCardParamsSchema = strictRequestObject({
  cardId: z.string().trim().min(1).max(128),
})

export const namecardTagSetRequestSchema = strictRequestObject({
  tags: namecardTagNamesSchema,
})

export const namecardTagSetResponseSchema = exactJsonResponse({
  tags: namecardTagListSchema,
})

export const namecardTagSuggestQuerySchema = strictRequestObject({
  q: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const namecardTagSuggestionPresetSchema = exactJsonResponse({
  id: z.number().int().positive(),
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).max(50),
})

/**
 * 候选只来自预设标签（名称/别名命中，前缀优先）。自由标签由用户输入的原文
 * 直接创建，不进候选；墙上仍可按自由标签子串筛选。
 */
/** 提交前自检：只回被屏蔽词命中的原文，不暴露规则本身。 */
export const namecardTagValidateRequestSchema = strictRequestObject({
  names: z
    .array(z.string().trim().min(1).max(NAMECARD_TAG_MAX_LENGTH))
    .min(1)
    .max(NAMECARD_TAG_LIMIT),
})

export const namecardTagValidateResponseSchema = exactJsonResponse({
  blocked: z.array(z.string().max(NAMECARD_TAG_MAX_LENGTH)),
})

export const namecardTagSuggestResponseSchema = exactJsonResponse({
  presets: z.array(namecardTagSuggestionPresetSchema).max(50),
})

export type NamecardTagName = z.infer<typeof namecardTagNameSchema>
export type NamecardTag = z.infer<typeof namecardTagSchema>
export type NamecardTagCardParams = z.infer<
  typeof namecardTagCardParamsSchema
>
export type NamecardTagSetRequest = z.infer<typeof namecardTagSetRequestSchema>
export type NamecardTagSetResponse = z.infer<typeof namecardTagSetResponseSchema>
export type NamecardTagSuggestQuery = z.infer<
  typeof namecardTagSuggestQuerySchema
>
export type NamecardTagSuggestionPreset = z.infer<
  typeof namecardTagSuggestionPresetSchema
>
export type NamecardTagSuggestResponse = z.infer<
  typeof namecardTagSuggestResponseSchema
>

/* ---- 管理台：标签库 ---- */

const adminTagPage = z.coerce.number().int().min(1).default(1)
const adminTagPageSize = z.coerce.number().int().min(1).max(100).default(20)

export const adminNamecardTagFreeQuerySchema = strictRequestObject({
  q: z.string().trim().max(64).optional(),
  /** `frequency`（默认）按使用次数；`recent` 按首次出现时间。 */
  sort: z.enum(['frequency', 'recent']).default('frequency'),
  page: adminTagPage,
  pageSize: adminTagPageSize,
})

export const adminNamecardTagFreeSchema = exactJsonResponse({
  name: z.string().min(1),
  count: z.number().int().nonnegative(),
})

export const adminNamecardTagFreeListSchema = successEnvelope({
  items: z.array(adminNamecardTagFreeSchema).max(100),
  pageInfo: numberedPageInfoSchema,
})

export const adminNamecardTagPresetSchema = exactJsonResponse({
  id: z.number().int().positive(),
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).max(50),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export const adminNamecardTagPresetListQuerySchema = strictRequestObject({
  q: z.string().trim().max(64).optional(),
  page: adminTagPage,
  pageSize: adminTagPageSize,
})

export const adminNamecardTagPresetListSchema = successEnvelope({
  items: z.array(adminNamecardTagPresetSchema).max(100),
  pageInfo: numberedPageInfoSchema,
})

const aliasesSchema = z.array(namecardTagNameSchema).max(50).default([])

export const adminNamecardTagPresetCreateRequestSchema = strictRequestObject({
  name: namecardTagNameSchema,
  aliases: aliasesSchema,
})

export const adminNamecardTagPresetUpdateRequestSchema = strictRequestObject({
  name: namecardTagNameSchema.optional(),
  aliases: z.array(namecardTagNameSchema).max(50).optional(),
})

export const adminNamecardTagPresetParamsSchema = strictRequestObject({
  id: z.string().regex(/^\d+$/),
})

export const adminNamecardTagPresetMutationSchema = successEnvelope({
  preset: adminNamecardTagPresetSchema,
})

export const adminNamecardTagPresetDeleteSchema = successEnvelope({
  id: z.number().int().positive(),
})

/** 把自由标签并入已有预设的别名，并把现存标签指向它。 */
export const adminNamecardTagPresetMergeRequestSchema = strictRequestObject({
  name: namecardTagNameSchema,
})

/** 把一条自由标签提升为预设；预设名缺省就是标签自己。 */
export const adminNamecardTagPromoteRequestSchema = strictRequestObject({
  name: namecardTagNameSchema,
  presetName: namecardTagNameSchema.optional(),
  aliases: aliasesSchema,
})

export const adminNamecardTagPromoteResponseSchema = successEnvelope({
  preset: adminNamecardTagPresetSchema,
})

export const adminNamecardTagBlocklistItemSchema = exactJsonResponse({
  id: z.number().int().positive(),
  pattern: z.string().min(1),
  isRegex: z.boolean(),
  createdAt: z.string().min(1),
})

export const adminNamecardTagBlocklistListSchema = successEnvelope({
  items: z.array(adminNamecardTagBlocklistItemSchema).max(100),
  pageInfo: numberedPageInfoSchema,
})

export const adminNamecardTagBlocklistListQuerySchema = strictRequestObject({
  q: z.string().trim().max(80).optional(),
  page: adminTagPage,
  pageSize: adminTagPageSize,
})

export const adminNamecardTagBlocklistCreateRequestSchema = strictRequestObject(
  {
    pattern: z.string().trim().min(1).max(200),
    isRegex: z.boolean().default(false),
  }
)

export const adminNamecardTagBlocklistUpdateRequestSchema = strictRequestObject(
  {
    pattern: z.string().trim().min(1).max(200),
    isRegex: z.boolean(),
  }
)

export const adminNamecardTagBlocklistParamsSchema = strictRequestObject({
  id: z.string().regex(/^\d+$/),
})

export const adminNamecardTagBlocklistMutationSchema = successEnvelope({
  item: adminNamecardTagBlocklistItemSchema,
})

export const adminNamecardTagBlocklistDeleteSchema = successEnvelope({
  id: z.number().int().positive(),
})

/** 被屏蔽词命中的现存自由标签；`patternId` 是第一条命中的规则。 */
export const adminNamecardTagBlockedMatchSchema = exactJsonResponse({
  name: z.string().min(1),
  count: z.number().int().nonnegative(),
  patternId: z.number().int().positive(),
})

export const adminNamecardTagBlockedMatchListSchema = successEnvelope({
  items: z.array(adminNamecardTagBlockedMatchSchema).max(500),
})

/** 屏蔽一条自由标签：移除现存行 + 追加一条屏蔽词（默认按原文）。 */
export const adminNamecardTagBlockRequestSchema = strictRequestObject({
  name: namecardTagNameSchema,
  pattern: z.string().trim().min(1).max(200).optional(),
  isRegex: z.boolean().optional(),
})

export const adminNamecardTagBlockResultSchema = successEnvelope({
  removed: z.number().int().nonnegative(),
  item: adminNamecardTagBlocklistItemSchema,
})

/** 一键移除某条屏蔽词命中的全部自由标签（不删除屏蔽词本身）。 */
export const adminNamecardTagBlocklistRemoveMatchesSchema = successEnvelope({
  removed: z.number().int().nonnegative(),
})

export type AdminNamecardTagFreeQuery = z.infer<
  typeof adminNamecardTagFreeQuerySchema
>
export type AdminNamecardTagFree = z.infer<typeof adminNamecardTagFreeSchema>
export type AdminNamecardTagFreeList = z.infer<
  typeof adminNamecardTagFreeListSchema
>
export type AdminNamecardTagPreset = z.infer<
  typeof adminNamecardTagPresetSchema
>
export type AdminNamecardTagPresetList = z.infer<
  typeof adminNamecardTagPresetListSchema
>
export type AdminNamecardTagPresetListQuery = z.infer<
  typeof adminNamecardTagPresetListQuerySchema
>
export type AdminNamecardTagPromoteResponse = z.infer<
  typeof adminNamecardTagPromoteResponseSchema
>
export type AdminNamecardTagPresetCreateRequest = z.infer<
  typeof adminNamecardTagPresetCreateRequestSchema
>
export type AdminNamecardTagPresetUpdateRequest = z.infer<
  typeof adminNamecardTagPresetUpdateRequestSchema
>
export type AdminNamecardTagPresetParams = z.infer<
  typeof adminNamecardTagPresetParamsSchema
>
export type AdminNamecardTagPresetMutation = z.infer<
  typeof adminNamecardTagPresetMutationSchema
>
export type AdminNamecardTagPresetDelete = z.infer<
  typeof adminNamecardTagPresetDeleteSchema
>
export type AdminNamecardTagPresetMergeRequest = z.infer<
  typeof adminNamecardTagPresetMergeRequestSchema
>
export type AdminNamecardTagPromoteRequest = z.infer<
  typeof adminNamecardTagPromoteRequestSchema
>
export type AdminNamecardTagBlocklistItem = z.infer<
  typeof adminNamecardTagBlocklistItemSchema
>
export type AdminNamecardTagBlocklistList = z.infer<
  typeof adminNamecardTagBlocklistListSchema
>
export type AdminNamecardTagBlocklistListQuery = z.infer<
  typeof adminNamecardTagBlocklistListQuerySchema
>
export type AdminNamecardTagBlocklistCreateRequest = z.infer<
  typeof adminNamecardTagBlocklistCreateRequestSchema
>
export type AdminNamecardTagBlocklistUpdateRequest = z.infer<
  typeof adminNamecardTagBlocklistUpdateRequestSchema
>
export type AdminNamecardTagBlocklistParams = z.infer<
  typeof adminNamecardTagBlocklistParamsSchema
>
export type AdminNamecardTagBlocklistMutation = z.infer<
  typeof adminNamecardTagBlocklistMutationSchema
>
export type AdminNamecardTagBlocklistDelete = z.infer<
  typeof adminNamecardTagBlocklistDeleteSchema
>
export type AdminNamecardTagBlockedMatch = z.infer<
  typeof adminNamecardTagBlockedMatchSchema
>
export type AdminNamecardTagBlockedMatchList = z.infer<
  typeof adminNamecardTagBlockedMatchListSchema
>
export type AdminNamecardTagBlockRequest = z.infer<
  typeof adminNamecardTagBlockRequestSchema
>
export type AdminNamecardTagBlockResult = z.infer<
  typeof adminNamecardTagBlockResultSchema
>
export type AdminNamecardTagBlocklistRemoveMatches = z.infer<
  typeof adminNamecardTagBlocklistRemoveMatchesSchema
>

export type NamecardTagValidateRequest = z.infer<
  typeof namecardTagValidateRequestSchema
>
export type NamecardTagValidateResponse = z.infer<
  typeof namecardTagValidateResponseSchema
>
