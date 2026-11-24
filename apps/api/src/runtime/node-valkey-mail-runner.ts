import type { ValkeyMailQueue, MailClaim, MailOutcome } from '@/infra/cache/valkey/mail-queue';
import type { SqlPlatformEmailDeliveryRepository } from '@/infra/db/repositories/platform-email-delivery-repository';
import type { SqlStationMessageRepository } from '@/infra/db/repositories/station-message-repository';
import type { ConfiguredPlatformEmailService } from '@/infra/email/smtp/platform-email-service';
import type { PlatformEmailDeliveryAttemptResult, PlatformEmailJobPayloadCipher } from '@/ports/email-delivery';

const POLL_MS = 500;
const REFILL_MS = 2_000;
const SEND_WINDOW_MS = 25_000;
const RETRY_DELAY_MS = 20_000;
const FINALIZE_RETRY_MS = 1_000;
const CONCURRENCY = { verification: 4, station: 2 } as const;
type Lane = keyof typeof CONCURRENCY;

export class NodeValkeyMailRunner {
    private readonly active = {
        verification: new Set<Promise<void>>(),
        station: new Set<Promise<void>>(),
    };
    private readonly polls = new Map<Lane, Promise<void>>();
    private readonly lastPoll = { verification: 0, station: 0 };
    private readonly cancellation = new AbortController();
    private timer?: NodeJS.Timeout;
    private closing?: Promise<void>;
    private nextRefill = 0;
    private stopping = false;

    constructor(
        private readonly queue: Pick<ValkeyMailQueue, 'claim' | 'enqueue' | 'beginAttempt' | 'retry' | 'recordOutcome' | 'ack'>,
        private readonly verification: Pick<SqlPlatformEmailDeliveryRepository, 'findVerificationCandidate' | 'settleVerificationCandidate'>,
        private readonly station: Pick<SqlStationMessageRepository, 'listPendingStationMail' | 'findPendingStationMail' | 'settleStationMail'>,
        private readonly cipher: PlatformEmailJobPayloadCipher,
        private readonly sender: Pick<ConfiguredPlatformEmailService, 'deliverVerification' | 'deliverMessage'>,
    ) {}

    start(): void {
        if (this.timer || this.stopping) return;
        this.timer = setInterval(() => this.tick(), POLL_MS);
        this.timer.unref();
        this.tick();
    }

    isLive(): boolean {
        return !this.stopping;
    }

    isReady(now = Date.now()): boolean {
        return this.isLive() && (['verification', 'station'] as const).every(
            (lane) => this.lastPoll[lane] > 0 && now - this.lastPoll[lane] < 15_000,
        );
    }

    close(deadlineAt = Date.now() + 30_000): Promise<void> {
        if (this.closing) return this.closing;
        this.stopping = true;
        if (this.timer) clearInterval(this.timer);
        let timeout: NodeJS.Timeout;
        this.closing = Promise.race([
            Promise.allSettled([...this.polls.values(), ...this.active.verification, ...this.active.station]),
            new Promise<void>((resolve) => {
                timeout = setTimeout(resolve, Math.max(0, deadlineAt - Date.now()));
                timeout.unref();
            }),
        ]).then(() => {
            clearTimeout(timeout);
            this.cancellation.abort();
        });
        return this.closing;
    }

    private tick(): void {
        if (this.stopping) return;
        for (const lane of ['verification', 'station'] as const) {
            if (this.polls.has(lane)) continue;
            const polling = this.poll(lane)
                .catch(() => this.report('poll', lane))
                .finally(() => this.polls.delete(lane));
            this.polls.set(lane, polling);
        }
    }

    private async poll(lane: Lane): Promise<void> {
        const available = CONCURRENCY[lane] - this.active[lane].size;
        // A zero-limit poll still exercises Valkey while the send slots are busy.
        const leaseStartedAt = Date.now();
        const claims = await this.queue.claim(lane, available);
        for (const claim of claims) {
            if (this.stopping) break;
            // Use a local window starting before claim, rather than comparing clocks
            // on the worker and Valkey hosts.
            const task = this.processClaim(claim, leaseStartedAt + SEND_WINDOW_MS)
                .catch(() => this.report('process', lane))
                .finally(() => this.active[lane].delete(task));
            this.active[lane].add(task);
        }
        this.lastPoll[lane] = Date.now();
        if (lane === 'station' && available > claims.length && !this.stopping && Date.now() >= this.nextRefill) {
            this.nextRefill = Date.now() + REFILL_MS;
            const pending = await this.station.listPendingStationMail(32);
            await Promise.all(pending.map((target) => this.queue.enqueue({
                kind: 'station', jobId: `${target.messageId}:${target.accountId}`, ...target,
            })));
        }
    }

