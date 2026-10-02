import type {
    PlatformEmailDeliveryAttemptResult,
    PlatformEmailDeliveryClaim,
    PlatformEmailDeliveryWorkerStore,
    PlatformEmailJobPayloadCipher,
    PlatformEmailWorkerSender,
} from '@/ports/email-delivery';

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_LEASE_DURATION_MS = 15_000;
const DEFAULT_LEASE_RENEWAL_MS = 5_000;
const DEFAULT_READINESS_WINDOW_MS = 30_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 60_000;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_SWEEP_BATCH_SIZE = 100;

export interface NodeEmailDeliveryRunnerOptions {
    now?: () => number;
    pollIntervalMs?: number;
    concurrency?: number;
    leaseDurationMs?: number;
    leaseRenewalMs?: number;
    leaseRenewalTimeoutMs?: number;
    readinessWindowMs?: number;
    shutdownTimeoutMs?: number;
    retentionMs?: number;
    sweepIntervalMs?: number;
    sweepBatchSize?: number;
    onEvent?: (event: Record<string, unknown>) => void;
    onError?: (error: Error) => void;
}

interface ActiveClaimControl {
    abort(): void;
}

function writeEvent(event: Record<string, unknown>): void {
    process.stdout.write(`${JSON.stringify(event)}\n`);
}

function writeError(_error: Error): void {
    process.stderr.write(
        `${JSON.stringify({ event: 'platform_email_worker_operation_failed' })}\n`,
    );
}

function normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

// pi-lens-ignore: large-class -- Polling, lease renewal, and shutdown share one lifecycle invariant.
export class NodeEmailDeliveryRunner {
    private readonly now: () => number;
    private readonly pollIntervalMs: number;
    private readonly concurrency: number;
    private readonly leaseDurationMs: number;
    private readonly leaseRenewalMs: number;
    private readonly leaseRenewalTimeoutMs: number;
    private readonly readinessWindowMs: number;
    private readonly shutdownTimeoutMs: number;
    private readonly retentionMs: number;
    private readonly sweepIntervalMs: number;
    private readonly sweepBatchSize: number;
    private readonly onEvent: (event: Record<string, unknown>) => void;
    private readonly onError: (error: Error) => void;
    private readonly active = new Map<Promise<void>, ActiveClaimControl>();
    private timer?: NodeJS.Timeout;
    private polling?: Promise<void>;
    private closing?: Promise<void>;
    private started = false;
    private stopping = false;
    private closed = false;
    private lastSuccessfulPollAt?: number;
    private nextSweepAt = 0;

    constructor(
        private readonly store: PlatformEmailDeliveryWorkerStore,
        private readonly payloadCipher: PlatformEmailJobPayloadCipher,
        private readonly sender: PlatformEmailWorkerSender,
        options: NodeEmailDeliveryRunnerOptions = {},
    ) {
        this.now = options.now ?? Date.now;
        this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
        this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
        this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
        this.leaseRenewalMs = options.leaseRenewalMs ?? DEFAULT_LEASE_RENEWAL_MS;
        this.leaseRenewalTimeoutMs = options.leaseRenewalTimeoutMs ?? Math.max(
            1,
            this.leaseDurationMs - this.leaseRenewalMs,
        );
        this.readinessWindowMs = options.readinessWindowMs ?? DEFAULT_READINESS_WINDOW_MS;
        this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
        this.retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
        this.sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
        this.sweepBatchSize = options.sweepBatchSize ?? DEFAULT_SWEEP_BATCH_SIZE;
        this.onEvent = options.onEvent ?? writeEvent;
        this.onError = options.onError ?? writeError;
        for (const [name, value] of [
            ['poll interval', this.pollIntervalMs],
            ['concurrency', this.concurrency],
            ['lease duration', this.leaseDurationMs],
            ['lease renewal', this.leaseRenewalMs],
            ['lease renewal timeout', this.leaseRenewalTimeoutMs],
            ['readiness window', this.readinessWindowMs],
            ['shutdown timeout', this.shutdownTimeoutMs],
            ['retention', this.retentionMs],
            ['sweep interval', this.sweepIntervalMs],
            ['sweep batch size', this.sweepBatchSize],
        ] as const) {
            if (!Number.isInteger(value) || value < 1) {
                throw new Error(`Invalid platform email worker ${name}`);
            }
        }
        if (this.leaseRenewalMs >= this.leaseDurationMs) {
            throw new Error('Platform email lease renewal must be shorter than the lease');
        }
        if (this.leaseRenewalTimeoutMs >= this.leaseDurationMs) {
            throw new Error('Platform email lease renewal timeout must be shorter than the lease');
        }
    }

