import { getDomain } from 'tldts';

export type RuntimeEnvironment = 'development' | 'test' | 'production';

export interface CookieOptions {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax';
    path: string;
}

const runtimeEnvironment = String(process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase();

if (!['development', 'test', 'production'].includes(runtimeEnvironment)) {
    throw new Error(
        `NODE_ENV must be development, test, or production (received ${runtimeEnvironment})`
    );
}

export const RUNTIME_ENV = runtimeEnvironment as RuntimeEnvironment;
export const IS_PRODUCTION = RUNTIME_ENV === 'production';
const DEVELOPMENT_SECRET = 'dev-only-insecure-change-me';
const DEFAULT_STORY_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const DEFAULT_SITE_PACKAGE_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface SiteOriginConfig {
    siteOrigin: string;
    sitePackageOrigin: string;
}

function absoluteOrigin(name: string, value: string): string {
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${name} must be an absolute HTTP(S) origin`);
    }
    if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username || parsed.password || parsed.pathname !== '/' ||
        parsed.search || parsed.hash
    ) {
        throw new Error(`${name} must be an absolute HTTP(S) origin without a path`);
    }
    return parsed.origin;
}

export function parseSiteOrigins(
    environment: NodeJS.ProcessEnv = process.env
): SiteOriginConfig {
    const mode = String(environment.NODE_ENV || 'development').trim().toLowerCase();
    const production = mode === 'production';
    if (production && (!environment.IMS_SITE_ORIGIN || !environment.IMS_SITE_PACKAGE_ORIGIN)) {
        throw new Error(
            'IMS_SITE_ORIGIN and IMS_SITE_PACKAGE_ORIGIN are required in production'
        );
    }
    const siteOrigin = absoluteOrigin(
        'IMS_SITE_ORIGIN',
        environment.IMS_SITE_ORIGIN || 'http://127.0.0.1:5173'
    );
    const sitePackageOrigin = absoluteOrigin(
        'IMS_SITE_PACKAGE_ORIGIN',
        environment.IMS_SITE_PACKAGE_ORIGIN ||
            `http://content.localhost:${environment.PORT || '3000'}`
    );
    if (siteOrigin === sitePackageOrigin) {
        throw new Error('IMS_SITE_ORIGIN and IMS_SITE_PACKAGE_ORIGIN must be distinct origins');
    }
    if (production) {
        const siteDomain = getDomain(new URL(siteOrigin).hostname);
        const packageDomain = getDomain(new URL(sitePackageOrigin).hostname);
        if (!siteDomain || !packageDomain || siteDomain === packageDomain) {
            throw new Error(
                'IMS_SITE_ORIGIN and IMS_SITE_PACKAGE_ORIGIN must use independent registrable sites'
            );
        }
    }
    return { siteOrigin, sitePackageOrigin };
}

export function parseSitePackageMaxUploadBytes(value: string | undefined): number {
    if (value === undefined) return DEFAULT_SITE_PACKAGE_MAX_UPLOAD_BYTES;
    const parsed = Number(value);
    if (
        !Number.isSafeInteger(parsed) || parsed < 1 ||
        parsed > DEFAULT_SITE_PACKAGE_MAX_UPLOAD_BYTES
    ) {
        throw new Error(
            'IMS_SITE_PACKAGE_MAX_UPLOAD_BYTES must be a positive safe integer no greater than ' +
            DEFAULT_SITE_PACKAGE_MAX_UPLOAD_BYTES
        );
    }
    return parsed;
}

export function parseStoryMaxUploadBytes(value: string | undefined): number {
    if (value === undefined) return DEFAULT_STORY_MAX_UPLOAD_BYTES;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > DEFAULT_STORY_MAX_UPLOAD_BYTES) {
        throw new Error(
            `IMS_STORY_MAX_UPLOAD_BYTES must be a positive safe integer no greater than ${DEFAULT_STORY_MAX_UPLOAD_BYTES}`
        );
    }
    return parsed;
}

function envFlag(name: string, fallback: boolean): boolean {
    const value = process.env[name];
    if (value === undefined) return fallback;
    return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

function getJwtSecret(): string {
    const configuredSecret = process.env.IMS_JWT_SECRET;
    if (configuredSecret) {
        if (IS_PRODUCTION && Buffer.byteLength(configuredSecret, 'utf8') < 32) {
            throw new Error('IMS_JWT_SECRET must be at least 32 UTF-8 bytes in production');
        }
        return configuredSecret;
    }
    if (IS_PRODUCTION) {
        throw new Error('IMS_JWT_SECRET is required when NODE_ENV=production');
    }
    console.warn(
        '[SECURITY WARNING] IMS_JWT_SECRET is not set; using an insecure development-only secret.'
    );
    return DEVELOPMENT_SECRET;
}

export const SECRET_KEY = getJwtSecret();
export const STORY_MAX_UPLOAD_BYTES = parseStoryMaxUploadBytes(
    process.env.IMS_STORY_MAX_UPLOAD_BYTES
);
export const SITE_PACKAGE_MAX_UPLOAD_BYTES = parseSitePackageMaxUploadBytes(
    process.env.IMS_SITE_PACKAGE_MAX_UPLOAD_BYTES
);
export const SITE_ORIGINS = parseSiteOrigins();

export function parseClientAddressSource(
    value: string | undefined
): 'direct' | 'nginx' {
    const source = value?.trim().toLowerCase() || 'direct';
    if (source !== 'direct' && source !== 'nginx') {
        throw new Error('IMS_CLIENT_ADDRESS_SOURCE must be direct or nginx');
    }
    return source;
}

export const CLIENT_ADDRESS_SOURCE = parseClientAddressSource(
    process.env.IMS_CLIENT_ADDRESS_SOURCE
);
const COOKIE_SECURE = envFlag('IMS_COOKIE_SECURE', IS_PRODUCTION);

export const COOKIE_OPTIONS: CookieOptions = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/'
};

export const CSRF_COOKIE_OPTIONS: CookieOptions = {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/'
};
