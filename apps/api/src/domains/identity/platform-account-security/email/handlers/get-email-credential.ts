import type { PlatformEmailCredentialResponse } from '@imsweb/contracts/platform/account-security';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { platformAccountRepository } from '@/middleware/hono-context';

/**
 * Reports whether the account has an email credential, and which address.
 *
 * The account-security page cannot infer this from the session payload, and the
 * binding form differs between "link an email" and "move an email". A null
 * email is the link case, not an error.
 */
export async function handleGetPlatformEmailCredential(
    c: Context<AppEnvironment>
): Promise<Response> {
    const claims = c.get('platformUser')!;
    const credential = await platformAccountRepository(c).findEmailCredentialByAccountId(
        claims.id
    );
    const payload: PlatformEmailCredentialResponse = {
        success: true,
        email: credential?.normalized_email ?? null
    };
    return c.json(payload);
}
