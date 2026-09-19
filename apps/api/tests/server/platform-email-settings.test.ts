import assert from 'node:assert/strict';
import { afterAll, onTestFinished, test } from 'vitest';
import { ConfiguredPlatformEmailService } from '@/infra/email/smtp/platform-email-service';
import { PlatformEmailSecretCipher } from '@/infra/email/smtp/platform-email-secrets';
import { SqlPlatformEmailConfigurationRepository } from '@/infra/db/repositories/platform-email-configuration-repository';
import {
    createPostgresTestHarness,
    postgresIntegrationEnabled,
} from '../integration/postgres-harness';
import { closeSharedPostgresTestAllocator } from '../postgres-test-lifecycle.js';
import type {
    PlatformEmailConfigurationRecord,
    PlatformEmailConfigurationStore,
} from '@/ports/email';
import { withBoundedCacheOperation } from '@/utils/cache/bounded-operation';

// This file drives the explicit-close harness adapter instead of `postgresTest`,
// so it owns the end-of-process allocator cleanup that the Vitest adapter
// registers for the other PostgreSQL suites.
afterAll(closeSharedPostgresTestAllocator);

function record(
    overrides: Partial<PlatformEmailConfigurationRecord> = {},
): PlatformEmailConfigurationRecord {
    return {
        enabled: false,
        host: 'smtp.example.com',
        port: 465,
        security: 'tls',
        usernameCiphertext: 'encrypted-user',
        passwordCiphertext: 'encrypted-password',
        fromAddress: 'mail@example.com',
        fromName: 'IMSWeb',
        resendCooldownSeconds: 60,
        updatedAt: 1_000,
        ...overrides,
    };
}

function store(initial: PlatformEmailConfigurationRecord) {
    let current = initial;
    let writes = 0;
    const adapter: PlatformEmailConfigurationStore = {
        async getPlatformEmailConfiguration() {
            return current;
        },
        async updatePlatformEmailConfiguration(input) {
            if (input.expectedUpdatedAt !== current.updatedAt) {
                return { status: 'conflict', configuration: current };
            }
            current = input;
            writes += 1;
            return { status: 'saved', configuration: current };
        },
    };
    return {
        adapter,
        current: () => current,
        writes: () => writes,
    };
}

const secretBox = {
    encrypt(value: string) {
        return `encrypted:${value}`;
    },
    decrypt(value: string) {
        if (!value.startsWith('encrypted')) throw new Error('invalid ciphertext');
        return value.startsWith('encrypted:') ? value.slice('encrypted:'.length) :
            value === 'encrypted-user' ? 'mail@example.com' : 'smtp-password';
    },
};

function input(overrides: Record<string, unknown> = {}) {
    return {
        enabled: true,
        host: 'smtp.qiye.163.com',
        port: 465,
        security: 'tls' as const,
        username: 'mail@texasoct.tech',
        password: 'smtp-password',
        fromAddress: 'mail@texasoct.tech',
        fromName: 'IMSWeb',
        resendCooldownSeconds: 60,
        expectedUpdatedAt: 1_000,
        ...overrides,
    };
}

test('platform email secret cipher preserves SMTP password bytes', () => {
    const cipher = new PlatformEmailSecretCipher('s'.repeat(32));
    const password = ' password with spaces % ';
    const ciphertext = cipher.encrypt(password);

    assert.notEqual(ciphertext, password);
    assert.equal(cipher.decrypt(ciphertext), password);
    assert.throws(
        () => new PlatformEmailSecretCipher('another-secret-value-that-is-long-enough').decrypt(ciphertext),
    );
});

