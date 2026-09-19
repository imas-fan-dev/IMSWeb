import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ConfiguredPlatformEmailService } from '@/infra/email/smtp/platform-email-service';
import type {
    PlatformEmailConfigurationRecord,
    PlatformEmailConfigurationStore,
} from '@/ports/email';

type TransportFactory = NonNullable<
    ConstructorParameters<typeof ConfiguredPlatformEmailService>[2]
>;
type HostResolver = NonNullable<
    ConstructorParameters<typeof ConfiguredPlatformEmailService>[3]
>;

const recipient = 'producer@example.com';

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((settle, fail) => {
        resolve = settle;
        reject = fail;
    });
    return { promise, resolve, reject };
}

async function waitFor(
    predicate: () => boolean,
    message: string,
    timeoutMs = 1_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() >= deadline) assert.fail(message);
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
}

function configuration(
    overrides: Partial<PlatformEmailConfigurationRecord> = {},
): PlatformEmailConfigurationRecord {
    return {
        enabled: true,
        host: 'smtp.example.com',
        port: 465,
        security: 'tls',
        usernameCiphertext: 'encrypted-user',
        passwordCiphertext: 'encrypted-password',
        fromAddress: 'mail@example.com',
        fromName: 'IMSWeb',
        resendCooldownSeconds: 60,
        updatedAt: 1,
        ...overrides,
    };
}

const secretBox = {
    encrypt(value: string) {
        return `encrypted:${value}`;
    },
    decrypt(value: string) {
        if (value === 'encrypted-user') return 'mail@example.com';
        if (value === 'encrypted-password') return 'smtp-password';
        if (value.startsWith('encrypted:')) return value.slice('encrypted:'.length);
        throw new Error('invalid ciphertext');
    },
};

function createService(options: {
    getConfiguration?: () => Promise<PlatformEmailConfigurationRecord>;
    transportFactory?: TransportFactory;
    hostResolver?: HostResolver;
} = {}): ConfiguredPlatformEmailService {
    const store: PlatformEmailConfigurationStore = {
        getPlatformEmailConfiguration:
            options.getConfiguration ?? (async () => configuration()),
        async updatePlatformEmailConfiguration(input) {
            return { status: 'saved', configuration: input };
        },
    };
    return new ConfiguredPlatformEmailService(
        store,
        secretBox,
        options.transportFactory ?? (() => ({
            async verify() {
                return true;
            },
            async sendMail() {
                return { accepted: [recipient] };
            },
            close() {},
        })),
        options.hostResolver ?? (async () => ['93.184.216.34']),
    );
}

function deliver(
    service: ConfiguredPlatformEmailService,
    deadlineAt = Date.now() + 1_000,
    signal = new AbortController().signal,
) {
    return service.deliverVerification({
        purpose: 'registration',
        message: {
            email: recipient,
            code: '123456',
            expiresInMinutes: 10,
        },
        deadlineAt,
        signal,
    });
}

test('worker SMTP delivery classifies only bounded failure evidence', async () => {
    const cases = [
        {
            error: { code: 'EAUTH', responseCode: 454, response: 'raw temporary auth response' },
            expected: {
                status: 'failed',
                category: 'smtp_transient',
                transient: true,
                acceptanceAmbiguous: false,
            },
        },
        {
            error: { code: 'EAUTH', responseCode: 535, response: 'raw auth response' },
            expected: {
                status: 'failed',
                category: 'authentication',
                transient: false,
                acceptanceAmbiguous: false,
            },
        },
        {
            error: { code: 'EMESSAGE', responseCode: 550, response: 'raw SMTP response' },
            expected: {
                status: 'failed',
                category: 'smtp_permanent',
                transient: false,
                acceptanceAmbiguous: false,
            },
        },
        {
            error: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' },
            expected: {
                status: 'failed',
                category: 'tls',
                transient: false,
                acceptanceAmbiguous: false,
            },
        },
        {
            error: { code: 'EPIPE', command: 'DATA', response: 'possibly accepted' },
            expected: {
                status: 'failed',
                category: 'network',
                transient: true,
                acceptanceAmbiguous: true,
            },
        },
    ] as const;

    for (const entry of cases) {
        const service = createService({
            transportFactory: () => ({
                async verify() {
                    return true;
                },
                async sendMail() {
                    throw entry.error;
                },
                close() {},
            }),
        });

        const result = await deliver(service);

        assert.deepEqual(result, entry.expected);
        assert.deepEqual(Object.keys(result).sort(), [
            'acceptanceAmbiguous',
            'category',
            'status',
            'transient',
        ]);
        assert.equal('response' in result, false);
    }
});

