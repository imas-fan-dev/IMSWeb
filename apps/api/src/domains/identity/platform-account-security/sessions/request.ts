// Session ids are server-minted UUIDs stored in a column bounded to 1-128
// characters. Rejecting anything else here keeps oversized or control-character
// path segments from reaching the repository at all.
export function parsePlatformSessionId(value: string | undefined): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length >= 1 &&
        normalized.length <= 128 &&
        !/[\u0000-\u001f\u007f]/.test(normalized)
        ? normalized
        : null;
}
