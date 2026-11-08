import { z } from "zod";
import {
  backofficeProtectedHttpErrorSchema,
  exactJsonResponse,
  successEnvelope,
} from "./common.js";
import { wikiImageTransformSchema } from "./wiki.js";

const id = z.number().int().safe().positive();
const revision = z.number().int().nonnegative();
const name = z.string().trim().min(1).max(120).nullable();
const color = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .nullable();
const category = z.enum(["idol", "staff", "rival", "mascot", "chara", "other"]);

export const catalogBirthdaysSchema = successEnvelope({
  items: z.array(exactJsonResponse({
    characterId: id, profileId: id, projectId: id,
    name: z.string().min(1), agency: z.string().min(1),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31),
    story: exactJsonResponse({ agency: z.string().min(1), idol: z.string().min(1) }).nullable(),
  })),
});
export type CatalogBirthdays = z.infer<typeof catalogBirthdaysSchema>;

export const adminCatalogProfileSchema = exactJsonResponse({
  id,
  ownerId: id,
  projectId: id,
  nameCn: z.string().nullable(),
  nameJa: z.string().nullable(),
  nameEn: z.string().nullable(),
  aliases: z.string().nullable(),
  category: category.nullable(),
  displayOrder: z.number().int().nonnegative().nullable(),
  isFallback: z.boolean(),
  color: z.string().nullable(),
  birthMonth: z.number().int().nullable(),
  birthDay: z.number().int().nullable(),
  biography: z.string().nullable(),
  voiceStatus: z.enum(["unknown", "voiced", "unvoiced"]),
  cvName: z.string().nullable(),
  profileUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  imageTransform: wikiImageTransformSchema,
  mediaRevision: revision,
  revision,
});

export const adminCatalogSchema = successEnvelope({
  projects: z.array(
    exactJsonResponse({ id, code: z.string(), name: z.string() }),
  ),
  characters: z.array(
    exactJsonResponse({
      id,
      name: z.string(),
      isFallback: z.boolean(),
      retired: z.boolean(),
      defaultProfileId: id.nullable(),
      revision,
      profiles: z.array(adminCatalogProfileSchema),
    }),
  ),
  groups: z.array(
    exactJsonResponse({
      id,
      name: z.string(),
      kind: z.enum(["unit", "attribute", "organization"]),
      retired: z.boolean(),
      revision,
      profiles: z.array(adminCatalogProfileSchema),
    }),
  ),
  entries: z.array(
    exactJsonResponse({
      id,
      projectId: id,
      name: z.string(),
      characterProfileId: id.nullable(),
      groupProfileId: id.nullable(),
      revision,
    }),
  ),
  navigationGroups: z.array(
    exactJsonResponse({
      id,
      projectId: id,
      name: z.string(),
      groupProfileId: id.nullable(),
      revision,
    }),
  ),
});

const profileRequestFields = {
  kind: z.enum(["character", "group"]),
  ownerId: id,
  projectId: id,
  revision: revision.nullable(),
  nameCn: name,
  nameJa: name,
  nameEn: z.string().trim().min(1).max(160).nullable(),
  aliases: z.string().trim().min(1).max(4000).nullable(),
  category: category.nullable(),
  displayOrder: z.number().int().nonnegative().nullable(),
  isFallback: z.boolean(),
  color,
  birthMonth: z.number().int().min(1).max(12).nullable(),
  birthDay: z.number().int().min(1).max(31).nullable(),
  biography: z.string().max(20000).nullable(),
  voiceStatus: z.enum(["unknown", "voiced", "unvoiced"]),
  cvName: z.string().trim().min(1).max(500).nullable(),
  profileUrl: z.string().url().max(2000).nullable(),
};
const profileRequestObject = z.object(profileRequestFields).strict();
export const adminCatalogProfileRequestSchema =
  profileRequestObject.superRefine((value, context) => {
    const month = value.birthMonth;
    const day = value.birthDay;
    const days =
      month === 2 ? 29 : [4, 6, 9, 11].includes(month ?? 0) ? 30 : 31;
    if ((month === null) !== (day === null) || (day !== null && day > days)) {
      context.addIssue({
        code: "custom",
        path: ["birthDay"],
        message: "生日日期无效",
      });
    }
    if (
      value.kind === "character" &&
      (value.nameCn === null ||
        value.category === null ||
        value.displayOrder === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "人物企划档案需要完整名称、分类和排序",
      });
    }
    if (
      value.kind === "group" &&
      (month !== null ||
        day !== null ||
        value.voiceStatus !== "unknown" ||
        value.cvName !== null ||
        value.category !== null ||
        value.displayOrder !== null ||
        value.aliases !== null ||
        value.isFallback ||
        value.profileUrl !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "组合不使用人物生日和配音资料",
      });
    }
  });