test('enabled SMTP updates verify TLS before the optimistic write', async () => {
    const database = store(record());
    const events: string[] = [];
    let transportConfig: {
        host: string;
        port: number;
        security: string;
        resolvedAddress: string;
    } | undefined;
    const service = new ConfiguredPlatformEmailService(
        database.adapter,
        secretBox,
        (config) => {
            transportConfig = {
                host: config.host,
                port: config.port,
                security: config.security,
                resolvedAddress: config.resolvedAddress,
            };
            return {
                async verify() {
                    events.push('verify');
                    return true;
                },
                async sendMail() {
                    events.push('send');
                    return {};
                },
                close() {
                    events.push('close');
                },
            };
        },
        async () => ['93.184.216.34'],
    );

    const result = await service.updateSettings(input());

    assert.equal(result.status, 'saved');
    assert.deepEqual(events, ['verify', 'close']);
    assert.equal(transportConfig?.host, 'smtp.qiye.163.com');
    assert.equal(transportConfig?.port, 465);
    assert.equal(transportConfig?.security, 'tls');
    assert.equal(transportConfig?.resolvedAddress, '93.184.216.34');
    assert.equal(database.current().usernameCiphertext, 'encrypted:mail@texasoct.tech');
    assert.equal(database.current().passwordCiphertext, 'encrypted:smtp-password');
    assert.equal(database.current().resendCooldownSeconds, 60);
    assert.equal(database.writes(), 1);
});

test('SMTP settings never expose stored credentials', async () => {
    const database = store(record({ enabled: true }));
    const service = new ConfiguredPlatformEmailService(
        database.adapter,
        secretBox,
        () => {
            throw new Error('transport should not be created');
        },
    );

    const settings = await service.getSettings();

    assert.equal(settings.usernameMasked, 'ma***@example.com');
    assert.equal(settings.passwordConfigured, true);
    assert.equal(settings.configured, true);
    assert.equal(settings.resendCooldownSeconds, 60);
    assert.equal('password' in settings, false);
    assert.equal('username' in settings, false);
});

test('stale SMTP writes return the current settings without opening a connection', async () => {
    const database = store(record({ updatedAt: 2_000 }));
    const policyWrites: unknown[] = [];
    const service = new ConfiguredPlatformEmailService(
        database.adapter,
        secretBox,
        () => {
            throw new Error('transport should not be created');
        },
        undefined,
        {
            resendPolicyCache: {
                async read() {
                    return null;
                },
                async writeIfNewer(policy) {
                    policyWrites.push(policy);
                    return true;
                },
            },
        },
    );

    const result = await service.updateSettings(input());

    assert.equal(result.status, 'conflict');
    assert.equal(result.settings.updatedAt, 2_000);
    assert.equal(database.writes(), 0);
    assert.deepEqual(policyWrites, []);
});

test('SMTP database compare-and-swap conflicts do not write the resend policy cache', async () => {
    const current = record();
    const winning = record({ resendCooldownSeconds: 600, updatedAt: 2_000 });
    const policyWrites: unknown[] = [];
    const configurationStore: PlatformEmailConfigurationStore = {
        async getPlatformEmailConfiguration() {
            return current;
        },
        async updatePlatformEmailConfiguration() {
            return { status: 'conflict', configuration: winning };
        },
    };
    const service = new ConfiguredPlatformEmailService(
        configurationStore,
        secretBox,
        () => {
            throw new Error('transport should not be created');
        },
        undefined,
        {
            resendPolicyCache: {
                async read() {
                    return null;
                },
                async writeIfNewer(policy) {
                    policyWrites.push(policy);
                    return true;
                },
            },
        },
    );

    const result = await service.updateSettings(input({ enabled: false }));

    assert.equal(result.status, 'conflict');
    assert.equal(result.settings.updatedAt, 2_000);
    assert.equal(result.settings.resendCooldownSeconds, 600);
    assert.deepEqual(policyWrites, []);
});

test('saved SMTP settings write the returned resend policy revision through cache', async () => {
    const database = store(record());
    const policyWrites: unknown[] = [];
    const service = new ConfiguredPlatformEmailService(
        database.adapter,
        secretBox,
        () => {
            throw new Error('transport should not be created');
        },
        undefined,
        {
            resendPolicyCache: {
                async read() {
                    return null;
                },
                async writeIfNewer(policy) {
                    policyWrites.push(policy);
                    return true;
                },
            },
        },
    );

    const result = await service.updateSettings(input({
        enabled: false,
        resendCooldownSeconds: 30,
    }));

    assert.equal(result.status, 'saved');
    assert.deepEqual(policyWrites, [{
        resendCooldownSeconds: 30,
        updatedAt: result.settings.updatedAt,
    }]);
});

