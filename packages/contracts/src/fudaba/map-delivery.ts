import { z } from "zod";
import {
  exactJsonError,
  hasAsciiControl,
  strictRequestObject,
  successEnvelope,
} from "../common.js";
import {
  isFudabaMapStyleUrl,
  isFudabaAMapKey,
  isFudabaAMapStyle,
  isFudabaAMapSecurityProxyUrl,
  isFudabaMapboxToken,
  isFudabaMapboxStyle,
} from "./runtime.js";

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

export const fudabaMapSourceNameSchema = z.string().min(1).max(80);

const mapLibreFields = {
  provider: z.literal("maplibre"),
  styleUrl: fudabaMapStyleUrlSchema,
};
const amapFields = {
  provider: z.literal("amap"),
  apiKey: z.string().refine(isFudabaAMapKey, "invalid AMap JS API key"),
  securityProxyUrl: z
    .string()
    .refine(
      isFudabaAMapSecurityProxyUrl,
      "AMap proxy must be HTTPS or root-relative and end in /_AMapService",
    ),
  mapStyle: z.string().refine(isFudabaAMapStyle, "invalid AMap style"),
};
const mapboxFields = {
  provider: z.literal("mapbox"),
  accessToken: z
    .string()
    .refine(isFudabaMapboxToken, "Mapbox requires a public pk token"),
  styleUrl: z.string().refine(isFudabaMapboxStyle, "invalid Mapbox style URL"),
};

/** Provider options stop at the renderer. All business coordinates are WGS84. */
export const fudabaMapProviderConfigSchema = z.union([
  z.object(mapLibreFields).strict(),
  z.object(amapFields).strict(),
  z.object(mapboxFields).strict(),
]);
export type FudabaMapProviderConfig = z.infer<
  typeof fudabaMapProviderConfigSchema
>;

const amapSearchConfigSchema = z.object({ provider: z.literal("amap"), apiKey: amapFields.apiKey, securityProxyUrl: amapFields.securityProxyUrl }).strict();
const mapboxSearchConfigSchema = z.object({ provider: z.literal("mapbox"), accessToken: mapboxFields.accessToken }).strict();
const singleMapSearchConfigSchema = z.union([
  z.object({ provider: z.literal("nominatim") }).strict(),
  amapSearchConfigSchema,
  mapboxSearchConfigSchema,
]);
export type FudabaSingleMapSearchConfig = z.infer<typeof singleMapSearchConfigSchema>;
const federatedMapSearchConfigSchema = z.object({ provider: z.literal("federated"), mainland: amapSearchConfigSchema, overseas: mapboxSearchConfigSchema }).strict();
/** Public, ephemeral map search. Never used to write canonical office locations. */
export const fudabaMapSearchConfigSchema = z.union([singleMapSearchConfigSchema, federatedMapSearchConfigSchema]);
export type FudabaMapSearchConfig = z.infer<typeof fudabaMapSearchConfigSchema>;

export const fudabaRegionalProviderMapConfigSchema = z
  .object({
    provider: z.literal("regional"),
    mainland: z.object(amapFields).strict(),
    overseas: z.object(mapboxFields).strict(),
    defaultRegion: z.enum(["mainland", "overseas"]),
    search: federatedMapSearchConfigSchema,
  })
  .strict()
  .refine(
    (config) =>
      config.mainland.apiKey === config.search.mainland.apiKey &&
      config.mainland.securityProxyUrl === config.search.mainland.securityProxyUrl &&
      config.overseas.accessToken === config.search.overseas.accessToken,
    "regional renderer and search credentials must match",
  );
export type FudabaRegionalProviderMapConfig = z.infer<
  typeof fudabaRegionalProviderMapConfigSchema
>;

export const fudabaMapConfigSchema = z
  .union([
    z
      .object({ ...mapLibreFields, search: singleMapSearchConfigSchema })
      .strict(),
    z.object({ ...amapFields, search: singleMapSearchConfigSchema }).strict(),
    z.object({ ...mapboxFields, search: singleMapSearchConfigSchema }).strict(),
    fudabaRegionalProviderMapConfigSchema,
  ])
  .refine(
    (config) =>
      config.provider === "regional" ||
      config.search.provider === "nominatim" ||
      config.search.provider === config.provider,
    "native search must be compatible with its map provider",
  );
export type FudabaMapConfig = z.infer<typeof fudabaMapConfigSchema>;