export const adminCatalogCreateCharacterRequestSchema = profileRequestObject
  .omit({ kind: true, ownerId: true, revision: true })
  .extend({
    nameCn: z.string().trim().min(1).max(120),
    category,
    displayOrder: z.number().int().nonnegative(),
  })
  .superRefine((value, context) => {
    const days =
      value.birthMonth === 2
        ? 29
        : [4, 6, 9, 11].includes(value.birthMonth ?? 0)
          ? 30
          : 31;
    if (
      (value.birthMonth === null) !== (value.birthDay === null) ||
      (value.birthDay !== null && value.birthDay > days)
    )
      context.addIssue({
        code: "custom",
        path: ["birthDay"],
        message: "生日日期无效",
      });
  });
export const adminCatalogCreateCharacterResponseSchema = successEnvelope({
  characterId: id,
  profileId: id,
});
export const adminCatalogStoryTargetRequestSchema = z.object({ profileId: id }).strict();
export const adminCatalogStoryTargetResponseSchema = successEnvelope({
  entryId: id, characterId: id, profileId: id, projectId: id, projectCode: z.string(),
});
export type AdminCatalogStoryTargetRequest = z.infer<typeof adminCatalogStoryTargetRequestSchema>;
export type AdminCatalogStoryTargetResponse = z.infer<typeof adminCatalogStoryTargetResponseSchema>;
export const adminCatalogDefaultProfileRequestSchema = z
  .object({ ownerId: id, profileId: id, revision })
  .strict();
export type AdminCatalogCreateCharacterRequest = z.infer<
  typeof adminCatalogCreateCharacterRequestSchema
>;
export type AdminCatalogCreateCharacterResponse = z.infer<
  typeof adminCatalogCreateCharacterResponseSchema
>;
export type AdminCatalogDefaultProfileRequest = z.infer<
  typeof adminCatalogDefaultProfileRequestSchema
>;

export const adminCatalogBindingRequestSchema = z
  .object({
    kind: z.enum(["entry", "navigation"]),
    id,
    revision,
    source: z.enum(["independent", "character", "group"]),
    profileId: id.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.source === "independent") !== (value.profileId === null) ||
      (value.kind === "navigation" && value.source === "character")
    ) {
      context.addIssue({ code: "custom", message: "绑定目标无效" });
    }
  });

export const adminCatalogGroupKindRequestSchema = z
  .object({
    id,
    revision,
    kind: z.enum(["unit", "attribute", "organization"]),
  })
  .strict();

export const adminCatalogMediaRequestSchema = z
  .object({
    kind: z.enum(["character", "group"]),
    id,
    revision,
    imageTransform: wikiImageTransformSchema,
  })
  .strict();

export const adminCatalogProfileImageParamsSchema = z
  .object({
    kind: z.enum(["character", "group"]),
    id: z.coerce.number().int().safe().positive(),
  })
  .strict();
export type AdminCatalogProfileImageParams = z.infer<
  typeof adminCatalogProfileImageParamsSchema
>;

export const adminCatalogMutationSchema = successEnvelope({});
export type AdminCatalogMutation = z.infer<typeof adminCatalogMutationSchema>;
export const adminCatalogHttpErrorSchema = backofficeProtectedHttpErrorSchema;
export type AdminCatalog = z.infer<typeof adminCatalogSchema>;
export type AdminCatalogProfile = z.infer<typeof adminCatalogProfileSchema>;
export type AdminCatalogProfileRequest = z.infer<
  typeof adminCatalogProfileRequestSchema
>;
export type AdminCatalogBindingRequest = z.infer<
  typeof adminCatalogBindingRequestSchema
>;
export type AdminCatalogGroupKindRequest = z.infer<
  typeof adminCatalogGroupKindRequestSchema
>;
export type AdminCatalogMediaRequest = z.infer<
  typeof adminCatalogMediaRequestSchema
>;