test('SMTP policy cache failure does not change a committed settings result', async () => {
    const database = store(record());
    const reported: string[] = [];
    const service = new ConfiguredPlatformEmailService(
        database.adapter,
        secretBox,
        () => {
            throw new Error('transport should not be created');
        },
        undefined,
        {
            resendPolicyCache: {
                async read() {
                    return null;
                },
                async writeIfNewer() {
                    throw new Error('cache error with secret-like detail');
                },
            },
            reportResendPolicyCacheError(operation) {
                reported.push(operation);
            },
        },
    );

    const result = await service.updateSettings(input({ enabled: false }));

    assert.equal(result.status, 'saved');
    assert.equal(database.writes(), 1);
    assert.deepEqual(reported, ['write-through']);
});

test('SMTP policy cache timeout does not delay a committed settings result indefinitely', async () => {
    const database = store(record());
    const reported: string[] = [];
    let aborted = false;
    const service = new ConfiguredPlatformEmailService(
        database.adapter,
        secretBox,
        () => {
            throw new Error('transport should not be created');
        },
        undefined,
        {
            resendPolicyCache: {
                async read() {
                    return null;
                },
                writeIfNewer(_record, signal) {
                    return new Promise<never>((_resolve, reject) => {
                        signal?.addEventListener(
                            'abort',
                            () => {
                                aborted = true;
                                reject(new Error('cache operation aborted'));
                            },
                            { once: true },
                        );
                    });
                },
            },
            reportResendPolicyCacheError(operation) {
                reported.push(operation);
            },
        },
    );

    const result = await withBoundedCacheOperation(
        () => service.updateSettings(input({ enabled: false })),
        1_000,
    );

    assert.equal(result.status, 'saved');
    assert.equal(database.writes(), 1);
    assert.deepEqual(reported, ['write-through']);
    assert.equal(aborted, true);
});

test('SMTP resend cooldown accepts boundaries and retains stored credentials', async () => {
    for (const resendCooldownSeconds of [30, 600]) {
        const database = store(record());
        const service = new ConfiguredPlatformEmailService(
            database.adapter,
            secretBox,
            () => {
                throw new Error('transport should not be created');
            },
        );

        const result = await service.updateSettings(input({
            enabled: false,
            username: undefined,
            password: undefined,
            resendCooldownSeconds,
        }));

        assert.equal(result.status, 'saved');
        assert.equal(database.current().resendCooldownSeconds, resendCooldownSeconds);
        assert.equal(database.current().usernameCiphertext, 'encrypted-user');
        assert.equal(database.current().passwordCiphertext, 'encrypted-password');
        assert.equal(database.writes(), 1);
    }
});

test('SMTP resend cooldown rejects out-of-range and non-integer values', async () => {
    for (const resendCooldownSeconds of [29, 30.5, 601]) {
        const database = store(record());
        const service = new ConfiguredPlatformEmailService(
            database.adapter,
            secretBox,
            () => {
                throw new Error('transport should not be created');
            },
        );

        await assert.rejects(
            () => service.updateSettings(input({
                enabled: false,
                resendCooldownSeconds,
            })),
            /resend cooldown must be an integer from 30 to 600 seconds/,
        );
        assert.equal(database.writes(), 0);
    }
});

