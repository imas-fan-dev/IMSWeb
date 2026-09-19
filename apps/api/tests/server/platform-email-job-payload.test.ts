import assert from 'node:assert/strict';
import { test } from 'vitest';
import { PlatformEmailJobPayloadCipherAdapter } from '@/infra/email/smtp/platform-email-job-payload';
import { PlatformEmailSecretCipher } from '@/infra/email/smtp/platform-email-secrets';
import type {
    PlatformEmailJobIdentity,
    PlatformEmailJobPayload,
} from '@/ports/email-delivery';

const SECRET = 'platform-email-job-payload-test-secret-0123456789';
const REGISTRATION_IDENTITY: PlatformEmailJobIdentity = {
    jobId: '1'.repeat(64),
    purpose: 'registration',
    deliveryToken: '2'.repeat(64),
    payloadVersion: 1,
};
const REGISTRATION_PAYLOAD: PlatformEmailJobPayload = {
    purpose: 'registration',
    normalizedEmail: 'producer@example.test',
    code: '123456',
    expiresInMinutes: 10,
};

function mutateCiphertext(value: string): string {
    const parts = value.split('.');
    const ciphertext = parts[3];
    const index = Math.floor(ciphertext.length / 2);
    const replacement = ciphertext[index] === 'A' ? 'B' : 'A';
    parts[3] = `${ciphertext.slice(0, index)}${replacement}${ciphertext.slice(index + 1)}`;
    return parts.join('.');
}

test('platform email job payload cipher round trips one prepared delivery identity', () => {
    const cipher = new PlatformEmailJobPayloadCipherAdapter(SECRET);
    const encrypted = cipher.encrypt(REGISTRATION_IDENTITY, REGISTRATION_PAYLOAD);

    assert.deepEqual(
        {
            jobId: encrypted.jobId,
            purpose: encrypted.purpose,
            deliveryToken: encrypted.deliveryToken,
            payloadVersion: encrypted.payloadVersion,
            normalizedEmail: encrypted.normalizedEmail,
        },
        {
            ...REGISTRATION_IDENTITY,
            normalizedEmail: REGISTRATION_PAYLOAD.normalizedEmail,
        },
    );
    assert.doesNotMatch(encrypted.payloadCiphertext, /producer@example\.test|123456/);
    assert.deepEqual(
        cipher.decrypt(REGISTRATION_IDENTITY, encrypted.payloadCiphertext),
        REGISTRATION_PAYLOAD,
    );
});

test('platform email job payload cipher separates credential context and authenticates identity', () => {
    const cipher = new PlatformEmailJobPayloadCipherAdapter(SECRET);
    const encrypted = cipher.encrypt(REGISTRATION_IDENTITY, REGISTRATION_PAYLOAD);
    const credentialCipher = new PlatformEmailSecretCipher(SECRET);

    assert.throws(() => credentialCipher.decrypt(encrypted.payloadCiphertext));
    assert.throws(
        () => cipher.decrypt(
            { ...REGISTRATION_IDENTITY, jobId: '3'.repeat(64) },
            encrypted.payloadCiphertext,
        ),
        /ciphertext is invalid/,
    );
    assert.throws(
        () => cipher.decrypt(
            { ...REGISTRATION_IDENTITY, deliveryToken: '4'.repeat(64) },
            encrypted.payloadCiphertext,
        ),
        /ciphertext is invalid/,
    );
    assert.throws(
        () => cipher.decrypt(
            { ...REGISTRATION_IDENTITY, purpose: 'password_reset' },
            encrypted.payloadCiphertext,
        ),
        /ciphertext is invalid/,
    );
});

test('platform email job payload cipher rejects authenticated ciphertext tampering', () => {
    const cipher = new PlatformEmailJobPayloadCipherAdapter(SECRET);
    const encrypted = cipher.encrypt(REGISTRATION_IDENTITY, REGISTRATION_PAYLOAD);

    assert.throws(
        () => cipher.decrypt(
            REGISTRATION_IDENTITY,
            mutateCiphertext(encrypted.payloadCiphertext),
        ),
        /ciphertext is invalid/,
    );
});

test('platform email job payload cipher preserves multibyte recipients', () => {
    const cipher = new PlatformEmailJobPayloadCipherAdapter(SECRET);
    const identity: PlatformEmailJobIdentity = {
        jobId: '5'.repeat(64),
        purpose: 'password_reset',
        deliveryToken: '6'.repeat(64),
        payloadVersion: 1,
    };
    const payload: PlatformEmailJobPayload = {
        purpose: 'password_reset',
        normalizedEmail: '制作人@例子.测试',
        code: '654321',
        expiresInMinutes: 15,
    };
    const encrypted = cipher.encrypt(identity, payload);

    assert.equal(encrypted.normalizedEmail, payload.normalizedEmail);
    assert.deepEqual(cipher.decrypt(identity, encrypted.payloadCiphertext), payload);
});

test('platform email job payload purpose fixes the verification lifetime', () => {
    const cipher = new PlatformEmailJobPayloadCipherAdapter(SECRET);

    assert.throws(
        () => cipher.encrypt(
            REGISTRATION_IDENTITY,
            {
                ...REGISTRATION_PAYLOAD,
                expiresInMinutes: 15,
            } as unknown as PlatformEmailJobPayload,
        ),
        /payload is invalid/,
    );
    assert.throws(
        () => cipher.encrypt(
            {
                ...REGISTRATION_IDENTITY,
                purpose: 'password_reset',
            },
            {
                purpose: 'password_reset',
                normalizedEmail: REGISTRATION_PAYLOAD.normalizedEmail,
                code: REGISTRATION_PAYLOAD.code,
                expiresInMinutes: 10,
            } as unknown as PlatformEmailJobPayload,
        ),
        /payload is invalid/,
    );
});
