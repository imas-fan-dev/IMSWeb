export interface TrimmedTextOptions {
    maximumLength: number;
    minimumLength?: number;
    allowControlCharacters?: boolean;
}

export function trimmedText(
    value: unknown,
    options: TrimmedTextOptions
): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    const minimumLength = options.minimumLength ?? 1;
    if (
        normalized.length < minimumLength ||
        normalized.length > options.maximumLength ||
        (!options.allowControlCharacters && /[\u0000-\u001f\u007f]/.test(normalized))
    ) {
        return null;
    }
    return normalized;
}