test('worker SMTP delivery contains unexpected factory, DNS, and configuration-store errors', async () => {
    const factoryFailure = await deliver(createService({
        transportFactory: () => {
            throw new Error('factory returned raw provider output');
        },
    }));
    assert.deepEqual(factoryFailure, {
        status: 'failed',
        category: 'unknown',
        transient: false,
        acceptanceAmbiguous: false,
    });

    const dnsFailure = await deliver(createService({
        hostResolver: async () => {
            throw { code: 'EAI_AGAIN', hostname: 'smtp.example.com' };
        },
    }));
    assert.deepEqual(dnsFailure, {
        status: 'failed',
        category: 'dns',
        transient: true,
        acceptanceAmbiguous: false,
    });

    const storeFailure = await deliver(createService({
        getConfiguration: async () => {
            throw new Error('database unavailable');
        },
    }));
    assert.deepEqual(storeFailure, {
        status: 'failed',
        category: 'configuration',
        transient: false,
        acceptanceAmbiguous: false,
    });
});

test('worker SMTP delivery rejects IPv4 and IPv6 non-public DNS answers', async () => {
    const nonPublicAddresses = [
        '0.0.0.1',
        '10.0.0.1',
        '100.64.0.1',
        '127.0.0.1',
        '169.254.1.1',
        '172.16.0.1',
        '192.0.0.1',
        '192.0.2.1',
        '192.88.99.1',
        '192.168.0.1',
        '198.18.0.1',
        '198.51.100.1',
        '203.0.113.1',
        '224.0.0.1',
        '240.0.0.1',
        '::2',
        '::ffff:127.0.0.1',
        '64:ff9b::1',
        '64:ff9b:1::1',
        '100::1',
        '2001::1',
        '2001:0:ffff::1',
        '2001:100::1',
        '2001:1ff::1',
        '2001:2::1',
        '2001:10::1',
        '2001:20::1',
        '2001:db8::1',
        '2002::1',
        '3fff::1',
        '4000::1',
        '5f00::1',
        'fc00::1',
        'fe80::1',
        'ff00::1',
    ];

    for (const address of nonPublicAddresses) {
        let transportCreated = false;
        const result = await deliver(createService({
            hostResolver: async () => [address],
            transportFactory: () => {
                transportCreated = true;
                throw new Error('transport should not be created');
            },
        }));
        assert.deepEqual(result, {
            status: 'failed',
            category: 'dns_policy',
            transient: false,
            acceptanceAmbiguous: false,
        }, address);
        assert.equal(transportCreated, false, address);
    }

    const mixed = await deliver(createService({
        hostResolver: async () => ['2606:4700:4700::1111', '10.0.0.1'],
    }));
    assert.equal(mixed.status, 'failed');
    if (mixed.status === 'failed') assert.equal(mixed.category, 'dns_policy');
});

test('worker SMTP delivery pins a public DNS address while retaining the TLS hostname', async () => {
    let observed: Parameters<TransportFactory>[0] | undefined;
    const service = createService({
        hostResolver: async () => ['2606:4700:4700::1111'],
        transportFactory: (config) => {
            observed = config;
            return {
                async verify() {
                    return true;
                },
                async sendMail() {
                    return { accepted: [{ address: 'PRODUCER@example.com' }] };
                },
                close() {},
            };
        },
    });

    const before = Date.now();
    const result = await deliver(service);

    assert.equal(result.status, 'accepted');
    if (result.status === 'accepted') assert.ok(result.acceptedAt >= before);
    assert.equal(observed?.host, 'smtp.example.com');
    assert.equal(observed?.resolvedAddress, '2606:4700:4700::1111');
    assert.equal(observed?.security, 'tls');
});

