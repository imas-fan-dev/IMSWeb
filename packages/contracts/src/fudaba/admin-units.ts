import { z } from "zod"
import {
  backofficeProtectedHttpErrorSchema,
  exactJsonResponse,
  numberedPageInfoSchema,
  strictRequestObject,
  successEnvelope,
} from "../common.js"
import { namecardCharacterCategorySchema } from "./admin-characters.js"
import {
  NAMECARD_UNIT_MAX_AGENCIES,
  NAMECARD_UNIT_MAX_MEMBERS,
  NAMECARD_UNIT_MAX_QUERY_LENGTH,
} from "./namecard-runtime.js"

/**
 * A 组合 is a searchable shortcut in the namecard picker: picking one expands
 * into its member characters. The unit itself is never attached to a card, so
 * there is no card-side contract here — and because it is only ever expanded,
 * a unit may be filed under several agencies while a character may not.
 *
 * Members are always characters, never other units: nesting is not supported.
 */
export {
  NAMECARD_UNIT_DEFAULT_PAGE_SIZE,
  NAMECARD_UNIT_MAX_AGENCIES,
  NAMECARD_UNIT_MAX_MEMBERS,
  NAMECARD_UNIT_MAX_PAGE_SIZE,
  NAMECARD_UNIT_MAX_QUERY_LENGTH,
} from "./namecard-runtime.js"

const unitIdSchema = z.number().int().safe().positive()
const agencyIdSchema = z.number().int().safe().positive()
const characterIdSchema = z.number().int().safe().positive()
const nameCnSchema = z.string().trim().min(1).max(120)
const nameJaSchema = z.string().trim().min(1).max(120).nullable()
const nameEnSchema = z.string().trim().min(1).max(160).nullable()
const aliasesSchema = z.string().max(4000).nullable()
const displayOrderSchema = z.number().int().safe().nonnegative()
const revisionSchema = z.number().int().safe().nonnegative()
const timestampSchema = z.string().datetime({ offset: true })

export const namecardUnitAgencySchema = exactJsonResponse({
  id: agencyIdSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
})

export const namecardUnitMemberSchema = exactJsonResponse({
  characterId: characterIdSchema,
  nameCn: z.string().min(1),
  nameJa: nameJaSchema,
  nameEn: nameEnSchema,
  category: namecardCharacterCategorySchema,
})

export const namecardUnitSchema = exactJsonResponse({
  id: unitIdSchema,
  nameCn: nameCnSchema,
  nameJa: nameJaSchema,
  nameEn: nameEnSchema,
  aliases: aliasesSchema,
  displayOrder: displayOrderSchema,
  revision: revisionSchema,
  agencies: z.array(namecardUnitAgencySchema),
  members: z.array(namecardUnitMemberSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const namecardUnitListSchema = successEnvelope({
  units: z.array(namecardUnitSchema),
  pageInfo: numberedPageInfoSchema,
})

export const namecardUnitListQuerySchema = strictRequestObject({
  query: z.string().trim().min(1).max(NAMECARD_UNIT_MAX_QUERY_LENGTH).optional(),
  /** Comma-separated character ids; the unit must contain every one of them. */
  memberIds: z
    .string()
    .trim()
    .regex(/^\d+(,\d+)*$/)
    .optional(),
  agencyId: z.string().regex(/^\d+$/).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  pageSize: z.string().regex(/^\d+$/).optional(),
})

export const namecardUnitIdParamsSchema = strictRequestObject({
  id: z.string().regex(/^\d+$/),
})

/**
 * Agencies and members travel with the unit: the editor is one dialog, and a
 * unit without members has nothing to expand into.
 */
const unitFieldsShape = {
  nameCn: nameCnSchema,
  nameJa: nameJaSchema.optional(),
  nameEn: nameEnSchema.optional(),
  aliases: aliasesSchema.optional(),
  displayOrder: displayOrderSchema.optional(),
  agencyIds: z
    .array(agencyIdSchema)
    .min(1)
    .max(NAMECARD_UNIT_MAX_AGENCIES)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "agencyIds must be unique",
    }),
  memberIds: z
    .array(characterIdSchema)
    .min(1)
    .max(NAMECARD_UNIT_MAX_MEMBERS)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "memberIds must be unique",
    }),
}

export const namecardUnitCreateRequestSchema = strictRequestObject(unitFieldsShape)

export const namecardUnitUpdateRequestSchema = strictRequestObject({
  ...unitFieldsShape,
  revision: revisionSchema,
})

export const namecardUnitDeleteQuerySchema = strictRequestObject({
  revision: z.string().regex(/^\d+$/),
})

export const namecardUnitMutationSchema = successEnvelope({
  unit: namecardUnitSchema,
})

export const namecardUnitDeleteSchema = successEnvelope({
  id: unitIdSchema,
})

export const namecardUnitConflictSchema = exactJsonResponse({
  success: z.literal(false),
  code: z.literal("NAMECARD_UNIT_STATE_CONFLICT"),
  revision: revisionSchema,
})

/**
 * A stale editor write answers 409 with the conflict envelope rather than one of
 * the shared backoffice failure shapes, so the error channel accepts both.
 */
export const namecardUnitAdminHttpErrorResponseSchema = z.union([
  backofficeProtectedHttpErrorSchema,
  namecardUnitConflictSchema,
])

export type NamecardUnitAgency = z.infer<typeof namecardUnitAgencySchema>
export type NamecardUnitMember = z.infer<typeof namecardUnitMemberSchema>
export type NamecardUnit = z.infer<typeof namecardUnitSchema>
export type NamecardUnitList = z.infer<typeof namecardUnitListSchema>
export type NamecardUnitListQuery = z.infer<typeof namecardUnitListQuerySchema>
export type NamecardUnitIdParams = z.infer<typeof namecardUnitIdParamsSchema>
export type NamecardUnitCreateRequest = z.infer<
  typeof namecardUnitCreateRequestSchema
>
export type NamecardUnitUpdateRequest = z.infer<
  typeof namecardUnitUpdateRequestSchema
>
export type NamecardUnitDeleteQuery = z.infer<
  typeof namecardUnitDeleteQuerySchema
>
export type NamecardUnitMutation = z.infer<typeof namecardUnitMutationSchema>
export type NamecardUnitConflict = z.infer<typeof namecardUnitConflictSchema>
export type NamecardUnitDelete = z.infer<typeof namecardUnitDeleteSchema>
export type NamecardUnitAdminHttpErrorResponse = z.infer<
  typeof namecardUnitAdminHttpErrorResponseSchema
>
