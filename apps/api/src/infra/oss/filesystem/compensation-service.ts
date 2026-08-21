import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
    CompensationService,
    ObjectStorage,
} from "@/ports/object-storage";

interface JournalEntry {
    id: string;
    kind: string;
    payload: unknown;
    state: "pending" | "running" | "completed" | "failed";
    attempts: number;
    lastError?: string;
    updatedAt: string;
}

function errorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : String(error ?? "unknown error");
}

export class FilesystemCompensationService implements CompensationService {
    private running?: Promise<void>;

    constructor(private readonly directory: string) {}

    private id(kind: string, payload: unknown): string {
        return crypto
            .createHash("sha256")
            .update(kind)
            .update("\0")
            .update(JSON.stringify(payload))
            .digest("hex");
    }

    private filePath(id: string): string {
        return path.join(this.directory, `${id}.json`);
    }

    private async write(entry: JournalEntry): Promise<void> {
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        const destination = this.filePath(entry.id);
        const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
        try {
            await fs.writeFile(temporary, JSON.stringify(entry), {
                flag: "wx",
                mode: 0o600,
            });
            await fs.rename(temporary, destination);
        } finally {
            await fs.rm(temporary, { force: true }).catch(() => undefined);
        }
    }

    async enqueue(
        kind: string,
        payload: unknown,
        error?: unknown,
    ): Promise<string> {
        const id = this.id(kind, payload);
        try {
            const existing = JSON.parse(
                await fs.readFile(this.filePath(id), "utf8"),
            ) as JournalEntry;
            if (existing.state === "completed") return id;
        } catch (readError) {
            if ((readError as NodeJS.ErrnoException).code !== "ENOENT")
                throw readError;
        }
        await this.write({
            id,
            kind,
            payload,
            state: "pending",
            attempts: 0,
            ...(error === undefined ? {} : { lastError: errorMessage(error) }),
            updatedAt: new Date().toISOString(),
        });
        return id;
    }

    run(storage: ObjectStorage, limit = 10): Promise<void> {
        if (this.running) return this.running;
        this.running = this.runExclusive(storage, limit).finally(() => {
            this.running = undefined;
        });
        return this.running;
    }

    private async runExclusive(
        storage: ObjectStorage,
        limit: number,
    ): Promise<void> {
        let names: string[];
        try {
            names = (await fs.readdir(this.directory))
                .filter((name) => name.endsWith(".json"))
                .sort();
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
            throw error;
        }
        let handled = 0;
        for (const name of names) {
            if (handled >= limit) break;
            let entry: JournalEntry;
            try {
                entry = JSON.parse(
                    await fs.readFile(path.join(this.directory, name), "utf8"),
                ) as JournalEntry;
            } catch {
                continue;
            }
            if (entry.state === "completed") continue;
            handled += 1;
            entry.state = "running";
            entry.attempts += 1;
            entry.updatedAt = new Date().toISOString();
            await this.write(entry);
            try {
                const key = (entry.payload as { key?: unknown })?.key;
                if (typeof key !== "string" || !key) {
                    throw new Error("Invalid object compensation");
                }
                if (entry.kind === "delete-object") {
                    await storage.delete(key);
                } else if (entry.kind === "protect-object") {
                    throw new Error(
                        "Filesystem object protection does not require compensation",
                    );
                } else {
                    throw new Error(`Unsupported compensation: ${entry.kind}`);
                }
                entry.state = "completed";
                entry.lastError = undefined;
            } catch (error) {
                entry.state = "failed";
                entry.lastError = errorMessage(error);
            }
            entry.updatedAt = new Date().toISOString();
            await this.write(entry);
        }
    }
}
