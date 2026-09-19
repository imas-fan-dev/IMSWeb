import { createHash } from 'node:crypto';

type CookieValues = Iterable<readonly [name: string, value: string]>;

export function setCookieHeaders(response: Response): string[] {
    return (response.headers as Headers & { getSetCookie(): string[] }).getSetCookie();
}

export function readSetCookieValues(response: Response): Map<string, string> {
    return new Map(setCookieHeaders(response).map((cookie) => {
        const [pair] = cookie.split(';', 1);
        const separator = pair!.indexOf('=');
        if (separator < 1) {
            throw new Error(`invalid Set-Cookie header: ${cookie}`);
        }
        return [
            pair!.slice(0, separator),
            decodeURIComponent(pair!.slice(separator + 1))
        ];
    }));
}

export function serializeCookieHeader(values: CookieValues): string {
    return [...values]
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join('; ');
}

export function bearerTokenHeaders(
    token: string,
    extra: Record<string, string> = {}
): Record<string, string> {
    return { authorization: `Bearer ${token}`, ...extra };
}

export function cookieCsrfHeaders(
    cookies: CookieValues,
    csrfHeader: string | null,
    extra: Record<string, string> = {}
): Record<string, string> {
    return {
        cookie: serializeCookieHeader(cookies),
        ...(csrfHeader === null ? {} : { 'x-csrftoken': csrfHeader }),
        ...extra
    };
}

export function fixtureSha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}
