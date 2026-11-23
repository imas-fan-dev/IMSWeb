import { z } from 'zod';
import {
    exactJsonResponse,
    strictRequestObject,
    successEnvelope,
} from '../common.js';
import { fudabaOfficeSchema, fudabaPageInfoSchema } from './index.js';
import {
    fudabaWorldCardSchema,
    fudabaWorldPlacementSchema,
    fudabaWallSchema,
} from './wall.js';

export const fudabaMessageColorSchema = z.enum([
    'cream',
    'rose',
    'mint',
    'blue',
    'lavender',
]);
const revision = z.number().int().min(0).max(2_147_483_647);
const content = z.string().refine((value) => {
    const length = Array.from(value.trim()).length;
    return length >= 1 && length <= 280;
}, '留言须为 1–280 个 Unicode 码点');
export const fudabaMessageOfficeSchema = exactJsonResponse({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    status: z.enum(['active', 'hidden', 'archived']),
    isOpen: z.boolean(),
});
export const fudabaMessageSchema = exactJsonResponse({
    id: z.string(),
    office: fudabaMessageOfficeSchema,
    authorAccountId: z.string(),
    authorName: z.string(),
    content: z.string(),
    color: fudabaMessageColorSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    contentRevision: revision,
    moderationRevision: revision,
    hiddenByOffice: z.boolean(),
    hiddenByAdmin: z.boolean(),
    placement: fudabaWorldPlacementSchema,
    capabilities: exactJsonResponse({
        canEdit: z.boolean(),
        canMove: z.boolean(),
        canDestroy: z.boolean(),
        canModerateOffice: z.boolean(),
        canModerateAdmin: z.boolean(),
    }),
});
export const fudabaPublicMessageSchema = fudabaMessageSchema
    .omit({
        authorAccountId: true,
        contentRevision: true,
        moderationRevision: true,
        hiddenByOffice: true,
        hiddenByAdmin: true,
    })
    .extend({
        office: fudabaMessageOfficeSchema.omit({ status: true }).strict(),
        capabilities: exactJsonResponse({
            canEdit: z.boolean(),
            canMove: z.boolean(),
            canDestroy: z.boolean(),
        }),
    })
    .strict();
export const fudabaMixedWallItemSchema = z.discriminatedUnion('kind', [
    exactJsonResponse({
        kind: z.literal('card'),
        card: fudabaWorldCardSchema,
        canMove: z.boolean(),
    }),
    exactJsonResponse({
        kind: z.literal('message'),
        message: fudabaPublicMessageSchema,
    }),
]);
export const fudabaMixedWallResponseSchema = exactJsonResponse({
    office: fudabaOfficeSchema,
    wall: fudabaWallSchema,
    items: z.array(fudabaMixedWallItemSchema).max(100),
    pageInfo: fudabaPageInfoSchema,
    capabilities: exactJsonResponse({
        canCreateMessage: z.boolean(),
        canArrangeWall: z.boolean(),
        canManageMessages: z.boolean(),
    }),
});
export const fudabaMessageCreateRequestSchema = strictRequestObject({
    content,
    color: fudabaMessageColorSchema,
    height: z.number().int().min(160).max(560).optional(),
    center: strictRequestObject({
        x: z.number().finite().min(-1_000_000).max(1_000_000),
        y: z.number().finite().min(-1_000_000).max(1_000_000),
    }).optional(),
});
export const fudabaMessageEditRequestSchema = strictRequestObject({
    content,
    color: fudabaMessageColorSchema,
    height: z.number().int().min(160).max(560).optional(),
    expectedRevision: revision,
});
export const fudabaMessagePlacementRequestSchema = strictRequestObject({
    layoutVersion: z.literal(1),
    x: z.number().finite().min(-1_000_000).max(1_000_000),
    y: z.number().finite().min(-1_000_000).max(1_000_000),
    rotation: z.number().finite().min(-12).max(12),
    zIndex: z.number().int().min(1).max(2_147_483_000),
    expectedRevision: revision,
});
export const fudabaMessageModerationRequestSchema = strictRequestObject({
    hidden: z.boolean(),
    expectedRevision: revision,
});
export const fudabaMessageIdParamsSchema = strictRequestObject({
    messageId: z.string().min(1).max(128),
});
export const fudabaMessageOfficeParamsSchema = strictRequestObject({
    officeId: z.string().min(1).max(128),
});
export const fudabaMessageSlugParamsSchema = strictRequestObject({
    slug: z.string().min(1).max(120),
});
export const fudabaMessageListQuerySchema = strictRequestObject({
    cursor: z.string().max(1024).optional(),
    limit: z
        .string()
        .regex(/^[1-9][0-9]*$/)
        .optional(),
    office: z.string().max(128).optional(),
    status: z
        .enum(['all', 'visible', 'office-hidden', 'admin-hidden'])
        .optional(),
});
export const fudabaMixedWallQuerySchema = strictRequestObject({
    bbox: z.string().max(120).optional(),
    cursor: z.string().max(1024).optional(),
    limit: z
        .string()
        .regex(/^[1-9][0-9]*$/)
        .optional(),
    item: z.string().max(140).optional(),
});
export const fudabaMessageResponseSchema = successEnvelope({
    message: fudabaMessageSchema,
}).strict();
export const fudabaMessageListResponseSchema = exactJsonResponse({
    messages: z.array(fudabaMessageSchema).max(100),
    pageInfo: fudabaPageInfoSchema,
});
export const fudabaMessageDestroyResponseSchema = successEnvelope({
    id: z.string(),
    destroyed: z.literal(true),
}).strict();
export const fudabaMessageErrorCodeSchema = z.enum([
    'FUDABA_MESSAGE_INVALID',
    'FUDABA_MESSAGE_FORBIDDEN',
    'FUDABA_MESSAGE_NOT_FOUND',
    'FUDABA_MESSAGE_CLOSED',
    'FUDABA_MESSAGE_NOT_EDITABLE',
    'FUDABA_MESSAGE_CONFLICT',
    'FUDABA_MESSAGE_RATE_LIMITED',
    'FUDABA_MESSAGE_IDEMPOTENCY_CONFLICT',
    'FUDABA_MESSAGE_GONE',
    'FUDABA_MESSAGE_CREATE_DISABLED',
    'FUDABA_MESSAGE_UNAVAILABLE',
    'FUDABA_MESSAGE_FAILED',
]);
export const fudabaMessageErrorResponseSchema = z.union([
    exactJsonResponse({ error: z.string() }),
    exactJsonResponse({ message: z.string() }),
    exactJsonResponse({ success: z.literal(false), message: z.string() }),
    exactJsonResponse({
        success: z.literal(false),
        code: fudabaMessageErrorCodeSchema,
        message: z.string(),
        revision: revision.optional(),
        retryAfter: z.number().int().nonnegative().optional(),
    }),
]);
export type FudabaMessageColor = z.infer<typeof fudabaMessageColorSchema>;
export type FudabaMessage = z.infer<typeof fudabaMessageSchema>;
export type FudabaMixedWallItem = z.infer<typeof fudabaMixedWallItemSchema>;
export type FudabaMixedWallResponse = z.infer<
    typeof fudabaMixedWallResponseSchema
