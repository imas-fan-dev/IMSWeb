import { z } from "../z.js";
import {
  numberedPageInfoSchema,
  strictRequestObject,
  successEnvelope,
} from "../common.js";
import { platformMiddlewareErrorSchema } from "./index.js";

// Admin station messages ("站内信"): a backoffice operator composes one message
// and it is fanned out into `namecard_notifications`, so recipients read it in
// the same 「消息」 panel as moderation notices. The batch row keeps the audit
// trail (who sent it, to whom, when it was scheduled, whether it also went out
// by email).

export const adminStationMessageAudienceSchema = z.enum(["all", "selected"]);

export const adminStationMessageStatusSchema = z.enum([
  "scheduled",
  "sending",
  "sent",
  "failed",
  "canceled",
]);

export {
  ADMIN_STATION_MESSAGE_MAX_LEAD_MS,
  ADMIN_STATION_MESSAGE_MIN_LEAD_MS,
} from "./admin-station-messages/runtime.js";

const accountIdsSchema = z
  .array(z.string().trim().min(1).max(128))
  .max(2000)
  .refine(
    (value) => new Set(value).size === value.length,
    "Recipient ids must be unique",
  );

export const adminStationMessageSendRequestSchema = strictRequestObject({
  title: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(200)),
  body: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(4000)),
  audience: adminStationMessageAudienceSchema,
  accountIds: accountIdsSchema.optional(),
  forwardEmail: z.boolean(),
  // Epoch milliseconds; `null` sends immediately.
  scheduledAt: z.number().int().safe().nonnegative().nullable(),
  // Calendar minute the operator picked, used only to reject a stale draft.
  scheduledLocalMinute: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .optional(),
});

export const adminStationMessageRecipientQuerySchema = strictRequestObject({
  query: z.string().trim().min(1).max(320).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  pageSize: z.string().regex(/^\d+$/).optional(),
});

export const adminStationMessageListQuerySchema = strictRequestObject({
  page: z.string().regex(/^\d+$/).optional(),
  pageSize: z.string().regex(/^\d+$/).optional(),
});

export const adminStationMessageIdParamsSchema = strictRequestObject({
  id: z.string().trim().min(1).max(64),
});

export const adminStationMessageSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(4000),
    audience: adminStationMessageAudienceSchema,
    forwardEmail: z.boolean(),
    scheduledAt: z.number().int().safe().nonnegative().nullable(),
    status: adminStationMessageStatusSchema,
    recipientCount: z.number().int().safe().nonnegative(),
    deliveredCount: z.number().int().safe().nonnegative(),
    emailSentCount: z.number().int().safe().nonnegative(),
    emailFailedCount: z.number().int().safe().nonnegative(),
    senderAdminId: z.string().min(1),
    senderAdminName: z.string().min(1).max(128),
    failureReason: z.string().max(500).nullable(),
    createdAt: z.number().int().safe().nonnegative(),
    startedAt: z.number().int().safe().nonnegative().nullable(),
    completedAt: z.number().int().safe().nonnegative().nullable(),
  })
  .strict();

export const adminStationMessageTargetSchema = z
  .object({
    accountId: z.string().min(1),
    displayName: z.string().max(120),
    email: z.string().max(320).nullable(),
    status: z.string().max(32),
  })
  .strict();

export const adminStationMessageTargetListSchema = successEnvelope({
  targets: z.array(adminStationMessageTargetSchema).max(50),
  pageInfo: numberedPageInfoSchema,
}).strict();

/** Snapshot recipients of one batch. `emailState` is only meaningful when the
 * batch forwards mail; `delivered` says whether the inbox row exists. */
export const adminStationMessageDeliverySchema = z
  .object({
    accountId: z.string().min(1),
    displayName: z.string().max(120).nullable(),
    email: z.string().max(320).nullable(),
    delivered: z.boolean(),
    emailState: z.enum(["pending", "sent", "failed", "skipped"]),
  })
  .strict();

export const adminStationMessageDeliveryListSchema = successEnvelope({
  deliveries: z.array(adminStationMessageDeliverySchema).max(2000),
}).strict();

export const adminStationMessageSendResponseSchema = successEnvelope({
  message: adminStationMessageSchema,
}).strict();

export const adminStationMessageListSchema = successEnvelope({
  messages: z.array(adminStationMessageSchema).max(50),
  pageInfo: numberedPageInfoSchema,
}).strict();

export const adminStationMessageCancelResponseSchema = successEnvelope({
  message: adminStationMessageSchema,
}).strict();

export const adminStationMessageErrorSchema = z.union([
  platformMiddlewareErrorSchema,
  z
    .object({
      success: z.literal(false),
      code: z.string().min(1).max(64),
      message: z.string().min(1).max(500),
    })
    .strict(),
  z.object({ success: z.literal(false).optional(), message: z.string() }).strict(),
]);

export type AdminStationMessage = z.infer<typeof adminStationMessageSchema>;
export type AdminStationMessageSendRequest = z.infer<
  typeof adminStationMessageSendRequestSchema
>;
export type AdminStationMessageAudience = z.infer<
  typeof adminStationMessageAudienceSchema
>;
export type AdminStationMessageStatus = z.infer<
  typeof adminStationMessageStatusSchema
>;
export type AdminStationMessageTarget = z.infer<
  typeof adminStationMessageTargetSchema
>;
export type AdminStationMessageListQuery = z.infer<
  typeof adminStationMessageListQuerySchema
>;
export type AdminStationMessageRecipientQuery = z.infer<
  typeof adminStationMessageRecipientQuerySchema
>;
export type AdminStationMessageIdParams = z.infer<
  typeof adminStationMessageIdParamsSchema
>;
export type AdminStationMessageList = z.infer<
  typeof adminStationMessageListSchema
>;
export type AdminStationMessageTargetList = z.infer<
  typeof adminStationMessageTargetListSchema
>;
export type AdminStationMessageDelivery = z.infer<
  typeof adminStationMessageDeliverySchema
>
export type AdminStationMessageDeliveryList = z.infer<
  typeof adminStationMessageDeliveryListSchema
>
export type AdminStationMessageSendResponse = z.infer<
  typeof adminStationMessageSendResponseSchema
>;
export type AdminStationMessageCancelResponse = z.infer<
  typeof adminStationMessageCancelResponseSchema
>;
export type AdminStationMessageError = z.infer<
  typeof adminStationMessageErrorSchema
>;
