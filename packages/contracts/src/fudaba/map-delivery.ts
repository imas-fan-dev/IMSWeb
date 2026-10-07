import { z } from "zod";
import {
  exactJsonError,
  hasAsciiControl,
  legacyPassthroughRequestObject,
  strictRequestObject,
  successEnvelope,
} from "../common.js";
import { isFudabaMapStyleUrl } from "./runtime.js";

export { isFudabaMapStyleUrl } from "./runtime.js";

/**
 * The complete style URL selected by an administrator.
 *
 * Storing the full URL lets one managed collection contain official
 * OpenFreeMap styles and self-distributed styles whose asset names differ. The
 * URL may be a
 * same-origin absolute path or an absolute HTTP(S) URL. Query strings,
 * fragments, embedded credentials, backslashes, and ASCII control characters
 * are rejected.
 */

export const fudabaMapStyleUrlSchema = z
  .string()
  .refine(
    (value) => !hasAsciiControl(value),
    "map style URL must not contain ASCII control characters",
  )
  .refine(
    isFudabaMapStyleUrl,
    "map style URL must be a root-relative path or an absolute http(s) URL " +
      "without credentials, query, or hash",
  );

export const fudabaMapSourceIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const fudabaMapSourceNameSchema = z
  .string()
  .min(1)
  .max(80);

export const fudabaMapSourceSchema = z
  .object({
    id: fudabaMapSourceIdSchema,
    name: fudabaMapSourceNameSchema,
    styleUrl: fudabaMapStyleUrlSchema,
  })
  .strict();

/** Operator view of the persisted source collection and its live selection. */
export const fudabaMapDeliverySnapshotSchema = z
  .object({
    sources: z.array(fudabaMapSourceSchema).min(1).max(50),
    activeSourceId: fudabaMapSourceIdSchema,
    effectiveStyleUrl: fudabaMapStyleUrlSchema,
    revision: z.string().nullable(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const active = snapshot.sources.find(
      (source) => source.id === snapshot.activeSourceId,
    );
    if (!active || active.styleUrl !== snapshot.effectiveStyleUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "active map source must match the effective style URL",
        path: ["activeSourceId"],
      });
    }
  });

export const fudabaMapSourceWriteSchema = z
  .object({
    name: fudabaMapSourceNameSchema,
    styleUrl: fudabaMapStyleUrlSchema,
    revision: z.string().nullable(),
  })
  .strict();

export const fudabaMapSourceActivationSchema = z
  .object({
    sourceId: fudabaMapSourceIdSchema,
    revision: z.string().nullable(),
  })
  .strict();

export const fudabaMapSourceDeleteSchema = z
  .object({ revision: z.string().nullable() })
  .strict();

export const fudabaMapDeliveryMutationSchema = successEnvelope({
  delivery: fudabaMapDeliverySnapshotSchema,
}).strict();

// The historic map handlers trim text but reject controls before that step.
// These request contracts preserve that behavior without reusing response
// schemas that normalize their outputs.
const fudabaMapSourceRequestNameSchema = z.string()
  .transform((value) => value.trim())
  .pipe(
    z.string()
      .min(1)
      .max(80)
      .refine(
        (value) => !hasAsciiControl(value),
        "map source name must not contain ASCII control characters",
      ),
  );
const fudabaMapStyleUrlRequestSchema = z.string()
  .transform((value) => value.trim())
  .pipe(
    z.string()
      .refine(
        (value) => !hasAsciiControl(value),
        "map style URL must not contain ASCII control characters",
      )
      .refine(
        isFudabaMapStyleUrl,
        "map style URL must be a root-relative path or an absolute http(s) URL without credentials, query, or hash",
      ),
  );
export const fudabaMapSourceWriteRequestSchema = z.object({
  name: fudabaMapSourceRequestNameSchema,
  styleUrl: fudabaMapStyleUrlRequestSchema,
  revision: z.string().nullable(),
}).strict();
export const fudabaMapSourceActivationRequestSchema = z.object({
  sourceId: fudabaMapSourceIdSchema,
  revision: z.string().nullable(),
}).strict();
export const fudabaMapSourceDeleteRequestSchema = z.object({
  revision: z.string().nullable(),
}).strict();
export const fudabaMapSourceParamsSchema = strictRequestObject({
  sourceId: fudabaMapSourceIdSchema,
});
// This endpoint historically ignores query parameters. Preserve that policy
// explicitly while still running the shared schema at the route boundary.
export const fudabaMapDeliveryQuerySchema = legacyPassthroughRequestObject({});
export const fudabaMapDeliveryErrorSchema = z.union([
  exactJsonError({ error: z.string() }),
  exactJsonError({ message: z.string() }),
  exactJsonError({ success: z.literal(false), message: z.string() }),
])

export type FudabaMapSource = z.infer<typeof fudabaMapSourceSchema>;
export type FudabaMapDeliverySnapshot = z.infer<
  typeof fudabaMapDeliverySnapshotSchema
>;
export type FudabaMapSourceWrite = z.infer<typeof fudabaMapSourceWriteSchema>;
export type FudabaMapSourceActivation = z.infer<
  typeof fudabaMapSourceActivationSchema
>;
export type FudabaMapSourceDelete = z.infer<typeof fudabaMapSourceDeleteSchema>;
export type FudabaMapDeliveryMutation = z.infer<
  typeof fudabaMapDeliveryMutationSchema
>;
