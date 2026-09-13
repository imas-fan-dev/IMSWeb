import assert from "node:assert/strict";
import test from "node:test";
import { ValkeyCache } from "@/infra/cache/valkey/cache";
import { withBoundedCacheOperation } from "@/utils/cache/bounded-operation";

class FakeValkeyClient {
    readonly commands: string[][] = [];
    readonly values = new Map<string, string>();
    closed = false;
    stall = false;
    abortedCommands = 0;

    on(): this {
        return this;
    }

    async connect(): Promise<this> {
        return this;
    }

    async sendCommand<T = unknown>(
        args: readonly string[],
        options?: { abortSignal?: AbortSignal },
    ): Promise<T> {
        const command = [...args];
        this.commands.push(command);
        if (this.stall) {
            return new Promise<T>((_resolve, reject) => {
                options?.abortSignal?.addEventListener(
                    "abort",
                    () => {
                        this.abortedCommands += 1;
                        reject(new Error("Valkey command aborted"));
                    },
                    { once: true },
                );
            });
        }
        if (command[0] === "GET")
            return (this.values.get(command[1]!) ?? null) as T;
        if (command[0] === "SET") {
            this.values.set(command[1]!, command[2]!);
            return "OK" as T;
        }
        if (command[0] === "DEL") {
            this.values.delete(command[1]!);
            return 1 as T;
        }
        if (command[0] === "PING") return "PONG" as T;
        throw new Error(`Unexpected command: ${command.join(" ")}`);
    }

    async close(): Promise<void> {
        this.closed = true;
    }
}

test("Valkey cache namespaces values and applies an expiration command", async () => {
    const client = new FakeValkeyClient();
    const cache = new ValkeyCache(client, { keyPrefix: "imsweb:cache:" });

    await cache.set("email-cooldown:abc", '{"retryAfterAt":123}', 60);
    assert.equal(await cache.get("email-cooldown:abc"), '{"retryAfterAt":123}');
    assert.deepEqual(client.commands.slice(0, 2), [
        [
            "SET",
            "imsweb:cache:email-cooldown:abc",
            '{"retryAfterAt":123}',
            "EX",
            "60",
        ],
        ["GET", "imsweb:cache:email-cooldown:abc"],
    ]);

    await cache.delete("email-cooldown:abc");
    assert.equal(await cache.get("email-cooldown:abc"), null);
    await cache.ping();
    await cache.close();
    assert.equal(client.closed, true);
});

test("Valkey cache aborts a queued command at the caller deadline", async () => {
    const client = new FakeValkeyClient();
    client.stall = true;
    const cache = new ValkeyCache(client, { keyPrefix: "imsweb:cache:" });

    await assert.rejects(
        withBoundedCacheOperation(
            (signal) => cache.get("email-cooldown:abc", { signal }),
            1,
        ),
        /exceeded its deadline/,
    );
    assert.equal(client.abortedCommands, 1);
});

test("Valkey cache rejects invalid keys and TTLs before issuing commands", async () => {
    const client = new FakeValkeyClient();
    const cache = new ValkeyCache(client, { keyPrefix: "imsweb:cache:" });

    await assert.rejects(cache.set("key", "value", 0), /TTL/);
    await assert.rejects(cache.get("bad key"), /key/);
    assert.deepEqual(client.commands, []);
});
