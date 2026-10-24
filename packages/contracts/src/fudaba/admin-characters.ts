import { z } from "zod"
import {
  backofficeProtectedHttpErrorSchema,
  exactJsonResponse,
  numberedPageInfoSchema,
  strictRequestObject,
  successEnvelope,
} from "../common.js"
import {
  NAMECARD_CHARACTER_CATEGORIES,
  NAMECARD_CHARACTER_DEFAULT_PAGE_SIZE,
  NAMECARD_CHARACTER_MAX_PAGE_SIZE,
  NAMECARD_CHARACTER_MAX_QUERY_LENGTH,
} from "./namecard-runtime.js"

export {
  NAMECARD_CHARACTER_CATEGORIES,
  NAMECARD_CHARACTER_DEFAULT_PAGE_SIZE,
  NAMECARD_CHARACTER_MAX_PAGE_SIZE,
  NAMECARD_CHARACTER_MAX_QUERY_LENGTH,
} from "./namecard-runtime.js"

export const namecardCharacterCategorySchema = z.enum(NAMECARD_CHARACTER_CATEGORIES)

const characterIdSchema = z.number().int().safe().positive()
const agencyIdSchema = z.number().int().safe().positive()
const nameCnSchema = z.string().trim().min(1).max(120)
const nameJaSchema = z.string().trim().min(1).max(120).nullable()
const nameEnSchema = z.string().trim().min(1).max(160).nullable()
const aliasesSchema = z.string().max(4000).nullable()
const displayOrderSchema = z.number().int().safe().nonnegative()
const revisionSchema = z.number().int().safe().nonnegative()
const timestampSchema = z.string().datetime({ offset: true })

export const namecardCharacterSchema = exactJsonResponse({
  id: characterIdSchema,
  agencyId: agencyIdSchema,
  agencyCode: z.string().min(1),
  agencyName: z.string().min(1),
  agencyColor: z.string().min(1),
  category: namecardCharacterCategorySchema,
  isFallback: z.boolean(),
  nameCn: nameCnSchema,
  nameJa: nameJaSchema,
  nameEn: nameEnSchema,
  aliases: aliasesSchema,
  displayOrder: displayOrderSchema,
  revision: revisionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const namecardCharacterListSchema = successEnvelope({
  characters: z.array(namecardCharacterSchema),
  pageInfo: numberedPageInfoSchema,
})

/** Query values arrive as strings; the domain parses and clamps them. */
export const namecardCharacterListQuerySchema = strictRequestObject({
  query: z.string().trim().min(1).max(NAMECARD_CHARACTER_MAX_QUERY_LENGTH).optional(),
  agencyId: z.string().regex(/^\d+$/).optional(),
  category: namecardCharacterCategorySchema.optional(),
  page: z.string().regex(/^\d+$/).optional(),
  pageSize: z.string().regex(/^\d+$/).optional(),
})

export const namecardCharacterIdParamsSchema = strictRequestObject({
  id: z.string().regex(/^\d+$/),
})

const characterFieldsShape = {
  agencyId: agencyIdSchema,
  category: namecardCharacterCategorySchema,
  nameCn: nameCnSchema,
  nameJa: nameJaSchema.optional(),
  nameEn: nameEnSchema.optional(),
  aliases: aliasesSchema.optional(),
  displayOrder: displayOrderSchema.optional(),
  /**
   * Marks the entry as the escape hatch the picker offers when a search matches
   * nothing for its category. At most one live entry per category may carry it,
   * which the database enforces.
   */
  isFallback: z.boolean().optional(),
}

export const namecardCharacterCreateRequestSchema = strictRequestObject(
  characterFieldsShape,
)

/**
 * `revision` is the optimistic lock: the row the editor loaded must still be the
 * row being replaced, otherwise the write is refused with 409 rather than
 * silently discarding a concurrent edit.
 */
export const namecardCharacterUpdateRequestSchema = strictRequestObject({
  ...characterFieldsShape,
  revision: revisionSchema,
})

export const namecardCharacterDeleteQuerySchema = strictRequestObject({
  revision: z.string().regex(/^\d+$/),
})

export const namecardCharacterMutationSchema = successEnvelope({
  character: namecardCharacterSchema,
})

export const namecardCharacterDeleteSchema = successEnvelope({
  id: characterIdSchema,
})

export const namecardCharacterConflictSchema = exactJsonResponse({
  success: z.literal(false),
  code: z.literal("NAMECARD_CHARACTER_STATE_CONFLICT"),
  revision: revisionSchema,
})

/**
 * A stale editor write answers 409 with the conflict envelope rather than one of
 * the shared backoffice failure shapes, so the error channel accepts both.
 */
export const namecardCharacterAdminHttpErrorResponseSchema = z.union([
  backofficeProtectedHttpErrorSchema,
  namecardCharacterConflictSchema,
])

/**
 * The agency selector needs every agency, including the sentinel that hosts the
 * fallback buckets — that one has `wikiEnabled: false`, so the public Wiki
 * catalog cannot supply this list.
 */
export const namecardCharacterAgencySchema = exactJsonResponse({
  id: agencyIdSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
  wikiEnabled: z.boolean(),
})

export const namecardCharacterAgencyListSchema = successEnvelope({
  agencies: z.array(namecardCharacterAgencySchema),
})

export type NamecardCharacterCategory = z.infer<
  typeof namecardCharacterCategorySchema
>
export type NamecardCharacter = z.infer<typeof namecardCharacterSchema>
export type NamecardCharacterList = z.infer<typeof namecardCharacterListSchema>
export type NamecardCharacterListQuery = z.infer<
  typeof namecardCharacterListQuerySchema
>
export type NamecardCharacterIdParams = z.infer<
  typeof namecardCharacterIdParamsSchema
>
export type NamecardCharacterCreateRequest = z.infer<
  typeof namecardCharacterCreateRequestSchema
>
export type NamecardCharacterUpdateRequest = z.infer<
  typeof namecardCharacterUpdateRequestSchema
>
export type NamecardCharacterDeleteQuery = z.infer<
  typeof namecardCharacterDeleteQuerySchema
>
export type NamecardCharacterMutation = z.infer<
  typeof namecardCharacterMutationSchema
>
export type NamecardCharacterConflict = z.infer<
  typeof namecardCharacterConflictSchema
>
export type NamecardCharacterDelete = z.infer<
  typeof namecardCharacterDeleteSchema
>
export type NamecardCharacterAdminHttpErrorResponse = z.infer<
  typeof namecardCharacterAdminHttpErrorResponseSchema
>
export type NamecardCharacterAgency = z.infer<
  typeof namecardCharacterAgencySchema
>
export type NamecardCharacterAgencyList = z.infer<
  typeof namecardCharacterAgencyListSchema
>
