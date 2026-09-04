import { adminApiPath, apiPath, eventChroniclePath, exchangePath, platformApiPath, platformAuthPath, wikiPath } from '@imsweb/contracts/paths';
import { createHash } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnvironment } from "@/app";
import type { RateLimitIdentity } from "@/ports/cache";
import { getClientAddress, services } from "@/middleware/hono-context";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const exchangeOfficeLocationPattern = new RegExp(
  `^${escapeRegExp(exchangePath('/me/offices/'))}[^/]+/location$`,
);
const exchangeOfficeCoverPattern = new RegExp(
  `^${escapeRegExp(exchangePath('/me/offices/'))}[^/]+/cover$`,
);
const exchangeCardReactionPattern = new RegExp(
  `^${escapeRegExp(exchangePath('/cards/'))}[^/]+/reactions$`,
);

// Both the collection and the single-session form share one budget: revoking
// devices one by one must not buy a larger allowance than revoking them at once.
const platformSessionPattern = new RegExp(
  `^${escapeRegExp(platformApiPath('/me/sessions'))}(?:/[^/]+)?$`,
);

// The listing and the per-provider unlink share one budget, for the same reason
// the session routes do: unlinking one provider at a time must not buy a larger
// allowance than reading the list.
const platformOAuthLinkPattern = new RegExp(
  `^${escapeRegExp(platformApiPath('/me/oauth-links'))}(?:/[^/]+)?$`,
);

export interface RateLimitOptions {
  bucket: string;
  limit: number;
  windowSeconds: number;
  identity?: RateLimitIdentity;
  rateLimitKey?: string;
}

export const GLOBAL_REQUEST_LIMIT = {
  bucket: "global",
  limit: 10_000,
  windowSeconds: 15 * 60,
} as const;

export const AUTH_LOGIN_LIMIT = {
  bucket: "auth-login",
  limit: 20,
  windowSeconds: 15 * 60,
} as const;

export const PLATFORM_AUTH_REFRESH_LIMIT = {
  bucket: "platform-auth-refresh",
  limit: 120,
  windowSeconds: 15 * 60,
} as const;

export const PLATFORM_AUTH_LOGIN_LIMIT = {
  bucket: "platform-auth-login",
  limit: 20,
  windowSeconds: 15 * 60,
} as const;

export const PLATFORM_AUTH_LOGIN_ACCOUNT_LIMIT = {
  bucket: "platform-auth-login-account",
  limit: 50,
  windowSeconds: 15 * 60,
} as const;

const PLATFORM_LOGIN_ACCOUNT_KEY_DOMAIN =
  "imsweb:platform-auth:login-account:v1\0";

export function platformLoginAccountRateLimitKey(
  normalizedEmail: string,
): string {
  return createHash("sha256")
    .update(PLATFORM_LOGIN_ACCOUNT_KEY_DOMAIN)
    .update(normalizedEmail)
    .digest("hex");
}

export const PLATFORM_AUTH_REGISTER_LIMIT = {
  bucket: "platform-auth-register",
  limit: 10,
  windowSeconds: 60 * 60,
} as const;

export const PLATFORM_AUTH_EMAIL_VERIFICATION_LIMIT = {
  bucket: "platform-auth-email-verification",
  limit: 10,
  windowSeconds: 60 * 60,
} as const;

export const REACTION_LIMIT = {
  bucket: "reactions",
  limit: 300,
  windowSeconds: 60 * 60,
} as const;

export const CHRONICLE_UPLOAD_ATTEMPT_LIMIT = {
  bucket: "chronicle-upload-attempt",
  limit: 60,
  windowSeconds: 60 * 60,
} as const;

export const CHRONICLE_UPLOAD_WRITE_LIMIT = {
  bucket: "chronicle-upload-write",
  limit: 30,
  windowSeconds: 60 * 60,
} as const;

export const FUDABA_UPLOAD_ATTEMPT_LIMIT = {
  bucket: "fudaba-upload-attempt",
  limit: 60,
  windowSeconds: 60 * 60,
} as const;

