import type { PlatformOAuthLink } from '@imsweb/contracts/platform/account-security';
import type { PlatformOAuthLinkRecord } from '@/ports/repositories';

// Both provider-supplied columns are NOT NULL DEFAULT '', so an empty string is
// the storage encoding for "the provider told us nothing". The wire contract
// says that with null instead of leaking a blank string into the UI.
function optionalText(value: string): string | null {
    return value.length > 0 ? value : null;
}

/**
 * Whether unlinking this provider would still leave a way back into the account.
 *
 * This is the read-side twin of the guard spliced into the DELETE statement in
 * `deleteOAuthIdentity`, and the two must stay clause for clause identical:
 *
 * - an email password credential counts, and
 * - a *surviving* link counts only when its provider is still `enabled`.
 *
 * The `enabled` half is the one that is easy to drop. A disabled provider
 * cannot complete a sign-in, so treating it as a login method would let the UI
 * offer an unlink that strands the user behind a dead button.
 *
 * The frontend is deliberately not asked to recompute this: it does not know
 * which providers are usable, so it would get the same answer wrong.
 */
function removable(
    record: PlatformOAuthLinkRecord,
    records: readonly PlatformOAuthLinkRecord[],
    hasPassword: boolean
): boolean {
    return hasPassword || records.some((other) =>
        other.provider_code !== record.provider_code && other.provider_enabled);
}

/**
 * The only projection of an OAuth link that may leave the server.
 *
 * `provider_subject` is absent by construction rather than by omission: it is
 * not on `PlatformOAuthLinkRecord` and not in the repository's select list, so
 * there is nothing here to accidentally spread onto the wire.
 */
export function platformOAuthLinkViews(
    records: readonly PlatformOAuthLinkRecord[],
    hasPassword: boolean
): PlatformOAuthLink[] {
    return records.map((record) => ({
        provider: record.provider_code,
        providerName: record.provider_label,
        enabled: record.provider_enabled,
        accountName: optionalText(record.provider_display_name),
        avatarUrl: optionalText(record.provider_avatar_url),
        linkedAt: record.created_at,
        removable: removable(record, records, hasPassword)
    }));
}
