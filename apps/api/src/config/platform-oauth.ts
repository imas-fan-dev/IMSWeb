import { isIP } from 'node:net';
import type { RuntimeEnvironment } from '@/config/env';
import { PlatformOAuthProviderValidationError } from '@/ports/oauth';

export interface PlatformOAuthConfig {
    requestTimeoutMs: number;
    allowInsecureLoopbackEndpoints: boolean;
}

function loopbackHostname(hostname: string): boolean {
    return ['localhost', '127.0.0.1', '[::1]'].includes(hostname.toLowerCase());
}

function privateIpv4(hostname: string): boolean {
    const parts = hostname.split('.').map(Number);
    if (
        parts.length !== 4 ||
        parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
        return false;
    }
    const [first, second] = parts as [number, number, number, number];
    return (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 198 && (second === 18 || second === 19)) ||
        first >= 224
    );
}

function privateIpv6(hostname: string): boolean {
    const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return (
        normalized === '::' ||
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        /^(?:fe[89ab])/.test(normalized) ||
        normalized.startsWith('ff')
    );
}

function privateOrLocalHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    if (
        normalized === 'localhost' ||
        normalized.endsWith('.localhost') ||
        normalized.endsWith('.local') ||
        normalized.endsWith('.internal') ||
        normalized.endsWith('.home')
    ) {
        return true;
    }
    const ipVersion = isIP(normalized.replace(/^\[|\]$/g, ''));
    return ipVersion === 4
        ? privateIpv4(normalized)
        : ipVersion === 6
          ? privateIpv6(normalized)
          : false;
}

function validatedOAuthUrl(
    value: string,
    environment: RuntimeEnvironment,
    label: string,
    allowInsecureLoopback: boolean,
): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new PlatformOAuthProviderValidationError(`${label} must be an absolute URL`);
    }
    const localDevelopment =
        allowInsecureLoopback &&
        environment !== 'production' &&
        url.protocol === 'http:' &&
        loopbackHostname(url.hostname);
    if (url.protocol !== 'https:' && !localDevelopment) {
        throw new PlatformOAuthProviderValidationError(`${label} must use public HTTPS`);
    }
    if (
        url.username ||
        url.password ||
        url.hash ||
        (!localDevelopment && privateOrLocalHostname(url.hostname))
    ) {
        throw new PlatformOAuthProviderValidationError(
            `${label} must not contain credentials, a fragment, or a private host`,
        );
    }
    return url.toString();
}

export function validatePlatformOAuthRedirectUri(
    value: string,
    environment: RuntimeEnvironment,
    variableName = 'redirectUri',
    allowInsecureLoopback = false,
): string {
    return validatedOAuthUrl(value, environment, variableName, allowInsecureLoopback);
}

export function validatePlatformOAuthEndpoint(
    value: string,
    environment: RuntimeEnvironment,
    variableName: string,
    allowInsecureLoopback = false,
): string {
    return validatedOAuthUrl(value, environment, variableName, allowInsecureLoopback);
}

function parseRequestTimeout(value: string): number {
    if (!value) return 10_000;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1_000 || parsed > 30_000) {
        throw new Error(
            'IMS_PLATFORM_OAUTH_REQUEST_TIMEOUT_MS must be an integer from 1000 to 30000',
        );
    }
    return parsed;
}

export function parsePlatformOAuthConfig(
    environment: NodeJS.ProcessEnv = process.env,
): PlatformOAuthConfig {
    const runtime = String(environment.NODE_ENV || 'development') as RuntimeEnvironment;
    return {
        requestTimeoutMs: parseRequestTimeout(
            String(environment.IMS_PLATFORM_OAUTH_REQUEST_TIMEOUT_MS || '').trim(),
        ),
        allowInsecureLoopbackEndpoints:
            runtime !== 'production' &&
            environment.IMS_ALLOW_INSECURE_LOCAL_OAUTH_ENDPOINTS === '1',
    };
}
