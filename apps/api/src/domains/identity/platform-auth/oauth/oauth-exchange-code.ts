import { randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { platformAccountRepository } from '@/middleware/hono-context';
import { sha256Hex } from '@/utils/crypto/sha256';

/**
 * The single-use code that carries an app OAuth round trip back to the WebView.
 *
 * Both app return branches — login and account linking — hand the deep link a
 * code instead of a cookie, because the callback lands on a different origin
 * than the packaged app. The two branches differ in which account they bind the
 * code to, not in how the code is built, so the mint lives here: a TTL or a
 * hash change has exactly one place to land.
 */

/** How long the app has to redeem the code before the row expires. */
export const PLATFORM_OAUTH_EXCHANGE_CODE_TTL_MS = 5 * 60_000;

/**
 * Mints and stores a code bound to one account and one PKCE challenge, and
 * returns the raw value for the deep link. Only the hash is persisted, so the
 * code is unrecoverable from the database.
 */
export async function mintPlatformOAuthExchangeCode(
    c: Context<AppEnvironment>,
    input: { accountId: string; codeChallenge: string }
): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    const createdAt = Date.now();
    await platformAccountRepository(c).createOAuthExchangeCode({
        codeHash: await sha256Hex(new TextEncoder().encode(code)),
        accountId: input.accountId,
        codeChallenge: input.codeChallenge,
        expiresAt: createdAt + PLATFORM_OAUTH_EXCHANGE_CODE_TTL_MS,
        createdAt
    });
    return code;
}
