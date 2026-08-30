import { z } from "zod";
import { hasAsciiControl, successEnvelope } from "../common.js";

/**
 * Where the exchange map's static assets are fetched from.
 *
 * A delivery prefix names a host and a path, so one value can point at the
 * Nginx static location that serves the map today (`/maps/`) or at an
 * S3/RustFS base later (`https://assets.example.com/exchange-map/v3/`). The
 * assets never enter the app package and never proxy through Hono; only the
 * prefix that addresses them is operator-editable.
 *
 * Accepted shapes, both required to end in `/`:
 *   - a root-relative path with no `//` (`/maps/`)
 *   - an absolute `http(s)` URL with no embedded credentials
 *
 * Rejected in either shape: ASCII control characters, 2048+ characters,
 * `?`, `#`, `\`, and — for absolute URLs — a `//` inside the path.
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

/** A style URL location that additionally addresses a directory. */
export function isFudabaMapPrefix(value: string): boolean {
  return value.endsWith("/") && isFudabaMapStyleUrl(value);
}

/**
 * The final path segment of a style URL — the asset name a delivery prefix
 * is joined with. `/maps/exchange-style.json` yields `exchange-style.json`.
 */
export function fudabaMapAssetName(styleUrl: string): string {
  const withoutQuery = styleUrl.split(/[?#]/)[0] ?? "";
  return withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
}

/**
 * Join a delivery prefix with the asset name carried by the deployment's
 * fallback style URL. Prefixes always end in `/`, so this is concatenation.
 * An asset-less fallback (a bare directory) yields the fallback unchanged.
 */
export function fudabaMapStyleUrlForPrefix(
  prefix: string,
  fallbackStyleUrl: string,
): string {
  const assetName = fudabaMapAssetName(fallbackStyleUrl);
  return assetName ? `${prefix}${assetName}` : fallbackStyleUrl;
}

/**
 * The delivery prefix a style URL already sits under — the inverse of
 * `fudabaMapStyleUrlForPrefix`. `/maps/exchange-style.json` yields `/maps/`.
 * This is the effective prefix before an operator selects anything.
 */
export function fudabaMapPrefixFromStyleUrl(styleUrl: string): string {
  const withoutQuery = styleUrl.split(/[?#]/)[0] ?? "";
  return withoutQuery.slice(0, withoutQuery.lastIndexOf("/") + 1);
}

export const fudabaMapPrefixSchema = z
  .string()
  .refine(
    (value) => !hasAsciiControl(value),
    "map delivery prefix must not contain ASCII control characters",
  )
  .transform((value) => value.trim())
  .refine(
    isFudabaMapPrefix,
    "map delivery prefix must be a root-relative path or an absolute " +
      "http(s) URL, end with /, and carry no credentials, query, or hash",
  );

/** Operator view: what is selected, what may be selected, what is in force. */
export const fudabaMapDeliverySnapshotSchema = z
  .object({
    selectedPrefix: fudabaMapPrefixSchema.nullable(),
    availablePrefixes: z.array(fudabaMapPrefixSchema),
    effectivePrefix: fudabaMapPrefixSchema,
    revision: z.string().nullable(),
  })
  .strict();

export const fudabaMapDeliveryUpdateSchema = z
  .object({
    prefix: fudabaMapPrefixSchema,
    revision: z.string().nullable(),
  })
  .strict();

export const fudabaMapDeliveryMutationSchema = successEnvelope({
  delivery: fudabaMapDeliverySnapshotSchema,
}).strict();

export type FudabaMapDeliverySnapshot = z.infer<
  typeof fudabaMapDeliverySnapshotSchema
>;
export type FudabaMapDeliveryUpdate = z.infer<
  typeof fudabaMapDeliveryUpdateSchema
>;
export type FudabaMapDeliveryMutation = z.infer<
  typeof fudabaMapDeliveryMutationSchema
>;
