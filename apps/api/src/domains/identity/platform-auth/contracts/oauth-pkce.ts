import { createHash, randomBytes } from 'node:crypto';

/**
 * PKCE and state material shared by the two OAuth round trips.
 *
 * The login capability and the account-security link capability both need the
 * same three values, and neither may reach into the other's handler module.
 * Keeping them here also means the state hash and the challenge derivation can
 * never drift between the two flows, which share one callback.
 */

export interface PlatformOAuthPkcePair {
    state: string;
    verifier: string;
    challenge: string;
}

/** SHA-256 hex of a state value, matching the `^[0-9a-f]{64}$` column check. */
export function hashOAuthStateValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

/**
 * State stays at 256 bits of entropy; the verifier is longer because it is the
 * secret half of PKCE and never leaves the server (or, for the app flow, the
 * app process) until the token exchange.
 */
export function createOAuthPkcePair(): PlatformOAuthPkcePair {
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { state, verifier, challenge };
}
