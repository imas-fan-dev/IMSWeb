import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { isMigratedPbkdf2Parameters } from '@/domains/identity/platform-auth/contracts/credentials';
import { services } from '@/middleware/hono-context';
import type { PlatformEmailCredentialRecord } from '@/ports/repositories';

/**
 * Proof that the caller knows the password they are replacing.
 *
 * A session alone is not that proof: it can be a borrowed laptop or a stolen
 * cookie. Both stored algorithms are accepted here, because a pbkdf2 account
 * that never logged in since the bcrypt cutover must still be able to rotate
 * its own credential.
 */
export async function matchesCurrentPlatformPassword(
    c: Context<AppEnvironment>,
    password: string,
    credential: PlatformEmailCredentialRecord
): Promise<boolean> {
    const passwords = services(c).passwords;
    if (!passwords) return false;
    try {
        if (credential.algorithm === 'bcrypt') {
            return await passwords.verify(password, credential.password_hash);
        }
        return Boolean(
            credential.salt &&
            passwords.verifyPbkdf2Sha256 &&
            isMigratedPbkdf2Parameters(credential.parameters_json) &&
            await passwords.verifyPbkdf2Sha256(
                password,
                credential.salt,
                credential.password_hash
            )
        );
    } catch {
        return false;
    }
}
