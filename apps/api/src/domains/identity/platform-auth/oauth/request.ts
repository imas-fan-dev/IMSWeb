import type {
    PlatformOAuthProviderCode,
    PlatformOAuthProviderUpdateInput,
} from "@/ports/oauth";
import { invalidRequest, requestRecord } from "@/utils/validation/request-data";

const PROVIDER_CODES = new Set<PlatformOAuthProviderCode>(["google", "github"]);

function boundedString(
    value: unknown,
    label: string,
    maximum: number,
    required = true,
): string | undefined {
    if (typeof value !== "string") {
        if (!required && value === undefined) return undefined;
        invalidRequest(`${label}无效`);
    }
    const normalized = value.trim();
    if (!normalized && required) invalidRequest(`${label}不能为空`);
    if (normalized.length > maximum) invalidRequest(`${label}过长`);
    return normalized || undefined;
}

export function parsePlatformOAuthProviderCode(
    value: unknown,
): PlatformOAuthProviderCode {
    if (
        typeof value !== "string" ||
        !PROVIDER_CODES.has(value as PlatformOAuthProviderCode)
    ) {
        invalidRequest("OAuth provider 无效");
    }
    return value as PlatformOAuthProviderCode;
}

export function parsePlatformOAuthProviderUpdate(
    value: unknown,
): Omit<PlatformOAuthProviderUpdateInput, "code"> {
    const payload = requestRecord(value, "OAuth 配置格式无效");
    if (typeof payload.enabled !== "boolean") invalidRequest("OAuth 开关无效");
    if (
        typeof payload.expectedUpdatedAt !== "number" ||
        !Number.isSafeInteger(payload.expectedUpdatedAt) ||
        payload.expectedUpdatedAt < 0
    ) {
        invalidRequest("OAuth 配置版本无效");
    }
    const displayName = boundedString(payload.displayName, "显示名称", 80);
    const clientId = boundedString(payload.clientId, "Client ID", 512, false);
    const clientSecret = boundedString(
        payload.clientSecret,
        "Client Secret",
        2048,
        false,
    );
    const redirectUri = boundedString(
        payload.redirectUri,
        "回调地址",
        2048,
        false,
    );
    return {
        displayName: displayName ?? "",
        enabled: payload.enabled,
        clientId,
        clientSecret,
        redirectUri,
        expectedUpdatedAt: payload.expectedUpdatedAt,
    };
}
