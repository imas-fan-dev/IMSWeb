import { createHash, randomBytes } from 'node:crypto';
import { NAMECARD_SCAN_TOKEN_TTL_MS } from '@imsweb/contracts/namecards/runtime';

/** 二维码只出示一次,库里只留 token 的摘要。 */
export function newScanToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('hex');
    return { token, tokenHash: scanTokenHash(token) };
}

export function scanTokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export function scanSessionExpiry(now: number): string {
    return new Date(now + NAMECARD_SCAN_TOKEN_TTL_MS).toISOString();
}
