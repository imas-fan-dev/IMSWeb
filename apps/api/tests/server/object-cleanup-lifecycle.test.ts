import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import type {
    CompensationService,
    ObjectCleanupRunner,
    ObjectDeletionWorker,
    ObjectStorage,
} from "@/ports/object-storage";
import type { RuntimeServices } from "@/ports/runtime-services";
import { NodeObjectCleanupRunner } from "@/runtime/node-object-cleanup-runner";
import { createNodeServiceLifecycle } from "@/runtime/node-services";
import { shutdownServer } from "@/main";

function signal(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    return {
        promise: new Promise<void>((settle) => {
            resolve = settle;
        }),
        resolve: () => resolve(),
    };
}

test("object cleanup runner stops scheduling and closes only after the active cycle is idle", async (t) => {
    const started = signal();
    const release = signal();
    const calls: string[] = [];
    const limits: number[] = [];
    const objectDeletions: ObjectDeletionWorker = {
        async run(limit) {
            calls.push("deletions");
            limits.push(limit ?? -1);
            started.resolve();
            await release.promise;
        },
        async retryQuarantined() {
            return false;
        },
    };
    const compensation: CompensationService = {
        async enqueue() {
            return "unused";
        },
        async run(_storage, limit) {
            calls.push("compensation");
            limits.push(limit ?? -1);
        },
    };
    const runner = new NodeObjectCleanupRunner(
        objectDeletions,
        compensation,
        {} as ObjectStorage,
        {
            intervalMs: 60_000,
            batchSize: 7,
            onError(error) {
                assert.fail(`unexpected cleanup error: ${String(error)}`);
            },
        },
    );
    t.after(() => runner.close());

    runner.start();
    await started.promise;
    assert.equal(runner.isIdle(), false);
    let closed = false;
    const closing = runner.close().then(() => {
        closed = true;
    });
    await Promise.resolve();
    assert.equal(closed, false, "close must wait for the active cleanup cycle");

    release.resolve();
    await closing;
    assert.equal(runner.isIdle(), true);
    assert.deepEqual(calls, ["deletions", "compensation"]);
    assert.deepEqual(limits, [7, 7]);
    await runner.run();
    assert.deepEqual(calls, ["deletions", "compensation"]);
});

test("Node service shutdown waits for object cleanup before closing its dependencies", async () => {
    const cleanupStarted = signal();
    const releaseCleanup = signal();
    const calls: string[] = [];
    let idle = false;
    const objectCleanup: ObjectCleanupRunner = {
        start() {},
        async run() {},
        async close() {
            calls.push("cleanup:start");
            cleanupStarted.resolve();
            await releaseCleanup.promise;
            idle = true;
            calls.push("cleanup:idle");
        },
        isIdle() {
            return idle;
        },
    };
    const lifecycle = createNodeServiceLifecycle(
        async () =>
            ({
                objectCleanup,
                storage: {
                    close() {
                        assert.equal(objectCleanup.isIdle(), true);
                        calls.push("storage:close");
                    },
                },
            }) as unknown as RuntimeServices,
    );

    await lifecycle.resolve();
    const server = createServer((_request, response) => response.end("ok"));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    let shutdownCompleted = false;
    const closing = shutdownServer(server, {
        timeoutMs: 1_000,
        closeServices: () => lifecycle.close(),
    }).then(() => {
        shutdownCompleted = true;
    });
    await cleanupStarted.promise;
    await Promise.resolve();
    assert.equal(server.listening, false);
    assert.equal(shutdownCompleted, false);
    assert.deepEqual(calls, ["cleanup:start"]);

    releaseCleanup.resolve();
    await closing;
    assert.equal(shutdownCompleted, true);
    assert.deepEqual(calls, ["cleanup:start", "cleanup:idle", "storage:close"]);
});
