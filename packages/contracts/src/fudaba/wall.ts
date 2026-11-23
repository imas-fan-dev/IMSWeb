import { z } from "zod";
import {
  exactJsonResponse,
  strictRequestObject,
  successEnvelope,
} from "../common.js";
import {
  fudabaOfficeSchema,
  fudabaCardSchema,
  fudabaCardPlacementSchema,
  fudabaPlacementRevisionSchema,
  fudabaPageInfoSchema,
} from "./index.js";

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const stacking = z.number().int().min(1).max(2_147_483_000);
export const fudabaWorldPlacementSchema = fudabaCardPlacementSchema
  .extend({
    x: coordinate,
    y: coordinate,
    zIndex: stacking,
  })
  .strict();
export const fudabaWorldCardSchema = fudabaCardSchema
  .extend({
    viewerOwned: z.boolean(),
    placement: fudabaWorldPlacementSchema,
  })
  .strict();
export const fudabaWallSchema = exactJsonResponse({
  layoutVersion: z.literal(1),
  left: z.number().finite().min(-1_003_200).max(1_003_200),
  top: z.number().finite().min(-1_003_200).max(1_003_200),
  right: z.number().finite().min(-1_003_200).max(1_003_200),
  bottom: z.number().finite().min(-1_003_200).max(1_003_200),
  maxZIndex: z.number().int().min(0).max(2_147_483_000),
  total: z.number().int().nonnegative(),
});
export const fudabaWallResponseSchema = exactJsonResponse({
  office: fudabaOfficeSchema
    .extend({ cards: z.array(fudabaWorldCardSchema).max(100) })
    .strict(),
  wall: fudabaWallSchema,
  pageInfo: fudabaPageInfoSchema,
});
export const fudabaWallQuerySchema = strictRequestObject({
  bbox: z.string().max(120).optional(),
  cursor: z.string().max(1024).optional(),
  limit: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .optional(),
  owned: z.enum(["true"]).optional(),
  card: z.string().min(1).max(128).optional(),
});
export const fudabaWorldPlacementRequestSchema = strictRequestObject({
  layoutVersion: z.literal(1),
  x: coordinate,
  y: coordinate,
  rotation: z.number().finite().min(-12).max(12),
  zIndex: stacking,
  expectedRevision: fudabaPlacementRevisionSchema.nullable(),
});
export const fudabaWorldPlacementResponseSchema = successEnvelope({
  placement: fudabaWorldPlacementSchema,
}).strict();
export type FudabaWall = z.infer<typeof fudabaWallSchema>;
export type FudabaWallResponse = z.infer<typeof fudabaWallResponseSchema>;
export type FudabaWorldPlacementInput = z.input<
  typeof fudabaWorldPlacementRequestSchema
>;
