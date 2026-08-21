export function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function hasExactKeys(
    value: Record<string, unknown>,
    keys: readonly string[]
): boolean {
    const actual = Object.keys(value).sort();
    return actual.length === keys.length &&
        actual.every((key, index) => key === [...keys].sort()[index]);
}

export function normalizePlatformEmail(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (
        normalized.length < 3 || normalized.length > 320 ||
        /[\u0000-\u0020\u007f]/.test(normalized)
    ) {
        return null;
    }
    const separator = normalized.lastIndexOf('@');
    if (separator <= 0 || separator !== normalized.indexOf('@')) return null;
    const local = normalized.slice(0, separator);
    const domain = normalized.slice(separator + 1);
    if (
        local.length > 64 || domain.length > 255 ||
        local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
        !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
        !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) ||
        !domain.includes('.') || domain.includes('..') ||
        domain.split('.').some((label) => (
            !label || label.length > 63 || label.startsWith('-') || label.endsWith('-')
        ))
    ) {
        return null;
    }
    return normalized;
}

export function normalizeMigratedPlatformEmail(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return normalized.length <= 254 && /^\S+@\S+\.\S+$/.test(normalized)
        ? normalized
        : null;
}

export function normalizedLoginPassword(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    const characters = Array.from(normalized).length;
    return characters >= 1 && characters <= 128 &&
        new TextEncoder().encode(normalized).byteLength <= 1024
        ? normalized
        : null;
}

export function isBcryptPasswordSafe(value: string): boolean {
    return new TextEncoder().encode(value).byteLength <= 72;
}

export function normalizedRegistrationPassword(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    const characters = Array.from(normalized).length;
    return characters >= 8 && characters <= 128 && isBcryptPasswordSafe(normalized)
        ? normalized
        : null;
}

export function isPlatformJsonContentType(value: string | undefined): boolean {
    if (!value) return false;
    const mediaType = value.split(';', 1)[0].trim().toLowerCase();
    return mediaType === 'application/json' ||
        /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType);
}

export function isMigratedPbkdf2Parameters(value: string): boolean {
    let parameters: unknown;
    try {
        parameters = JSON.parse(value);
    } catch {
        return false;
    }
    return isRecord(parameters) && hasExactKeys(parameters, [
        'encoding',
        'hash',
        'iterations',
        'keyLength',
        'saltEncoding'
    ]) && parameters.iterations === 100_000 &&
        parameters.hash === 'sha256' && parameters.keyLength === 32 &&
        parameters.encoding === 'hex' && parameters.saltEncoding === 'utf8';
}
