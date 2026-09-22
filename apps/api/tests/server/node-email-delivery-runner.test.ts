import assert from 'node:assert/strict';
import { createConnection, type AddressInfo } from 'node:net';
import { describe, onTestFinished, test } from 'vitest';
import {
    shutdownEmailWorker,
    startEmailWorker,
} from '@/email-worker-main';
import type {
    PlatformEmailDeliveryClaim,
    PlatformEmailDeliveryWorkerStore,
    PlatformEmailJobPayloadCipher,
    PlatformEmailWorkerSender,
} from '@/ports/email-delivery';
import { NodeEmailDeliveryRunner } from '@/runtime/node-email-delivery-runner';

function deferred<T = void>() {
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

function claim(index: number): PlatformEmailDeliveryClaim {
    return {
        jobId: `job-${index}`,
        purpose: 'registration',
        deliveryToken: `delivery-${index}`,
        payloadCiphertext: `payload-${index}`,
        payloadVersion: 1,
        attempts: 1,
        deadlineAt: Date.now() + 10_000,
        leaseToken: `lease-${index}`,
        leaseExpiresAt: Date.now() + 1_000,
    };
}

const payloadCipher: PlatformEmailJobPayloadCipher = {
    encrypt() {
        throw new Error('encrypt is not used by the worker runner');
    },
    decrypt(identity) {
        const base = {
            normalizedEmail: `${identity.jobId}@example.com`,
            code: '123456',
        };
        return identity.purpose === 'registration'
            ? { ...base, purpose: 'registration', expiresInMinutes: 10 }
            : { ...base, purpose: 'password_reset', expiresInMinutes: 15 };
    },
};

function workerStore(
    overrides: Partial<PlatformEmailDeliveryWorkerStore> = {},
): PlatformEmailDeliveryWorkerStore {
    return {
        async claim() {
            return [];
        },
        async renewLease() {
            return true;
        },
        async complete() {
            return 'completed';
        },
        async recordFailure() {
            return 'failed';
        },
        async failExpired() {
            return 0;
        },
        async deleteTerminal() {
            return 0;
        },
        ...overrides,
    };
}

function acceptedSender(
    acceptedAt = Date.now(),
): PlatformEmailWorkerSender {
    return {
        async deliverVerification() {
            return { status: 'accepted', acceptedAt };
        },
    };
}

test.describe('email delivery runner', () => {
    test('polls immediately and enforces bounded concurrency', async () => {
        const releases = [deferred(), deferred()];
        let claimCalls = 0;
        let activeSends = 0;
        let maximumActiveSends = 0;
        const claimLimits: number[] = [];
        const completed: string[] = [];
        const store = workerStore({
            async claim(input) {
                claimCalls += 1;
                claimLimits.push(input.limit);
                return claimCalls === 1 ? [claim(1), claim(2)].slice(0, input.limit) : [];
            },
            async complete(input) {
                completed.push(input.jobId);
                return 'completed';
            },
        });
        const sender: PlatformEmailWorkerSender = {
            async deliverVerification(input) {
                const index = Number(input.message.email.match(/job-(\d+)/)?.[1]) - 1;
                activeSends += 1;
                maximumActiveSends = Math.max(maximumActiveSends, activeSends);
                await releases[index]?.promise;
                activeSends -= 1;
                return { status: 'accepted', acceptedAt: Date.now() };
            },
        };
        const runner = new NodeEmailDeliveryRunner(store, payloadCipher, sender, {
            concurrency: 2,
            pollIntervalMs: 60_000,
            leaseDurationMs: 100,
            leaseRenewalMs: 25,
            onEvent() {},
            onError(error) {
                assert.fail(`unexpected runner error: ${error.message}`);
            },
        });
        onTestFinished(() => runner.close());

        runner.start();
        await waitFor(() => runner.activeCount() === 2, 'initial claims did not start');
        assert.deepEqual(claimLimits, [2]);
        assert.equal(maximumActiveSends, 2);

        await runner.run();
        assert.equal(claimCalls, 1);

        releases.forEach((entry) => entry.resolve());
        await waitFor(() => completed.length === 2, 'claims did not complete');
        assert.equal(maximumActiveSends, 2);
    });

    test('claims with a fresh post-maintenance timestamp', async () => {
        let now = 1_000;
        let claimedAt: number | undefined;
        const runner = new NodeEmailDeliveryRunner(
            workerStore({
                async failExpired() {
                    now = 20_000;
                    return 0;
                },
                async claim(input) {
                    claimedAt = input.now;
                    return [];
                },
            }),
            payloadCipher,
            acceptedSender(),
            {
                now: () => now,
                leaseDurationMs: 15_000,
                leaseRenewalMs: 5_000,
                onEvent() {},
                onError(error) {
                    assert.fail(`unexpected runner error: ${error.message}`);
                },
            },
        );

        await runner.run();
        assert.equal(claimedAt, 20_000);
        await runner.close();
    });

    test('serializes lease renewals', async () => {
        const releaseSend = deferred();
        let claimed = false;
        let activeRenewals = 0;
        let maximumActiveRenewals = 0;
        let renewals = 0;
        const store = workerStore({
            async claim() {
                if (claimed) return [];
                claimed = true;
                return [claim(1)];
            },
            async renewLease() {
                activeRenewals += 1;
                maximumActiveRenewals = Math.max(maximumActiveRenewals, activeRenewals);
                renewals += 1;
                await new Promise((resolve) => setTimeout(resolve, 12));
                activeRenewals -= 1;
                return true;
            },
        });
        const runner = new NodeEmailDeliveryRunner(
            store,
            payloadCipher,
            {
                async deliverVerification() {
                    await releaseSend.promise;
                    return { status: 'accepted', acceptedAt: Date.now() };
                },
            },
            {
                pollIntervalMs: 60_000,
                leaseDurationMs: 100,
                leaseRenewalMs: 5,
                onEvent() {},
                onError(error) {
                    assert.fail(`unexpected runner error: ${error.message}`);
                },
            },
        );
        onTestFinished(() => runner.close());

        runner.start();
        await waitFor(() => renewals >= 3, 'lease was not renewed repeatedly');
        assert.equal(maximumActiveRenewals, 1);

        releaseSend.resolve();
        await waitFor(() => runner.activeCount() === 0, 'renewing claim did not settle');
        assert.equal(maximumActiveRenewals, 1);
    });

    describe('cancels a claim when lease renewal is lost', () => {
        const cases = [
            {
                name: 'false result',
                renew: async () => false,
                expectedErrors: 0,
            },
            {
                name: 'rejection',
                renew: async () => {
                    throw new Error('renewal failure with sensitive database details');
                },
                expectedErrors: 1,
            },
            {
                name: 'timeout',
                renew: () => new Promise<boolean>(() => undefined),
                expectedErrors: 0,
            },
        ];

        for (const entry of cases) {
            test(entry.name, async () => {
                let claimed = false;
                let renewalCalls = 0;
                let activeRenewals = 0;
                let maximumActiveRenewals = 0;
                let transitions = 0;
                let aborts = 0;
                const errors: Error[] = [];
                const events: Record<string, unknown>[] = [];
                const runner = new NodeEmailDeliveryRunner(
                    workerStore({
                        async claim() {
                            if (claimed) return [];
                            claimed = true;
                            return [claim(1)];
                        },
                        async renewLease() {
                            renewalCalls += 1;
                            activeRenewals += 1;
                            maximumActiveRenewals = Math.max(
                                maximumActiveRenewals,
                                activeRenewals,
                            );
                            try {
                                return await entry.renew();
                            } finally {
                                activeRenewals -= 1;
                            }
                        },
                        async complete() {
                            transitions += 1;
                            return 'completed';
                        },
                        async recordFailure() {
                            transitions += 1;
                            return 'failed';
                        },
                    }),
                    payloadCipher,
                    {
                        deliverVerification(input) {
                            return new Promise((resolve) => {
                                input.signal.addEventListener('abort', () => {
                                    aborts += 1;
                                    resolve({
                                        status: 'failed',
                                        category: 'unknown',
                                        transient: false,
                                        acceptanceAmbiguous: false,
                                    });
                                }, { once: true });
                            });
                        },
                    },
                    {
                        pollIntervalMs: 60_000,
                        leaseDurationMs: 100,
                        leaseRenewalMs: 5,
                        leaseRenewalTimeoutMs: 15,
                        onEvent(event) {
                            events.push(event);
                        },
                        onError(error) {
                            errors.push(error);
                        },
                    },
                );

                runner.start();
                await waitFor(() => aborts === 1, 'lease loss did not cancel the sender');
                await waitFor(() => runner.activeCount() === 0, 'lease-lost claim did not stop');

                assert.equal(renewalCalls, 1);
                assert.equal(maximumActiveRenewals, 1);
                assert.equal(aborts, 1);
                assert.equal(transitions, 0);
                assert.equal(errors.length, entry.expectedErrors);
                assert.equal(
                    errors.some((error) => error.message.includes('sensitive database details')),
                    false,
                );
                assert.ok(events.some(
                    (event) => event.event === 'platform_email_delivery_lease_lost',
                ));
                await runner.close();
            });
        }
    });

    test('contains claim failures and continues polling', async () => {
        let claimCalls = 0;
        let failures = 0;
        let completions = 0;
        const errors: Error[] = [];
        const store = workerStore({
            async claim() {
                claimCalls += 1;
                if (claimCalls === 1) {
                    throw new Error('claim failure with sensitive database details');
                }
                if (claimCalls === 2) return [claim(1)];
                if (claimCalls === 3) return [claim(2)];
                return [];
            },
            async recordFailure() {
                failures += 1;
                throw new Error('database transition failed');
            },
            async complete() {
                completions += 1;
                return 'completed';
            },
        });
        const sender: PlatformEmailWorkerSender = {
            async deliverVerification(input) {
                if (input.message.email.startsWith('job-1')) {
                    throw new Error('unexpected sender failure');
                }
                return { status: 'accepted', acceptedAt: Date.now() };
            },
        };
        const runner = new NodeEmailDeliveryRunner(store, payloadCipher, sender, {
            pollIntervalMs: 5,
            leaseDurationMs: 100,
            leaseRenewalMs: 25,
            onEvent() {},
            onError(error) {
                errors.push(error);
            },
        });
        onTestFinished(() => runner.close());

        runner.start();
        await waitFor(() => completions === 1, 'polling stopped after a failed claim');

        assert.ok(claimCalls >= 3);
        assert.equal(failures, 1);
        assert.ok(errors.some(
            (error) => error.message === 'Platform email worker poll failed',
        ));
        assert.ok(errors.some(
            (error) => error.message === 'Platform email worker sender failed',
        ));
        assert.ok(errors.some(
            (error) => error.message === 'Platform email worker claim processing failed',
        ));
        assert.equal(
            errors.some((error) => error.message.includes('sensitive database details')),
            false,
        );
    });

    test('recovers readiness after a failed PostgreSQL poll', async () => {
        let expiryCalls = 0;
        const errors: Error[] = [];
        const store = workerStore({
            async failExpired() {
                expiryCalls += 1;
                if (expiryCalls === 1) throw new Error('poll failed');
                return 0;
            },
        });
        const runner = new NodeEmailDeliveryRunner(
            store,
            payloadCipher,
            acceptedSender(),
            {
                pollIntervalMs: 5,
                readinessWindowMs: 50,
                onEvent() {},
                onError(error) {
                    errors.push(error);
                },
            },
        );
        onTestFinished(() => runner.close());

        runner.start();
        await waitFor(() => errors.length === 1, 'failed poll was not reported');
        assert.equal(runner.isReady(), false);
        await waitFor(() => runner.isReady(), 'runner did not become ready after a good poll');
        assert.ok(expiryCalls >= 2);
    });

    test('drains claims committed while shutdown begins', async () => {
        const claimStarted = deferred();
        const releaseClaims = deferred<PlatformEmailDeliveryClaim[]>();
        const completed: string[] = [];
        let claimCalls = 0;
        const runner = new NodeEmailDeliveryRunner(
            workerStore({
                async claim() {
                    claimCalls += 1;
                    claimStarted.resolve();
                    return releaseClaims.promise;
                },
                async complete(input) {
                    completed.push(input.jobId);
                    return 'completed';
                },
            }),
            payloadCipher,
            acceptedSender(),
            {
                concurrency: 2,
                pollIntervalMs: 60_000,
                shutdownTimeoutMs: 200,
                onEvent() {},
                onError(error) {
                    assert.fail(`unexpected runner error: ${error.message}`);
                },
            },
        );

        runner.start();
        await claimStarted.promise;
        const closing = runner.close();
        releaseClaims.resolve([
            claim(1),
            { ...claim(2), attempts: 2 },
        ]);
        await closing;

        assert.equal(claimCalls, 1);
        assert.deepEqual(completed.sort(), ['job-1', 'job-2']);
        assert.equal(runner.activeCount(), 0);
        assert.equal(runner.isLive(), false);
    });

    test('leaves delayed claims for lease recovery after shutdown times out', async () => {
        const claimStarted = deferred();
        const releaseClaims = deferred<PlatformEmailDeliveryClaim[]>();
        const claimReturned = deferred();
        const events: Record<string, unknown>[] = [];
        let sends = 0;
        let transitions = 0;
        const runner = new NodeEmailDeliveryRunner(
            workerStore({
                async claim() {
                    claimStarted.resolve();
                    const claims = await releaseClaims.promise;
                    claimReturned.resolve();
                    return claims;
                },
                async complete() {
                    transitions += 1;
                    return 'completed';
                },
                async recordFailure() {
                    transitions += 1;
                    return 'failed';
                },
            }),
            payloadCipher,
            {
                async deliverVerification() {
                    sends += 1;
                    return { status: 'accepted', acceptedAt: Date.now() };
                },
            },
            {
                pollIntervalMs: 60_000,
                shutdownTimeoutMs: 15,
                onEvent(event) {
                    events.push(event);
                },
                onError(error) {
                    assert.fail(`unexpected runner error: ${error.message}`);
                },
            },
        );

        runner.start();
        await claimStarted.promise;
        await runner.close();
        releaseClaims.resolve([claim(1)]);
        await claimReturned.promise;
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(sends, 0);
        assert.equal(transitions, 0);
        assert.equal(runner.activeCount(), 0);
        assert.equal(runner.isLive(), false);
        assert.ok(events.some(
            (event) => event.event === 'platform_email_delivery_lease_lost',
        ));
    });

    test('waits for graceful work and bounds stalled shutdown', async () => {
        const gracefulRelease = deferred();
        let gracefulClaimed = false;
        const gracefulEvents: Record<string, unknown>[] = [];
        const graceful = new NodeEmailDeliveryRunner(
            workerStore({
                async claim() {
                    if (gracefulClaimed) return [];
                    gracefulClaimed = true;
                    return [claim(1)];
                },
            }),
            payloadCipher,
            {
                async deliverVerification() {
                    await gracefulRelease.promise;
                    return { status: 'accepted', acceptedAt: Date.now() };
                },
            },
            {
                pollIntervalMs: 60_000,
                leaseDurationMs: 100,
                leaseRenewalMs: 20,
                shutdownTimeoutMs: 200,
                onEvent(event) {
                    gracefulEvents.push(event);
                },
                onError(error) {
                    assert.fail(`unexpected runner error: ${error.message}`);
                },
            },
        );
        graceful.start();
        await waitFor(() => graceful.activeCount() === 1, 'graceful claim did not start');
        let gracefulClosed = false;
        const gracefulClosing = graceful.close().then(() => {
            gracefulClosed = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(gracefulClosed, false);
        assert.equal(graceful.isReady(), false);
        assert.equal(graceful.isLive(), true);
        gracefulRelease.resolve();
        await gracefulClosing;
        assert.equal(graceful.isLive(), false);
        assert.equal(
            gracefulEvents.some((event) => event.event === 'platform_email_worker_shutdown_timed_out'),
            false,
        );

        const stalledEvents: Record<string, unknown>[] = [];
        let renewalCalls = 0;
        let stalledClaimed = false;
        const stalled = new NodeEmailDeliveryRunner(
            workerStore({
                async claim() {
                    if (stalledClaimed) return [];
                    stalledClaimed = true;
                    return [claim(2)];
                },
                async renewLease() {
                    renewalCalls += 1;
                    return true;
                },
            }),
            payloadCipher,
            {
                async deliverVerification() {
                    return new Promise(() => undefined);
                },
            },
            {
                pollIntervalMs: 60_000,
                leaseDurationMs: 50,
                leaseRenewalMs: 5,
                shutdownTimeoutMs: 25,
                onEvent(event) {
                    stalledEvents.push(event);
                },
                onError() {},
            },
        );
        stalled.start();
        await waitFor(() => stalled.activeCount() === 1, 'stalled claim did not start');
        const closeStartedAt = Date.now();
        await stalled.close();
        const closeDuration = Date.now() - closeStartedAt;
        assert.ok(closeDuration >= 20, `shutdown returned too early: ${closeDuration}ms`);
        assert.ok(closeDuration < 150, `shutdown exceeded its bound: ${closeDuration}ms`);
        assert.equal(stalled.isLive(), false);
        assert.equal(stalled.isReady(), false);
        assert.ok(
            stalledEvents.some((event) => event.event === 'platform_email_worker_shutdown_timed_out'),
        );
        const renewalsAtClose = renewalCalls;
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(renewalCalls, renewalsAtClose);
    });

    test('readiness expires and refreshes after a successful poll', async () => {
        let now = 1_000;
        const runner = new NodeEmailDeliveryRunner(
            workerStore(),
            payloadCipher,
            acceptedSender(),
            {
                now: () => now,
                pollIntervalMs: 60_000,
                readinessWindowMs: 50,
                onEvent() {},
                onError(error) {
                    assert.fail(`unexpected runner error: ${error.message}`);
                },
            },
        );

        assert.equal(runner.isLive(), false);
        assert.equal(runner.isReady(), false);
        runner.start();
        await waitFor(() => runner.isReady(), 'initial poll did not make the runner ready');
        assert.equal(runner.isLive(), true);

        now = 1_051;
        assert.equal(runner.isReady(), false);
        await runner.run();
        assert.equal(runner.isReady(), true);

        await runner.close();
        assert.equal(runner.isReady(), false);
        assert.equal(runner.isLive(), false);
    });
});

test.describe('email worker', () => {
    test('shutdownEmailWorker bounds stalled service and active health-server close', async () => {
        const stalledClose = deferred();
        let closeDeadlineAt: number | undefined;
        const runner = new NodeEmailDeliveryRunner(
            workerStore(),
            payloadCipher,
            acceptedSender(),
            {
                pollIntervalMs: 60_000,
                shutdownTimeoutMs: 200,
                onEvent() {},
                onError(error) {
                    assert.fail(`unexpected runner error: ${error.message}`);
                },
            },
        );
        const worker = await startEmailWorker({
            host: '127.0.0.1',
            port: 0,
            shutdownTimeoutMs: 30,
            createServices: async () => ({
                runner,
                async close(deadlineAt) {
                    closeDeadlineAt = deadlineAt;
                    await runner.close(deadlineAt);
                    await stalledClose.promise;
                },
            }),
        });
        const port = (worker.server.address() as AddressInfo).port;
        const socket = createConnection({ host: '127.0.0.1', port });
        try {
            await new Promise<void>((resolve, reject) => {
                socket.once('connect', resolve);
                socket.once('error', reject);
            });
            socket.write('GET /health/live HTTP/1.1\r\nHost: localhost\r\n');
            await waitFor(() => runner.isReady(), 'runner did not become ready');

            const startedAt = Date.now();
            await shutdownEmailWorker(worker);
            const duration = Date.now() - startedAt;

            assert.ok(duration >= 20, `shutdown returned too early: ${duration}ms`);
            assert.ok(duration < 150, `shutdown exceeded its bound: ${duration}ms`);
            assert.ok(closeDeadlineAt !== undefined && closeDeadlineAt > startedAt);
            assert.equal(worker.server.listening, false);
            assert.equal(runner.isLive(), false);
            await waitFor(() => socket.destroyed, 'active health connection was not closed');
        } finally {
            socket.destroy();
            await runner.close();
        }
    });

    test('health follows runner readiness, stopping, and liveness', async () => {
        const releaseSend = deferred();
        let claimed = false;
        const runner = new NodeEmailDeliveryRunner(
            workerStore({
                async claim() {
                    if (claimed) return [];
                    claimed = true;
                    return [claim(1)];
                },
            }),
            payloadCipher,
            {
                async deliverVerification() {
                    await releaseSend.promise;
                    return { status: 'accepted', acceptedAt: Date.now() };
                },
            },
            {
                pollIntervalMs: 60_000,
                leaseDurationMs: 100,
                leaseRenewalMs: 20,
                shutdownTimeoutMs: 200,
                onEvent() {},
                onError(error) {
                    assert.fail(`unexpected runner error: ${error.message}`);
                },
            },
        );
        const worker = await startEmailWorker({
            host: '127.0.0.1',
            port: 0,
            createServices: async () => ({
                runner,
                close: () => runner.close(),
            }),
        });
        onTestFinished(() => shutdownEmailWorker(worker));
        const port = (worker.server.address() as AddressInfo).port;
        const origin = `http://127.0.0.1:${port}`;

        await waitFor(() => runner.isReady(), 'health runner did not become ready');
        const live = await fetch(`${origin}/health/live`);
        assert.equal(live.status, 200);
        assert.equal(await live.text(), 'live\n');
        const ready = await fetch(`${origin}/health/ready`);
        assert.equal(ready.status, 200);
        assert.equal(await ready.text(), 'ready\n');

        const closing = worker.services.close();
        const stoppingReady = await fetch(`${origin}/health/ready`);
        assert.equal(stoppingReady.status, 503);
        const stoppingLive = await fetch(`${origin}/health/live`);
        assert.equal(stoppingLive.status, 200);

        releaseSend.resolve();
        await closing;
        const closedLive = await fetch(`${origin}/health/live`);
        assert.equal(closedLive.status, 503);
        assert.equal(await closedLive.text(), 'not live\n');
    });
});
