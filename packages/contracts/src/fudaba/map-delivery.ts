import { z } from "zod";
import { hasAsciiControl, successEnvelope } from "../common.js";

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

const MAX_MAP_URL_LENGTH = 2048;

function isAbsoluteMapUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.search || url.hash) return false;
  return !url.pathname.includes("//");
}

/**
 * A same-origin absolute path or an absolute `http(s)` URL, with no query,
 * fragment, backslash, or embedded credentials.
 */
export function isFudabaMapStyleUrl(value: string): boolean {
  if (hasAsciiControl(value)) return false;
  if (value.length === 0 || value.length > MAX_MAP_URL_LENGTH) return false;
  if (value.includes("?") || value.includes("#") || value.includes("\\")) {
    return false;
  }
  if (value.startsWith("/")) return !value.includes("//");
  return isAbsoluteMapUrl(value);
}

export const fudabaMapStyleUrlSchema = z
  .string()
  .refine(
    (value) => !hasAsciiControl(value),
    "map style URL must not contain ASCII control characters",
  )
  .transform((value) => value.trim())
  .refine(
    isFudabaMapStyleUrl,
    "map style URL must be a root-relative path or an absolute http(s) URL " +
      "without credentials, query, or hash",
  );

export const fudabaMapSourceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const fudabaMapSourceNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(80));

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