>;
export type FudabaMessageCreateInput = z.infer<
    typeof fudabaMessageCreateRequestSchema
>;
export type FudabaMessageEditInput = z.infer<
    typeof fudabaMessageEditRequestSchema
>;
export type FudabaMessagePlacementInput = z.infer<
    typeof fudabaMessagePlacementRequestSchema
>;
export type FudabaMessageModerationInput = z.infer<
    typeof fudabaMessageModerationRequestSchema
>;
export type FudabaMessageListResponse = z.infer<
    typeof fudabaMessageListResponseSchema
>;
export type FudabaMessageError = z.infer<
    typeof fudabaMessageErrorResponseSchema
>;

export type FudabaPublicMessage = z.infer<typeof fudabaPublicMessageSchema>;

export type FudabaMessageResponse = z.infer<typeof fudabaMessageResponseSchema>;
export type FudabaMessageDestroyResponse = z.infer<
    typeof fudabaMessageDestroyResponseSchema
>;

// Scene v1 adds layout metadata without changing the existing exact responses.
const scenePlacement = fudabaWorldPlacementSchema;
const sceneBase = {
    id: z.string(),
    placement: scenePlacement,
    width: z.number().positive(),
    height: z.number().int().positive(),
    layoutVersion: z.literal(1),
};
const tinyPreview = z
    .string()
    .max(2048)
    .regex(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/)
    .nullable();
export const fudabaWallLayoutItemSchema = z.discriminatedUnion('kind', [
    exactJsonResponse({
        ...sceneBase,
        kind: z.literal('card'),
        displayName: z.string(),
        viewerOwned: z.boolean(),
        preview: tinyPreview,
        assetVersion: z.string(),
        backPreview: tinyPreview.optional(),
    }),
    exactJsonResponse({
        ...sceneBase,
        kind: z.literal('message'),
        color: fudabaMessageColorSchema,
        contentRevision: revision,
    }),
]);
export const fudabaWallLayoutResponseSchema = exactJsonResponse({
    version: z.literal(1),
    office: fudabaOfficeSchema,
    wall: fudabaWallSchema,
    items: z.array(fudabaWallLayoutItemSchema).max(100),
    pageInfo: fudabaPageInfoSchema,
});
export const fudabaWallSceneResponseSchema = fudabaMixedWallResponseSchema
    .extend({
        version: z.literal(1),
        layouts: z.array(fudabaWallLayoutItemSchema).max(100),
    })
    .strict();
export type FudabaWallLayoutItem = z.infer<typeof fudabaWallLayoutItemSchema>;
export type FudabaWallLayoutResponse = z.infer<
    typeof fudabaWallLayoutResponseSchema
>;
export type FudabaWallSceneResponse = z.infer<
    typeof fudabaWallSceneResponseSchema
>;
