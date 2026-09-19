import type {
    CompensationService,
    ObjectCleanupRunner,
    ObjectDeletionWorker,
    ObjectStorage,
} from "@/ports/object-storage";

const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_BATCH_SIZE = 10;

export interface NodeObjectCleanupRunnerOptions {
    intervalMs?: number;
    batchSize?: number;
    onError?: (error: Error) => void;
}

function reportCleanupError(error: Error): void {
    process.stderr.write(
        `${JSON.stringify({
            event: "object_cleanup_failed",
            error: error.message,
        })}\n`,
    );
}

// pi-lens-ignore: large-class -- Scheduling and idle-state transitions form one lifecycle invariant.
export class NodeObjectCleanupRunner implements ObjectCleanupRunner {
    private readonly intervalMs: number;
    private readonly batchSize: number;
    private readonly onError: (error: Error) => void;
    private timer?: NodeJS.Timeout;
    private running?: Promise<void>;
    private closing?: Promise<void>;
    private started = false;
    private stopping = false;

    constructor(
        private readonly objectDeletions: ObjectDeletionWorker,
        private readonly compensation: CompensationService,
        private readonly storage: ObjectStorage,
        options: NodeObjectCleanupRunnerOptions = {},
    ) {
        this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
        this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
        this.onError = options.onError ?? reportCleanupError;
        if (!Number.isInteger(this.intervalMs) || this.intervalMs < 1) {
            throw new Error("Invalid object cleanup interval");
        }
        if (!Number.isInteger(this.batchSize) || this.batchSize < 1) {
            throw new Error("Invalid object cleanup batch size");
        }
    }

    start(): void {
        if (this.stopping) throw new Error("Object cleanup runner is closed");
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
                this.onError(
                    error instanceof Error ? error : new Error(String(error)),
                ),
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
        this.closing = (this.running ?? Promise.resolve()).then(
            () => undefined,
        );
        return this.closing;
    }

    isIdle(): boolean {
        return this.running === undefined;
    }

    private schedule(): void {
        if (this.timer || this.stopping) return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.run();
        }, this.intervalMs);
    }

    private async runOnce(): Promise<void> {
        const failures: Error[] = [];
        try {
            await this.objectDeletions.run(this.batchSize);
        } catch (error) {
            failures.push(
                error instanceof Error ? error : new Error(String(error)),
            );
        }
        try {
            await this.compensation.run(this.storage, this.batchSize);
        } catch (error) {
            failures.push(
                error instanceof Error ? error : new Error(String(error)),
            );
        }
        if (failures.length === 1) throw failures[0];
        if (failures.length > 1) {
            throw new AggregateError(failures, "Object cleanup cycle failed");
        }
    }
}
