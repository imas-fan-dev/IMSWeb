import type { PlatformEmailMessageSender } from '@/ports/email';
import type { StationMessageRepository } from '@/ports/repositories/station-messages';

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_DISPATCH_BATCH = 5;
const DEFAULT_EMAIL_MESSAGES = 3;
const DEFAULT_EMAIL_BATCH = 20;

export interface NodeStationMessageRunnerOptions {
    intervalMs?: number;
    dispatchBatch?: number;
    emailMessages?: number;
    emailBatch?: number;
    onError?: (error: Error) => void;
}

function reportError(error: Error): void {
    process.stderr.write(
        `${JSON.stringify({
            event: 'station_message_runner_failed',
            error: error.message
        })}\n`
    );
}

/**
 * 站内信派发器：跑在 API 进程内（和 `NodeObjectCleanupRunner` 同一套生命周期）。
 *
 * 每个 tick 做两件事：
 * 1. 把到期的定时批次派发成收件人的站内信（立即发送在请求内已派发完，这里只是兜底）；
 * 2. 推进「转发到绑定邮箱」的进度，每封一次结果都落库，进程重启后从中断处继续。
 */
export class NodeStationMessageRunner {
    private readonly intervalMs: number;
    private readonly dispatchBatch: number;
    private readonly emailMessages: number;
    private readonly emailBatch: number;
    private readonly onError: (error: Error) => void;
    private timer?: NodeJS.Timeout;
    private running?: Promise<void>;
    private closing?: Promise<void>;
    private started = false;
    private stopping = false;

    constructor(
        private readonly repository: StationMessageRepository,
        private readonly sender: PlatformEmailMessageSender,
        options: NodeStationMessageRunnerOptions = {}
    ) {
        this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
        this.dispatchBatch = options.dispatchBatch ?? DEFAULT_DISPATCH_BATCH;
        this.emailMessages = options.emailMessages ?? DEFAULT_EMAIL_MESSAGES;
        this.emailBatch = options.emailBatch ?? DEFAULT_EMAIL_BATCH;
        this.onError = options.onError ?? reportError;
        if (!Number.isInteger(this.intervalMs) || this.intervalMs < 1) {
            throw new Error('Invalid station message interval');
        }
        if (!Number.isInteger(this.dispatchBatch) || this.dispatchBatch < 1) {
            throw new Error('Invalid station message dispatch batch');
        }
        if (!Number.isInteger(this.emailBatch) || this.emailBatch < 1) {
            throw new Error('Invalid station message email batch');
        }
    }

    start(): void {
        if (this.stopping) throw new Error('Station message runner is closed');
        if (this.started) return;
        this.started = true;
        void this.run();
    }

    run(): Promise<void> {
        if (this.stopping) return Promise.resolve();
        if (this.running) return this.running;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        const running = this.runOnce()
            .catch((error) =>
                this.onError(error instanceof Error ? error : new Error(String(error)))
            )
            .finally(() => {
                if (this.running === running) this.running = undefined;
                if (this.started && !this.stopping) this.schedule();
            });
        this.running = running;
        return running;
    }

    close(): Promise<void> {
        if (this.closing) return this.closing;
        this.stopping = true;
        this.started = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        this.closing = (this.running ?? Promise.resolve()).then(() => undefined);
        return this.closing;
    }

    private schedule(): void {
        if (this.timer || this.stopping) return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.run();
        }, this.intervalMs);
        this.timer.unref();
    }

    private async runOnce(): Promise<void> {
        for (let index = 0; index < this.dispatchBatch; index += 1) {
            const dispatched = await this.repository.dispatchDue();
            if (!dispatched) break;
        }
        const messageIds = await this.repository.listPendingEmailMessages(this.emailMessages);
        for (const messageId of messageIds) {
            await this.forwardEmail(messageId);
        }
    }

    /** 把一个批次的邮件转发推到「没有可领取的收件人」为止。 */
    private async forwardEmail(messageId: string): Promise<void> {
        const message = await this.repository.findById(messageId);
        if (!message) return;
        for (;;) {
            const targets = await this.repository.claimEmailTargets(messageId, this.emailBatch);
            if (targets.length === 0) {
                await this.repository.completeEmailForwarding(messageId);
                return;
            }
            const results = await this.sender.sendMessages(
                targets.map((target) => ({
                    recipient: target.email,
                    subject: message.title,
                    text: message.body
                }))
            );
            for (const [index, target] of targets.entries()) {
                const result = results[index] ?? {
                    status: 'failed' as const,
                    retryable: true,
                    message: '邮件服务未返回结果'
                };
                await this.repository.markEmailResult(messageId, target.accountId, {
                    state: result.status,
                    error: result.message,
                    retryable: result.status === 'failed' && result.retryable
                });
            }
        }
    }
}