// Vendor-owned fields are preserved, so parsed output remains byte-structure
// equivalent to the upstream JSON as Mapbox evolves its response metadata.
export const mapboxGeocodingResponseSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z
      .array(
        z
          .object({
            type: z.literal("Feature"),
            geometry: z
              .object({
                type: z.literal("Point"),
                coordinates: z.tuple([
                  z.number().finite().min(-180).max(180),
                  z.number().finite().min(-90).max(90),
                ]),
              })
              .passthrough(),
            properties: z
              .object({
                mapbox_id: z.string().min(1),
                name: z.string().min(1),
                full_address: z.string().optional(),
                place_formatted: z.string().optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .max(5),
    attribution: z.string(),
  })
  .passthrough();
export const mapboxGeocodingErrorSchema = z
  .object({ message: z.string() })
  .passthrough();

const sourceFields = {
  id: fudabaMapSourceIdSchema,
  name: fudabaMapSourceNameSchema,
};
export const fudabaMapSourceSchema = z.union([
  z.object({ ...sourceFields, ...mapLibreFields }).strict(),
  z.object({ ...sourceFields, ...amapFields }).strict(),
  z.object({ ...sourceFields, ...mapboxFields }).strict(),
]);

export const fudabaMapRoutingSchema = z
  .object({
    mainlandSourceId: fudabaMapSourceIdSchema,
    overseasSourceId: fudabaMapSourceIdSchema,
  })
  .strict();
export type FudabaMapRouting = z.infer<typeof fudabaMapRoutingSchema>;

/** Operator view of the persisted source collection and its live selection. */
export const fudabaMapDeliverySnapshotSchema = z
  .object({
    sources: z.array(fudabaMapSourceSchema).min(1).max(50),
    activeSourceId: fudabaMapSourceIdSchema,
    effectiveStyleUrl: z
      .union([fudabaMapStyleUrlSchema, mapboxFields.styleUrl])
      .nullable(),
    revision: z.string().nullable(),
    routing: fudabaMapRoutingSchema.optional(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (
      snapshot.routing &&
      [
        snapshot.routing.mainlandSourceId,
        snapshot.routing.overseasSourceId,
      ].some((id) => !snapshot.sources.some((source) => source.id === id))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "regional map sources must exist",
        path: ["routing"],
      });
    }
    if (snapshot.routing && (
      snapshot.sources.find((source) => source.id === snapshot.routing!.mainlandSourceId)?.provider !== "amap" ||
      snapshot.sources.find((source) => source.id === snapshot.routing!.overseasSourceId)?.provider !== "mapbox"
    )) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "mainland search requires an AMap source and overseas search requires a Mapbox source", path: ["routing"] });
    }
    const active = snapshot.sources.find(
      (source) => source.id === snapshot.activeSourceId,
    );
    if (
      !active ||
      (active.provider === "amap" ? null : active.styleUrl) !==
        snapshot.effectiveStyleUrl
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "active map source must match the effective style URL",
        path: ["activeSourceId"],
      });
    }
  });

export const fudabaMapSourceWriteSchema = z.union([
  z
    .object({
      name: fudabaMapSourceNameSchema,
      ...mapLibreFields,
      revision: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      name: fudabaMapSourceNameSchema,
      ...amapFields,
      revision: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      name: fudabaMapSourceNameSchema,
      ...mapboxFields,
      revision: z.string().nullable(),
    })
    .strict(),
]);

export const fudabaMapSourceActivationSchema = z
  .object({
    sourceId: fudabaMapSourceIdSchema,
    revision: z.string().nullable(),
    routing: fudabaMapRoutingSchema.nullable().optional(),
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
const fudabaMapSourceRequestNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(80)
      .refine(
        (value) => !hasAsciiControl(value),
        "map source name must not contain ASCII control characters",
      ),
  );
const fudabaMapStyleUrlRequestSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .refine(
        (value) => !hasAsciiControl(value),
        "map style URL must not contain ASCII control characters",
      )
      .refine(
        isFudabaMapStyleUrl,
        "map style URL must be a root-relative path or an absolute http(s) URL without credentials, query, or hash",
      ),
  );
export const fudabaMapSourceWriteRequestSchema = z.union([
  z
    .object({
      ...mapLibreFields,
      name: fudabaMapSourceRequestNameSchema,
      styleUrl: fudabaMapStyleUrlRequestSchema,
      revision: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      ...amapFields,
      name: fudabaMapSourceRequestNameSchema,
      revision: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      ...mapboxFields,
      name: fudabaMapSourceRequestNameSchema,
      revision: z.string().nullable(),
    })
    .strict(),
]);
export const fudabaMapSourceActivationRequestSchema = z
  .object({
    sourceId: fudabaMapSourceIdSchema,
    revision: z.string().nullable(),
    routing: fudabaMapRoutingSchema.nullable().optional(),
  })
  .strict();
export const fudabaMapSourceDeleteRequestSchema = z
  .object({
    revision: z.string().nullable(),
  })
  .strict();
export const fudabaMapSourceParamsSchema = strictRequestObject({
  sourceId: fudabaMapSourceIdSchema,
});
export const fudabaMapDeliveryQuerySchema = strictRequestObject({});
export const fudabaMapDeliveryErrorSchema = z.union([
  exactJsonError({ error: z.string() }),
  exactJsonError({ message: z.string() }),
  exactJsonError({ success: z.literal(false), message: z.string() }),
]);

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