test('worker SMTP delivery enforces one absolute deadline across database, DNS, transport, and send', async () => {
    const never = new Promise<never>(() => undefined);
    const databaseDeadline = await deliver(createService({
        getConfiguration: () => never,
    }), Date.now() + 15);
    assert.deepEqual(databaseDeadline, {
        status: 'failed',
        category: 'deadline',
        transient: false,
        acceptanceAmbiguous: false,
    });

    const dnsDeadline = await deliver(createService({
        hostResolver: () => never,
    }), Date.now() + 15);
    assert.deepEqual(dnsDeadline, {
        status: 'failed',
        category: 'deadline',
        transient: false,
        acceptanceAmbiguous: false,
    });

    let slowFactoryClosed = 0;
    const transportDeadline = await deliver(createService({
        transportFactory: () => {
            const blockedUntil = Date.now() + 15;
            while (Date.now() < blockedUntil) {
                // A synchronous factory cannot be interrupted, so the deadline is checked again.
            }
            return {
                async verify() {
                    return true;
                },
                async sendMail() {
                    return { accepted: [recipient] };
                },
                close() {
                    slowFactoryClosed += 1;
                },
            };
        },
    }), Date.now() + 5);
    assert.deepEqual(transportDeadline, {
        status: 'failed',
        category: 'deadline',
        transient: false,
        acceptanceAmbiguous: false,
    });
    assert.equal(slowFactoryClosed, 1);

    let sendClosed = 0;
    const sendDeadline = await deliver(createService({
        transportFactory: () => ({
            async verify() {
                return true;
            },
            sendMail() {
                return never;
            },
            close() {
                sendClosed += 1;
            },
        }),
    }), Date.now() + 15);
    assert.deepEqual(sendDeadline, {
        status: 'failed',
        category: 'deadline',
        transient: false,
        acceptanceAmbiguous: true,
    });
    assert.ok(sendClosed >= 1);
});

test('worker SMTP delivery rejects acceptance resolved after the absolute deadline', async () => {
    let transportClosed = 0;
    const result = await deliver(createService({
        transportFactory: () => ({
            async verify() {
                return true;
            },
            async sendMail() {
                const blockedUntil = Date.now() + 20;
                while (Date.now() < blockedUntil) {
                    // A synchronous provider callback cannot be interrupted by a timer.
                }
                return { accepted: [recipient] };
            },
            close() {
                transportClosed += 1;
            },
        }),
    }), Date.now() + 5);

    assert.deepEqual(result, {
        status: 'failed',
        category: 'deadline',
        transient: false,
        acceptanceAmbiguous: true,
    });
    assert.equal(transportClosed, 1);
});

test('worker SMTP delivery contains a rejection that arrives after deadline closure', async () => {
    const send = deferred<never>();
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => unhandled.push(error);
    process.on('unhandledRejection', onUnhandled);
    try {
        const result = await deliver(createService({
            transportFactory: () => ({
                async verify() {
                    return true;
                },
                sendMail() {
                    return send.promise;
                },
                close() {},
            }),
        }), Date.now() + 10);
        assert.deepEqual(result, {
            status: 'failed',
            category: 'deadline',
            transient: false,
            acceptanceAmbiguous: true,
        });

        send.reject(new Error('late provider response with sensitive text'));
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(unhandled, []);
    } finally {
        process.off('unhandledRejection', onUnhandled);
    }
});

test('worker SMTP delivery closes the transport when its abort signal fires', async () => {
    const controller = new AbortController();
    let transportClosed = 0;
    let sendStarted = false;
    const delivery = deliver(createService({
        transportFactory: () => ({
            async verify() {
                return true;
            },
            sendMail() {
                sendStarted = true;
                return new Promise(() => undefined);
            },
            close() {
                transportClosed += 1;
            },
        }),
    }), Date.now() + 1_000, controller.signal);
    await waitFor(() => sendStarted, 'SMTP send did not start before cancellation');

    controller.abort();

    assert.deepEqual(await delivery, {
        status: 'failed',
        category: 'unknown',
        transient: false,
        acceptanceAmbiguous: false,
    });
    assert.equal(transportClosed, 1);
});

test('worker SMTP delivery requires explicit acceptance of the intended recipient', async () => {
    for (const accepted of [undefined, [], ['other@example.com']]) {
        const result = await deliver(createService({
            transportFactory: () => ({
                async verify() {
                    return true;
                },
                async sendMail() {
                    return { accepted };
                },
                close() {},
            }),
        }));
        assert.deepEqual(result, {
            status: 'failed',
            category: 'recipient_rejected',
            transient: false,
            acceptanceAmbiguous: false,
        });
    }
});