test('SMTP test send uses the complete draft without persisting it', async () => {
    const database = store(record());
    const events: string[] = [];
    const service = new ConfiguredPlatformEmailService(
        database.adapter,
        secretBox,
        () => ({
            async verify() {
                events.push('verify');
                return true;
            },
            async sendMail(message) {
                events.push(`send:${message.to}`);
                return {};
            },
            close() {
                events.push('close');
            },
        }),
        async () => ['93.184.216.34'],
    );

    const result = await service.sendTest({
        ...input({ resendCooldownSeconds: 30 }),
        recipient: 'ADMIN@example.com',
    });

    assert.deepEqual(result, { status: 'sent', recipient: 'admin@example.com' });
    assert.deepEqual(events, ['verify', 'send:admin@example.com', 'close']);
    assert.equal(database.current().resendCooldownSeconds, 60);
    assert.equal(database.writes(), 0);
});

test('worker SMTP delivery reads the active database configuration for every message', async () => {
    const database = store(record({ enabled: true }));
    const recipients: string[] = [];
    const service = new ConfiguredPlatformEmailService(
        database.adapter,
        secretBox,
        () => ({
            async verify() {
                return true;
            },
            async sendMail(message) {
                recipients.push(message.to);
                return { accepted: [message.to] };
            },
            close() {},
        }),
        async () => ['93.184.216.34'],
    );

    const result = await service.deliverVerification({
        purpose: 'registration',
        message: {
            email: 'producer@example.com',
            code: '123456',
            expiresInMinutes: 10,
        },
        deadlineAt: Date.now() + 1_000,
        signal: new AbortController().signal,
    });

    assert.equal(result.status, 'accepted');
    assert.deepEqual(recipients, ['producer@example.com']);
});

test('SMTP connections reject non-public and mixed DNS results', async () => {
    const addressSets = [
        ['127.0.0.1'],
        ['192.0.2.1'],
        ['198.51.100.1'],
        ['203.0.113.1'],
        ['2001:db8::1'],
        ['93.184.216.34', '10.0.0.1'],
    ];

    for (const addresses of addressSets) {
        const database = store(record());
        let transportCreated = false;
        const service = new ConfiguredPlatformEmailService(
            database.adapter,
            secretBox,
            () => {
                transportCreated = true;
                throw new Error('transport should not be created');
            },
            async () => addresses,
        );

        await assert.rejects(
            () => service.updateSettings(input()),
            /resolve only to public addresses/,
        );
        assert.equal(transportCreated, false);
        assert.equal(database.writes(), 0);
    }
});

test(
    'real PostgreSQL stores one SMTP configuration with optimistic concurrency',
    { skip: !postgresIntegrationEnabled() },
    async () => {
        const harness = await createPostgresTestHarness();
        onTestFinished(() => harness.close());
        const repository = new SqlPlatformEmailConfigurationRepository(
            harness.connection,
        );
        const initial = await repository.getPlatformEmailConfiguration();
        assert.equal(initial.enabled, false);
        assert.equal(initial.resendCooldownSeconds, 60);
        assert.equal(initial.updatedAt, 0);

        const saved = await repository.updatePlatformEmailConfiguration({
            ...record({
                enabled: true,
                host: 'smtp.qiye.163.com',
                usernameCiphertext: 'ciphertext-user',
                passwordCiphertext: 'ciphertext-password',
                fromAddress: 'mail@texasoct.tech',
                resendCooldownSeconds: 30,
                updatedAt: 1,
            }),
            expectedUpdatedAt: 0,
        });
        assert.equal(saved.status, 'saved');
        assert.equal(saved.configuration.host, 'smtp.qiye.163.com');
        assert.equal(saved.configuration.resendCooldownSeconds, 30);
        assert.equal(
            (await repository.getPlatformEmailConfiguration()).resendCooldownSeconds,
            30,
        );

        const conflict = await repository.updatePlatformEmailConfiguration({
            ...saved.configuration,
            enabled: false,
            updatedAt: 2,
            expectedUpdatedAt: 0,
        });
        assert.equal(conflict.status, 'conflict');
        assert.equal(conflict.configuration.enabled, true);
        assert.equal(conflict.configuration.resendCooldownSeconds, 30);
        assert.equal(conflict.configuration.updatedAt, 1);
    },
);
