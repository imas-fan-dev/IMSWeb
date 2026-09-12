// Provider codes are bounded by the CHECK on `platform_oauth_providers.code`
// (`^[a-z][a-z0-9-]{0,31}$`). A segment outside that shape cannot name a row,
// so it is rejected here and reported as a missing link rather than being
// carried into the repository as a parameter that is guaranteed to miss.
const PROVIDER_CODE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

export function parsePlatformOAuthProviderCode(
    value: string | undefined
): string | null {
    return typeof value === 'string' && PROVIDER_CODE_PATTERN.test(value)
        ? value
        : null;
}