// Avatar uploads left the Fudaba upload budget when they moved to the Platform
// identity domain, so a closed card rollout can no longer starve them.
export const PLATFORM_AVATAR_UPLOAD_LIMIT = {
  bucket: "platform-avatar-upload-attempt",
  limit: 60,
  windowSeconds: 60 * 60,
} as const;

// Account security endpoints are sensitive enough to need their own path-level
// bucket. The existing password-reset endpoints lean on the global budget and a
// database cooldown instead; that gap is not worth copying.
export const PLATFORM_SECURITY_PASSWORD_LIMIT = {
  bucket: "platform-security-password-ip",
  limit: 20,
  windowSeconds: 60 * 60,
} as const;

export const PLATFORM_SECURITY_SESSION_LIMIT = {
  bucket: "platform-security-session-ip",
  limit: 120,
  windowSeconds: 60 * 60,
} as const;

export const PLATFORM_SECURITY_OAUTH_LIMIT = {
  bucket: "platform-security-oauth-ip",
  limit: 60,
  windowSeconds: 60 * 60,
} as const;

export const FUDABA_WRITE_ATTEMPT_LIMIT = {
  bucket: "fudaba-write-attempt",
  limit: 240,
  windowSeconds: 60 * 60,
} as const;

export const FUDABA_MAP_READ_LIMIT = {
  bucket: "fudaba-map-ip",
  limit: 300,
  windowSeconds: 15 * 60,
} as const;

export const FUDABA_LOCATION_WRITE_LIMIT = {
  bucket: "fudaba-location-ip",
  limit: 60,
  windowSeconds: 60 * 60,
} as const;

export function chronicleUploadIdempotencyKey(request: Request): string | null {
  if (!request.headers.has("Idempotency-Key")) return null;
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (
    !key ||
    key !== key.trim() ||
    key.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(key)
  ) {
    throw Object.assign(new Error("无效的幂等键"), { status: 400 });
  }
  return key;
}

export function isDynamicBusinessRequest(
  method: string,
  pathname: string,
): boolean {
  if (method === "OPTIONS") return false;
  if (pathname === apiPath('/health/live') || pathname === wikiPath('/test')) {
    return false;
  }
  return (
    pathname === apiPath() ||
    pathname.startsWith(apiPath('/')) ||
    pathname === eventChroniclePath() ||
    pathname.startsWith(eventChroniclePath('/'))
  );
}

export function validatedRequestPath(c: Context<AppEnvironment>): string {
  try {
    const rawPathname = new URL(c.req.raw.url).pathname;
    // Hono has already decoded the routing path into c.req.path. Decode the
    // raw pathname only as validation so encoded separators and %25 are
    // never decoded a second time for middleware classification.
    decodeURI(rawPathname);
  } catch {
    throw Object.assign(new Error("Malformed request path"), { status: 400 });
  }
  return c.req.path;
}

export async function enforceRateLimit(
  c: Context<AppEnvironment>,
  options: RateLimitOptions,
): Promise<Response | null> {
  const limiter = services(c).rateLimiter;
  if (!limiter) return null;
  const result = await limiter.consume(
    options.bucket,
    options.rateLimitKey ?? getClientAddress(c),
    options.limit,
    options.windowSeconds,
    options.identity,
  );
  if (result.allowed) return null;
  c.header(
    "Retry-After",
    String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
  );
  return c.json({ error: "Too many requests" }, 429);
}

