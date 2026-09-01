import { z } from "zod";
import { successEnvelope } from "../common.js";
import {
  PLATFORM_OAUTH_PROVIDER_CODES,
  platformOAuthProviderCodeSchema,
} from "./index.js";

export const platformOAuthAdminProviderSchema = z
  .object({
    code: platformOAuthProviderCodeSchema,
    displayName: z.string().min(1).max(80),
    icon: platformOAuthProviderCodeSchema,
    enabled: z.boolean(),
    configured: z.boolean(),
    clientIdMasked: z.string().nullable(),
    redirectUri: z.string().nullable(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((provider, context) => {
    if (provider.icon !== provider.code) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OAuth provider icon must match its fixed code",
        path: ["icon"],
      });
    }
  });

export const platformOAuthAdminProviderListSchema = successEnvelope({
  providers: z
    .array(platformOAuthAdminProviderSchema)
    .length(PLATFORM_OAUTH_PROVIDER_CODES.length)
    .superRefine((providers, context) => {
      for (const [index, code] of PLATFORM_OAUTH_PROVIDER_CODES.entries()) {
        if (providers[index]?.code !== code) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `OAuth provider ${code} is missing or out of order`,
            path: [index, "code"],
          });
        }
      }
    }),
}).strict();

export const platformOAuthAdminProviderMutationSchema = successEnvelope({
  provider: platformOAuthAdminProviderSchema,
}).strict();

export type PlatformOAuthAdminProvider = z.infer<
  typeof platformOAuthAdminProviderSchema
>;

export type PlatformOAuthAdminProviderList = z.infer<
  typeof platformOAuthAdminProviderListSchema
>;
