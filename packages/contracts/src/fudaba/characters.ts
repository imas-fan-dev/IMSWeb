import { z } from "zod"
import { exactJsonResponse } from "../common.js"
import { namecardCharacterCategorySchema } from "./admin-characters.js"

export { NAMECARD_FAVORITE_CHARACTER_LIMIT } from "./namecard-runtime.js"

const catalogIdSchema = z.number().int().safe().positive()

/**
 * The public character catalog behind the namecard picker.
 *
 * One payload carries everything a keystroke needs so the picker never waits on
 * the network: the agencies that file characters, the ordered category
 * vocabulary, every live character, and every live unit.
 *
 * `units` are search shortcuts. Choosing one expands into its `memberIds`; a
 * unit is never itself attached to a card, which is why it may span several
 * agencies. `categories` is ordered as the picker presents it.
 */
export const namecardCharacterCatalogAgencySchema = exactJsonResponse({
  id: catalogIdSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
})

export const namecardCharacterCatalogEntrySchema = exactJsonResponse({
  id: catalogIdSchema,
  agencyId: catalogIdSchema,
  agencyCode: z.string().min(1),
  agencyName: z.string().min(1),
  agencyColor: z.string().min(1),
  category: namecardCharacterCategorySchema,
  isFallback: z.boolean(),
  nameCn: z.string().min(1),
  nameJa: z.string().min(1).nullable(),
  nameEn: z.string().min(1).nullable(),
  aliases: z.string().nullable(),
})

export const namecardCharacterCatalogUnitSchema = exactJsonResponse({
  id: catalogIdSchema,
  nameCn: z.string().min(1),
  nameJa: z.string().min(1).nullable(),
  nameEn: z.string().min(1).nullable(),
  aliases: z.string().nullable(),
  agencyIds: z.array(catalogIdSchema),
  memberIds: z.array(catalogIdSchema),
})

export const namecardCharacterCatalogSchema = exactJsonResponse({
  agencies: z.array(namecardCharacterCatalogAgencySchema),
  categories: z.array(namecardCharacterCategorySchema),
  characters: z.array(namecardCharacterCatalogEntrySchema),
  units: z.array(namecardCharacterCatalogUnitSchema),
})

export type NamecardCharacterCatalog = z.infer<
  typeof namecardCharacterCatalogSchema
>
export type NamecardCharacterCatalogAgency = z.infer<
  typeof namecardCharacterCatalogAgencySchema
>
export type NamecardCharacterCatalogEntry = z.infer<
  typeof namecardCharacterCatalogEntrySchema
>
export type NamecardCharacterCatalogUnit = z.infer<
  typeof namecardCharacterCatalogUnitSchema
>