function requestSpecificLimit(
  method: string,
  pathname: string,
): RateLimitOptions | null {
  if (
    method === "GET" &&
    (pathname === exchangePath('/map/config') ||
      pathname === exchangePath('/map/offices'))
  ) {
    return FUDABA_MAP_READ_LIMIT;
  }
  if (
    ["PUT", "DELETE"].includes(method) &&
    exchangeOfficeLocationPattern.test(pathname)
  ) {
    return FUDABA_LOCATION_WRITE_LIMIT;
  }
  if (method === "PUT" && pathname === platformApiPath('/me/avatar')) {
    return PLATFORM_AVATAR_UPLOAD_LIMIT;
  }
  if (method === "POST" && pathname === platformApiPath('/me/password')) {
    return PLATFORM_SECURITY_PASSWORD_LIMIT;
  }
  if (
    ["GET", "DELETE"].includes(method) &&
    platformSessionPattern.test(pathname)
  ) {
    return PLATFORM_SECURITY_SESSION_LIMIT;
  }
  if (
    ["GET", "DELETE"].includes(method) &&
    platformOAuthLinkPattern.test(pathname)
  ) {
    return PLATFORM_SECURITY_OAUTH_LIMIT;
  }
  if (
    (method === "PUT" && (
      pathname.startsWith(exchangePath('/uploads/')) ||
      exchangeOfficeCoverPattern.test(pathname)
    )) ||
    (method === "POST" && pathname === exchangePath('/cards'))
  ) {
    return FUDABA_UPLOAD_ATTEMPT_LIMIT;
  }
  // Exchange card reactions are anonymous counters, so they share the namecard
  // reaction budget instead of the account-scoped exchange write budget.
  if (
    (method === "POST" || method === "DELETE") &&
    exchangeCardReactionPattern.test(pathname)
  ) {
    return REACTION_LIMIT;
  }
  if (
    ["POST", "PUT", "DELETE"].includes(method) &&
    (pathname === platformApiPath('/me') ||
      // Avatar removal is a profile write, not an upload, so it shares the
      // profile write budget. The upload branch above already took the PUT.
      (method === "DELETE" && pathname === platformApiPath('/me/avatar')) ||
      pathname.startsWith(exchangePath('/')))
  ) {
    return FUDABA_WRITE_ATTEMPT_LIMIT;
  }
  if (
    method === "POST" &&
    pathname === platformAuthPath('/refresh')
  ) {
    return PLATFORM_AUTH_REFRESH_LIMIT;
  }
  if (method === "POST" && pathname === platformAuthPath('/login')) {
    return PLATFORM_AUTH_LOGIN_LIMIT;
  }
  if (method === "POST" && pathname === platformAuthPath('/register')) {
    return PLATFORM_AUTH_REGISTER_LIMIT;
  }
  if (
    method === "POST" &&
    pathname === platformAuthPath('/register/verification-code')
  ) {
    return PLATFORM_AUTH_EMAIL_VERIFICATION_LIMIT;
  }
  if (
    method === "POST" &&
    [apiPath('/login'), adminApiPath('/login'), adminApiPath('/auth/login')].includes(
      pathname,
    )
  ) {
    return AUTH_LOGIN_LIMIT;
  }
  if (
    (method === "POST" || method === "DELETE") &&
    (pathname === apiPath('/emojis') || pathname === apiPath('/reactions'))
  ) {
    return REACTION_LIMIT;
  }
  return null;
}

export function requestRateLimit(): MiddlewareHandler<AppEnvironment> {
  return async (c, next) => {
    const pathname = validatedRequestPath(c);
    if (!isDynamicBusinessRequest(c.req.method, pathname)) return next();
    const globalLimited = await enforceRateLimit(c, GLOBAL_REQUEST_LIMIT);
    if (globalLimited) return globalLimited;
    if (c.req.method === "POST" && pathname === eventChroniclePath('/upload')) {
      const idempotencyKey = chronicleUploadIdempotencyKey(c.req.raw);
      const attemptLimited = await enforceRateLimit(
        c,
        CHRONICLE_UPLOAD_ATTEMPT_LIMIT,
      );
      if (attemptLimited) return attemptLimited;
      const writeLimited = await enforceRateLimit(c, {
        ...CHRONICLE_UPLOAD_WRITE_LIMIT,
        ...(idempotencyKey
          ? {
              identity: {
                operation: "chronicle:upload:write",
                identity: idempotencyKey,
              },
            }
          : {}),
      });
      if (writeLimited) return writeLimited;
    }
    const specific = requestSpecificLimit(c.req.method, pathname);
    if (specific) {
      const specificLimited = await enforceRateLimit(c, specific);
      if (specificLimited) return specificLimited;
    }
    return next();
  };
}