    start(): void {
        if (this.stopping) throw new Error('Platform email worker is closed');
        if (this.started) return;
        this.started = true;
        void this.run();
    }

    run(): Promise<void> {
        if (this.stopping) return Promise.resolve();
        if (this.polling) return this.polling;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        const polling = this.poll()
            .catch((error) => {
                this.reportError(error, 'poll');
            })
            .finally(() => {
                if (this.polling === polling) this.polling = undefined;
                if (this.started && !this.stopping) this.schedule();
            });
        this.polling = polling;
        return polling;
    }

    close(deadlineAt = Date.now() + this.shutdownTimeoutMs): Promise<void> {
        if (this.closing) return this.closing;
        this.stopping = true;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        this.closing = this.closeWithinTimeout(
            Math.min(deadlineAt, Date.now() + this.shutdownTimeoutMs),
        );
        return this.closing;
    }

    isLive(): boolean {
        return this.started && !this.closed;
    }

    isReady(at = this.now()): boolean {
        return Boolean(
            this.started &&
            !this.stopping &&
            !this.closed &&
            this.lastSuccessfulPollAt !== undefined &&
            at - this.lastSuccessfulPollAt <= this.readinessWindowMs,
        );
    }

    isStopping(): boolean {
        return this.stopping;
    }

    activeCount(): number {
        return this.active.size;
    }

    private async closeWithinTimeout(deadlineAt: number): Promise<void> {
        let timeout: NodeJS.Timeout | undefined;
        const timedOut = new Promise<'timeout'>((resolve) => {
            timeout = setTimeout(
                () => resolve('timeout'),
                Math.max(0, deadlineAt - Date.now()),
            );
        });
        const outcome = await Promise.race([
            this.waitForWorkToSettle().then(() => 'settled' as const),
            timedOut,
        ]);
        if (timeout) clearTimeout(timeout);
        if (outcome === 'timeout') {
            for (const control of this.active.values()) {
                control.abort();
            }
            this.emitEvent({ event: 'platform_email_worker_shutdown_timed_out' });
        }
        this.closed = true;
    }

    private async waitForWorkToSettle(): Promise<void> {
        await (this.polling ?? Promise.resolve());
        while (this.active.size > 0) {
            await Promise.allSettled([...this.active.keys()]);
        }
    }