    private async processClaim(claim: MailClaim, sendBy: number): Promise<void> {
        const { job } = claim;
        if (job.kind === 'station') {
            let outcome = claim.outcome;
            if (!outcome) {
                const message = await this.station.findPendingStationMail(job.messageId, job.accountId);
                if (!message) {
                    await this.queue.ack(claim);
                    return;
                }
                if (claim.attemptInProgress) {
                    outcome = { failure: 'acceptance_unknown' };
                } else if (!message.recipient) {
                    outcome = { skipped: true };
                } else if (claim.attempts >= job.maxAttempts) {
                    outcome = { failure: 'attempt_limit' };
                } else {
                    const recipient = message.recipient;
                    outcome = await this.attempt(claim, sendBy, job.maxAttempts, () => this.sender.deliverMessage({
                        message: { ...message, recipient }, deadlineAt: sendBy, signal: this.cancellation.signal,
                    }));
                }
                if (!outcome || !await this.queue.recordOutcome(claim, outcome)) return;
            }
            await this.finalize(claim, () => this.station.settleStationMail(job.messageId, job.accountId, outcome));
            return;
        }

        const normalizedEmail = await this.verification.findVerificationCandidate(job.purpose, job.deliveryToken);
        if (!normalizedEmail) {
            // A producer may still be committing its candidate. An orphan never
            // sends, and is reclaimed after the request's delivery deadline.
            if (claim.outcome || Date.now() >= job.deadlineAt) await this.queue.ack(claim);
            else await this.queue.retry(claim, FINALIZE_RETRY_MS);
            return;
        }
        let outcome = claim.outcome;
        if (!outcome) {
            const deadlineAt = Math.min(sendBy, job.deadlineAt);
            let payload;
            try {
                payload = this.cipher.decrypt(job, job.payloadCiphertext);
            } catch {
                // Do not include the ciphertext or recipient in diagnostics.
            }
            if (claim.attemptInProgress) {
                // The previous worker could have died after SMTP accepted the message.
                outcome = { failure: 'acceptance_unknown' };
            } else if (!payload || payload.normalizedEmail !== normalizedEmail) {
                outcome = { failure: 'payload' };
            } else if (Date.now() >= job.deadlineAt || claim.attempts >= 2) {
                outcome = { failure: 'attempt_limit_or_deadline' };
            } else {
                const { code, expiresInMinutes } = payload;
                outcome = await this.attempt(claim, deadlineAt, 2, () => this.sender.deliverVerification({
                    purpose: job.purpose,
                    message: { email: normalizedEmail, code, expiresInMinutes },
                    deadlineAt,
                    signal: this.cancellation.signal,
                }));
            }
            if (!outcome || !await this.queue.recordOutcome(claim, outcome)) return;
        }
        const result = 'acceptedAt' in outcome ? outcome : { failedAt: Date.now() };
        await this.finalize(claim, () => this.verification.settleVerificationCandidate({
            purpose: job.purpose, deliveryToken: job.deliveryToken, normalizedEmail, outcome: result,
        }));
    }

    private async attempt(
        claim: MailClaim,
        deadlineAt: number,
        maxAttempts: number,
        send: () => Promise<PlatformEmailDeliveryAttemptResult>,
    ): Promise<MailOutcome | undefined> {
        if (Date.now() >= deadlineAt || this.stopping) {
            await this.queue.retry(claim, 0);
            return;
        }
        if (!await this.queue.beginAttempt(claim)) return;
        const result = await send();
        if (result.status === 'accepted') return { acceptedAt: result.acceptedAt };
        const retryDeadline = claim.job.kind === 'verification' ? claim.job.deadlineAt : Infinity;
        if (result.transient && !result.acceptanceAmbiguous && claim.attempts + 1 < maxAttempts
            && Date.now() + RETRY_DELAY_MS < retryDeadline) {
            await this.queue.retry(claim, RETRY_DELAY_MS);
            return;
        }
        return { failure: result.category };
    }

    private async finalize(claim: MailClaim, settle: () => Promise<void>): Promise<void> {
        try {
            await settle();
        } catch (error) {
            // The outcome is already in Valkey. Recovery retries PostgreSQL, not SMTP.
            await this.queue.retry(claim, FINALIZE_RETRY_MS);
            throw error;
        }
        await this.queue.ack(claim);
    }

    private report(operation: string, lane: Lane): void {
        console.error(JSON.stringify({ event: 'mail_queue_worker_error', operation, lane }));
    }
}
