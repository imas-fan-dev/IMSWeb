import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
} from 'node:crypto';
import type {
    PlatformEmailJobIdentity,
    PlatformEmailJobPayload,
    PlatformEmailJobPayloadCipher,
    PlatformEmailPreparedJobPayload,
} from '@/ports/email-delivery';

const VERSION = 'v1';
const PAYLOAD_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_CONTEXT = 'IMSWeb platform email delivery job payload v1';
const HEX_64 = /^[a-f0-9]{64}$/;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

function encode(value: Buffer): string {
    return value.toString('base64url');
}

function decode(value: string): Buffer {
    return Buffer.from(value, 'base64url');
}

function authenticatedData(identity: PlatformEmailJobIdentity): Buffer {
    if (
        identity.payloadVersion !== PAYLOAD_VERSION ||
        !HEX_64.test(identity.jobId) ||
        !HEX_64.test(identity.deliveryToken) ||
        !['registration', 'password_reset'].includes(identity.purpose)
    ) {
        throw new Error('Platform email delivery job identity is invalid');
    }
    return Buffer.from(
        [
            KEY_CONTEXT,
            String(identity.payloadVersion),
            identity.jobId,
            identity.purpose,
            identity.deliveryToken,
        ].join('\0'),
        'utf8',
    );
}

function validatePayload(
    identity: PlatformEmailJobIdentity,
    value: unknown,
): PlatformEmailJobPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Platform email delivery payload is invalid');
    }
    const payload = value as Record<string, unknown>;
    const expiresInMinutes = identity.purpose === 'registration' ? 10 : 15;
    if (
        Object.keys(payload).length !== 4 ||
        payload.purpose !== identity.purpose ||
        typeof payload.normalizedEmail !== 'string' ||
        payload.normalizedEmail !== payload.normalizedEmail.trim().toLowerCase() ||
        payload.normalizedEmail.length > 320 ||
        !EMAIL_PATTERN.test(payload.normalizedEmail) ||
        typeof payload.code !== 'string' ||
        !/^\d{6}$/.test(payload.code) ||
        payload.expiresInMinutes !== expiresInMinutes
    ) {
        throw new Error('Platform email delivery payload is invalid');
    }
    if (identity.purpose === 'registration') {
        return {
            purpose: 'registration',
            normalizedEmail: payload.normalizedEmail,
            code: payload.code,
            expiresInMinutes: 10,
        };
    }
    return {
        purpose: 'password_reset',
        normalizedEmail: payload.normalizedEmail,
        code: payload.code,
        expiresInMinutes: 15,
    };
}

export class PlatformEmailJobPayloadCipherAdapter
    implements PlatformEmailJobPayloadCipher
{
    private readonly key: Buffer;

    constructor(secret: string) {
        if (Buffer.byteLength(secret, 'utf8') < 32) {
            throw new Error('Platform email delivery encryption secret is too short');
        }
        this.key = createHash('sha256')
            .update(KEY_CONTEXT)
            .update('\0')
            .update(secret)
            .digest();
    }

    encrypt(
        identity: PlatformEmailJobIdentity,
        payload: PlatformEmailJobPayload,
    ): PlatformEmailPreparedJobPayload {
        const validated = validatePayload(identity, payload);
        const iv = randomBytes(IV_BYTES);
        const cipher = createCipheriv(ALGORITHM, this.key, iv, {
            authTagLength: AUTH_TAG_BYTES,
        });
        cipher.setAAD(authenticatedData(identity));
        const ciphertext = Buffer.concat([
            cipher.update(JSON.stringify(validated), 'utf8'),
            cipher.final(),
        ]);
        return {
            ...identity,
            normalizedEmail: validated.normalizedEmail,
            payloadCiphertext: [
                VERSION,
                encode(iv),
                encode(cipher.getAuthTag()),
                encode(ciphertext),
            ].join('.'),
        } as PlatformEmailPreparedJobPayload;
    }

    decrypt(
        identity: PlatformEmailJobIdentity,
        value: string,
    ): PlatformEmailJobPayload {
        try {
            const parts = value.split('.');
            if (parts.length !== 4 || parts[0] !== VERSION) throw new Error();
            const iv = decode(parts[1]);
            const authTag = decode(parts[2]);
            const ciphertext = decode(parts[3]);
            if (iv.byteLength !== IV_BYTES || authTag.byteLength !== AUTH_TAG_BYTES) {
                throw new Error();
            }
            const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
                authTagLength: AUTH_TAG_BYTES,
            });
            decipher.setAAD(authenticatedData(identity));
            decipher.setAuthTag(authTag);
            const plaintext = Buffer.concat([
                decipher.update(ciphertext),
                decipher.final(),
            ]).toString('utf8');
            return validatePayload(identity, JSON.parse(plaintext));
        } catch {
            throw new Error('Platform email delivery payload ciphertext is invalid');
        }
    }
}
