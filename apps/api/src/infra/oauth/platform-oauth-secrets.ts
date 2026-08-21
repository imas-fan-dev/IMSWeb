import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { PlatformOAuthSecretBox } from '@/ports/oauth';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_CONTEXT = 'IMSWeb platform OAuth configuration v1';

function encode(value: Buffer): string {
    return value.toString('base64url');
}

function decode(value: string): Buffer {
    return Buffer.from(value, 'base64url');
}

export class PlatformOAuthSecretCipher implements PlatformOAuthSecretBox {
    private readonly key: Buffer;

    constructor(secret: string) {
        if (secret.length < 32) {
            throw new Error('Platform OAuth encryption secret is too short');
        }
        this.key = createHash('sha256')
            .update(KEY_CONTEXT)
            .update('\0')
            .update(secret)
            .digest();
    }

    encrypt(value: string): string {
        const normalized = value.trim();
        if (!normalized) throw new Error('OAuth secret cannot be empty');
        const iv = randomBytes(IV_BYTES);
        const cipher = createCipheriv(ALGORITHM, this.key, iv);
        const ciphertext = Buffer.concat([
            cipher.update(normalized, 'utf8'),
            cipher.final()
        ]);
        return [
            VERSION,
            encode(iv),
            encode(cipher.getAuthTag()),
            encode(ciphertext)
        ].join('.');
    }

    decrypt(value: string): string {
        const parts = value.split('.');
        if (parts.length !== 4 || parts[0] !== VERSION) {
            throw new Error('OAuth secret ciphertext is invalid');
        }
        const iv = decode(parts[1]);
        const authTag = decode(parts[2]);
        const ciphertext = decode(parts[3]);
        if (iv.byteLength !== IV_BYTES || authTag.byteLength !== 16) {
            throw new Error('OAuth secret ciphertext is invalid');
        }
        const decipher = createDecipheriv(ALGORITHM, this.key, iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]).toString('utf8');
    }
}
