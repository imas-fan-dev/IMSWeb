import { z } from "zod";
import {
  errorResponseSchema,
  exactJsonResponse,
  successEnvelope,
} from "./common.js";

const entryFields = {
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1).max(80),
  description: z.string().max(300),
  href: z.string().min(1).max(500),
  icon: z.string().min(1).max(80),
  imageUrl: z.string().nullable(),
  enabled: z.boolean(),
  audience: z.enum(["all", "web", "app"]),
  availability: z.enum(["always", "exchange"]),
};
export const communityContentEntrySchema = exactJsonResponse(entryFields);
const draftFields = {
  version: z.literal(1),
  title: z.string().min(1).max(80),
  introduction: z.string().max(300),
  entries: z.array(communityContentEntrySchema).max(100),
};
export const communityContentDraftSchema = z.object(draftFields).strict();
export const communityContentSchema = exactJsonResponse({
  ...draftFields,
  updatedAt: z.string().datetime().nullable(),
});
export const communityContentErrorResponseSchema = errorResponseSchema;
export const adminCommunityContentSnapshotSchema = exactJsonResponse({
  content: communityContentSchema,
  revision: z.string().nullable(),
});
export const adminCommunityContentUpdateRequestSchema = z
  .object({
    content: communityContentDraftSchema,
    revision: z.string().min(1).nullable(),
  })
  .strict();
export const adminCommunityContentUpdateSchema = successEnvelope({
  content: communityContentSchema,
  revision: z.string(),
});
export const adminCommunityContentImageUploadSchema = successEnvelope({
  url: z.string(),
});
export type CommunityContentEntry = z.infer<typeof communityContentEntrySchema>;
export type CommunityContentDraft = z.infer<typeof communityContentDraftSchema>;
export type CommunityContent = z.infer<typeof communityContentSchema>;
export type CommunityContentErrorResponse = z.infer<
  typeof communityContentErrorResponseSchema
>;
export type AdminCommunityContentSnapshot = z.infer<
  typeof adminCommunityContentSnapshotSchema
>;
export type AdminCommunityContentUpdateRequest = z.infer<
  typeof adminCommunityContentUpdateRequestSchema
>;
export type AdminCommunityContentUpdate = z.infer<
  typeof adminCommunityContentUpdateSchema
>;
export type AdminCommunityContentImageUpload = z.infer<
  typeof adminCommunityContentImageUploadSchema
>;
