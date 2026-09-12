import assert from "node:assert/strict";
import test from "node:test";
import { ValkeyCache } from "@/infra/cache/valkey/cache";

class FakeValkeyClient {
    readonly commands: string[][] = [];
    readonly values = new Map<string, string>();
    closed = false;

    on(): this {
        return this;
    }

    async connect(): Promise<this> {
        return this;
    }

    async sendCommand<T = unknown>(args: readonly string[]): Promise<T> {
        const command = [...args];
        this.commands.push(command);
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

test("Valkey cache rejects invalid keys and TTLs before issuing commands", async () => {
    const client = new FakeValkeyClient();
    const cache = new ValkeyCache(client, { keyPrefix: "imsweb:cache:" });

    await assert.rejects(cache.set("key", "value", 0), /TTL/);
    await assert.rejects(cache.get("bad key"), /key/);
    assert.deepEqual(client.commands, []);
});