    private schedule(): void {
        if (this.timer || this.stopping) return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.run();
        }, this.pollIntervalMs);
        this.timer.unref();
    }

    private async poll(): Promise<void> {
        const maintenanceNow = this.now();
        await this.store.failExpired(maintenanceNow, this.sweepBatchSize);
        if (maintenanceNow >= this.nextSweepAt) {
            await this.store.deleteTerminal(
                maintenanceNow - this.retentionMs,
                this.sweepBatchSize,
            );
            this.nextSweepAt = maintenanceNow + this.sweepIntervalMs;
        }
        const available = this.concurrency - this.active.size;
        if (available > 0 && !this.stopping) {
            const claims = await this.store.claim({
                now: this.now(),
                limit: available,
                leaseDurationMs: this.leaseDurationMs,
            });
            if (this.closed) {
                for (const claim of claims) {
                    this.emitEvent({
                        event: 'platform_email_delivery_lease_lost',
                        jobId: claim.jobId,
                        purpose: claim.purpose,
                        attempt: claim.attempts,
                    });
                }
                return;
            }
            for (const claim of claims) this.launch(claim);
        }
        this.lastSuccessfulPollAt = this.now();
    }

    private launch(claim: PlatformEmailDeliveryClaim): void {
        this.emitEvent({
            event: 'platform_email_delivery_claimed',
            jobId: claim.jobId,
            purpose: claim.purpose,
            attempt: claim.attempts,
        });
        const control: ActiveClaimControl = {
            abort() {},
        };
        const running = this.processClaim(claim, control)
            .catch((error) => {
                this.reportError(error, 'claim processing');
            })
            .finally(() => {
                this.active.delete(running);
            });
        this.active.set(running, control);
    }

    private async processClaim(
        claim: PlatformEmailDeliveryClaim,
        control: ActiveClaimControl,
    ): Promise<void> {
        const startedAt = this.now();
        const abortController = new AbortController();
        let leaseLost = false;
        let leaseLossReported = false;
        let renewalStopped = false;
        let renewalTimer: NodeJS.Timeout | undefined;
        let renewalInFlight: Promise<void> | undefined;

        const stopLeaseRenewal = (): void => {
            renewalStopped = true;
            if (renewalTimer) {
                clearTimeout(renewalTimer);
                renewalTimer = undefined;
            }
        };
        const markLeaseLost = (): void => {
            if (leaseLost) return;
            leaseLost = true;
            stopLeaseRenewal();
            abortController.abort();
        };
        const waitForLeaseRenewal = async (): Promise<void> => {
            stopLeaseRenewal();
            await (renewalInFlight ?? Promise.resolve());
        };
        const scheduleRenewal = (): void => {
            if (renewalStopped || renewalTimer || renewalInFlight) return;
            renewalTimer = setTimeout(() => {
                renewalTimer = undefined;
                renewalInFlight = this.renewLeaseWithinTimeout({
                    jobId: claim.jobId,
                    leaseToken: claim.leaseToken,
                    now: this.now(),
                    leaseDurationMs: this.leaseDurationMs,
                })
                    .then((renewed) => {
                        if (!renewed) markLeaseLost();
                    })
                    .finally(() => {
                        renewalInFlight = undefined;
                        scheduleRenewal();
                    });
            }, this.leaseRenewalMs);
            renewalTimer.unref();
        };
        control.abort = markLeaseLost;
        scheduleRenewal();

        try {
            let payload;
            try {
                payload = this.payloadCipher.decrypt(
                    {
                        jobId: claim.jobId,
                        purpose: claim.purpose,
                        deliveryToken: claim.deliveryToken,
                        payloadVersion: claim.payloadVersion,
                    },
                    claim.payloadCiphertext,
                );
            } catch {
                await waitForLeaseRenewal();
                if (leaseLost) return;
                const result = await this.store.recordFailure({
                    jobId: claim.jobId,
                    leaseToken: claim.leaseToken,
                    failedAt: this.now(),
                    category: 'payload',
                    transient: false,
                    acceptanceAmbiguous: false,
                });
                leaseLossReported = this.reportFailure(
                    claim,
                    result,
                    'payload',
                    false,
                    startedAt,
                );
                return;
            }

            let delivery: PlatformEmailDeliveryAttemptResult;
            try {
                delivery = await this.sender.deliverVerification({
                    purpose: claim.purpose,
                    message: {
                        email: payload.normalizedEmail,
                        code: payload.code,
                        expiresInMinutes: payload.expiresInMinutes,
                    },
                    deadlineAt: claim.deadlineAt,
                    signal: abortController.signal,
                });
            } catch (error) {
                this.reportError(error, 'sender');
                delivery = {
                    status: 'failed',
                    category: 'unknown',
                    transient: false,
                    acceptanceAmbiguous: false,
                };
            }
            await waitForLeaseRenewal();
            if (leaseLost) return;
            if (delivery.status === 'accepted') {
                const result = await this.store.complete({
                    jobId: claim.jobId,
                    leaseToken: claim.leaseToken,
                    normalizedEmail: payload.normalizedEmail,
                    deliveryToken: claim.deliveryToken,
                    acceptedAt: delivery.acceptedAt,
                });
                leaseLossReported = result === 'lease-lost';
                this.emitEvent({
                    event:
                        result === 'completed'
                            ? 'platform_email_delivery_completed'
                            : result === 'superseded'
                              ? 'platform_email_delivery_superseded'
                              : 'platform_email_delivery_lease_lost',
                    jobId: claim.jobId,
                    purpose: claim.purpose,
                    attempt: claim.attempts,
                    durationMs: Math.max(0, this.now() - startedAt),
                });
                return;
            }
            const result = await this.store.recordFailure({
                jobId: claim.jobId,
                leaseToken: claim.leaseToken,
                failedAt: this.now(),
                category: delivery.category,
                transient: delivery.transient,
                acceptanceAmbiguous: delivery.acceptanceAmbiguous,
            });
            leaseLossReported = this.reportFailure(
                claim,
                result,
                delivery.category,
                delivery.acceptanceAmbiguous,
                startedAt,
            );
        } finally {
            stopLeaseRenewal();
            await (renewalInFlight ?? Promise.resolve());
            if (leaseLost && !leaseLossReported) {
                this.emitEvent({
                    event: 'platform_email_delivery_lease_lost',
                    jobId: claim.jobId,
                    purpose: claim.purpose,
                    attempt: claim.attempts,
                });
            }
        }
    }

    private reportFailure(
        claim: PlatformEmailDeliveryClaim,
        result: Awaited<ReturnType<PlatformEmailDeliveryWorkerStore['recordFailure']>>,
        category: string,
        acceptanceAmbiguous: boolean,
        startedAt: number,
    ): boolean {
        const event = result === 'retry-scheduled'
            ? 'platform_email_delivery_retry_scheduled'
            : result === 'failed'
              ? 'platform_email_delivery_failed'
              : result === 'superseded'
                ? 'platform_email_delivery_superseded'
                : 'platform_email_delivery_lease_lost';
        this.emitEvent({
            event,
            jobId: claim.jobId,
            purpose: claim.purpose,
            attempt: claim.attempts,
            category,
            acceptanceAmbiguous,
            durationMs: Math.max(0, this.now() - startedAt),
        });
        return result === 'lease-lost';
    }

    private renewLeaseWithinTimeout(input: {
        jobId: string;
        leaseToken: string;
        now: number;
        leaseDurationMs: number;
    }): Promise<boolean> {
        return new Promise((resolve) => {
            let settled = false;
            const settle = (renewed: boolean): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(renewed);
            };
            const timer = setTimeout(() => settle(false), this.leaseRenewalTimeoutMs);
            timer.unref();
            let renewal: Promise<boolean>;
            try {
                renewal = Promise.resolve(this.store.renewLease(input));
            } catch (error) {
                this.reportError(error, 'lease renewal');
                settle(false);
                return;
            }
            renewal.then(
                (renewed) => settle(renewed),
                (error) => {
                    this.reportError(error, 'lease renewal');
                    settle(false);
                },
            );
        });
    }

    private emitEvent(event: Record<string, unknown>): void {
        try {
            this.onEvent(event);
        } catch (error) {
            this.reportError(error, 'event sink');
        }
    }

    private reportError(_error: unknown, operation = 'operation'): void {
        try {
            this.onError(normalizeError(`Platform email worker ${operation} failed`));
        } catch {
            // Worker progress must not depend on the observability sink.
        }
    }
}
