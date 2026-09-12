import assert from "node:assert/strict";
import test from "node:test";
import type { ObjectStorage } from "@/ports/object-storage";
import type { RuntimeServices } from "@/ports/runtime-services";
import { protectObjectWithCompensation } from "@/utils/storage/delete-object";

test("object protection and its compensation are fenced to one object version", async () => {
    const enqueued: Array<{
        kind: string;
        payload: Record<string, unknown>;
    }> = [];
    let unfencedProtectCalls = 0;
    const storage: Partial<ObjectStorage> = {
        async currentObjectId() {
            return "reviewed-object-id";
        },
        async protect() {
            unfencedProtectCalls += 1;
        },
        async protectIfObjectId(key, objectId) {
            assert.equal(key, "community/fudaba/cards/review/front.webp");
            assert.equal(objectId, "reviewed-object-id");
            throw new Error("temporary S3 failure");
        },
    };
    const runtime = {
        storage: storage as ObjectStorage,
        compensation: {
            async enqueue(kind: string, payload: Record<string, unknown>) {
                enqueued.push({ kind, payload });
                return "job-id";
            },
            async run() {},
        },
    } as RuntimeServices;

    await protectObjectWithCompensation(
        runtime,
        "community/fudaba/cards/review/front.webp",
    );

    assert.equal(unfencedProtectCalls, 0);
    assert.deepEqual(enqueued, [
        {
            kind: "protect-object",
            payload: {
                key: "community/fudaba/cards/review/front.webp",
                objectId: "reviewed-object-id",
            },
        },
    ]);
});
