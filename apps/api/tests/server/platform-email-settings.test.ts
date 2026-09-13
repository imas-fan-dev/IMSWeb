import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfiguredPlatformEmailService } from '@/infra/email/smtp/platform-email-service';
import { PlatformEmailSecretCipher } from '@/infra/email/smtp/platform-email-secrets';
import { SqlPlatformEmailConfigurationRepository } from '@/infra/db/repositories/platform-email-configuration-repository';
import {
    createPostgresTestHarness,
    postgresIntegrationEnabled,
} from '../integration/postgres-harness';
import type {
    PlatformEmailConfigurationRecord,
    PlatformEmailConfigurationStore,
} from '@/ports/email';

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
    assert.equal('password' in settings, false);
    assert.equal('username' in settings, false);
});

test('stale SMTP writes return the current settings without opening a connection', async () => {
    const database = store(record({ updatedAt: 2_000 }));
    const service = new ConfiguredPlatformEmailService(
        database.adapter,
        secretBox,
        () => {
            throw new Error('transport should not be created');
        },
    );

    const result = await service.updateSettings(input());

    assert.equal(result.status, 'conflict');
    assert.equal(result.settings.updatedAt, 2_000);
    assert.equal(database.writes(), 0);
});

test('SMTP delivery reads the active database configuration for every message', async () => {
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
                return {};
            },
            close() {},
        }),
        async () => ['93.184.216.34'],
    );

    assert.equal(await service.isAvailable(), true);
    await service.sendRegistrationVerification({
        email: 'producer@example.com',
        code: '123456',
        expiresInMinutes: 10,
    });

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
    {
        skip:
            !postgresIntegrationEnabled() &&
            'set IMS_TEST_POSTGRES_ADMIN_URL to a local PostgreSQL admin database',
    },
    async (t) => {
        const harness = await createPostgresTestHarness();
        t.after(() => harness.close());
        const repository = new SqlPlatformEmailConfigurationRepository(
            harness.connection,
        );
        const initial = await repository.getPlatformEmailConfiguration();
        assert.equal(initial.enabled, false);
        assert.equal(initial.updatedAt, 0);

        const saved = await repository.updatePlatformEmailConfiguration({
            ...record({
                enabled: true,
                host: 'smtp.qiye.163.com',
                usernameCiphertext: 'ciphertext-user',
                passwordCiphertext: 'ciphertext-password',
                fromAddress: 'mail@texasoct.tech',
                updatedAt: 1,
            }),
            expectedUpdatedAt: 0,
        });
        assert.equal(saved.status, 'saved');
        assert.equal(saved.configuration.host, 'smtp.qiye.163.com');

        const conflict = await repository.updatePlatformEmailConfiguration({
            ...saved.configuration,
            enabled: false,
            updatedAt: 2,
            expectedUpdatedAt: 0,
        });
        assert.equal(conflict.status, 'conflict');
        assert.equal(conflict.configuration.enabled, true);
        assert.equal(conflict.configuration.updatedAt, 1);
    },
);
