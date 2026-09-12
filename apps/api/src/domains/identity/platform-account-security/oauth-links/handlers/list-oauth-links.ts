import type { PlatformOAuthLinkListResponse } from '@imsweb/contracts/platform/account-security';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { platformOAuthLinkViews } from '@/domains/identity/platform-account-security/oauth-links/oauth-link-view';
import { platformAccountRepository } from '@/middleware/hono-context';

export async function handleListPlatformOAuthLinks(
    c: Context<AppEnvironment>
): Promise<Response> {
    const claims = c.get('platformUser')!;
    const repository = platformAccountRepository(c);
    // The credential lookup is what makes `removable` answerable: a password is
    // one of the two things that can keep an account reachable after an unlink.
    const [links, credential] = await Promise.all([
        repository.listOAuthIdentitiesByAccount(claims.id),
        repository.findEmailCredentialByAccountId(claims.id)
    ]);
    const hasPassword = credential !== null;
    const payload: PlatformOAuthLinkListResponse = {
        success: true,
        links: platformOAuthLinkViews(links, hasPassword),
        // Reported for its own sake, not just as an input to `removable`: an
        // OAuth-only account has no password to change, and without this the
        // client can only discover that by submitting the form and reading 409.
        passwordEnabled: hasPassword
    };
    return c.json(payload);
}
