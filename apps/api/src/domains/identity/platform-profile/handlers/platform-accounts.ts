import type {
    MyPlatformAccounts,
    PlatformAccountEntry,
} from "@imsweb/contracts/namecards";
import type { Context } from "hono";
import type { AppEnvironment } from "@/app";
import type { PlatformAccountKindRecord } from "@/ports/repositories/namecards";
import { services } from "@/middleware/hono-context";
import { messageFromError, statusFromError } from "@/utils/http/error-response";

const VALUE_INVALID = {
    success: false as const,
    code: "PLATFORM_ACCOUNT_INVALID" as const,
};

/**
 * The editor accepts what people paste: a full profile URL or the bare
 * identifier. Every catalogue URL ends with the identifier, so the last path
 * segment is the value; anything else is taken as typed.
 */
export function normalizePlatformValue(raw: string): string {
    const trimmed = raw.trim();
    if (!/^https?:\/\//i.test(trimmed)) return trimmed;
    let path = "";
    try {
        path = new URL(trimmed).pathname;
    } catch {
        return trimmed;
    }
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    try {
        return decodeURIComponent(last);
    } catch {
        return last;
    }
}

function accepts(kind: PlatformAccountKindRecord, value: string): boolean {
    try {
        return new RegExp(kind.pattern, "u").test(value);
    } catch {
        return false;
    }
}

export async function handleListMyPlatformAccounts(
    c: Context<AppEnvironment>
): Promise<Response> {
    const accountId = c.get("platformUser")!.id;
    const repository = services(c).namecards;
    if (!repository) return c.json(VALUE_INVALID, 404);
    const [catalog, entries] = await Promise.all([
        repository.listPlatformAccountKinds(),
        repository.listPlatformAccountEntries(accountId),
    ]);
    const body: MyPlatformAccounts = {
        catalog: catalog.map((kind) => ({
            id: kind.id,
            name: kind.name,
            group: kind.group_key,
            pattern: kind.pattern,
            baseUrl: kind.base_url,
            color: kind.color,
            icon: kind.icon,
            displayOrder: kind.display_order,
            enabled: kind.enabled,
        })),
        entries: entries.map((entry) => ({
            kindId: entry.kind_id,
            value: entry.value,
        })),
    };
    return c.json(body);
}

/** One value per platform: the call replaces whatever was stored before. */
export async function handleSaveMyPlatformAccount(
    c: Context<AppEnvironment>
): Promise<Response> {
    const accountId = c.get("platformUser")!.id;
    const kindId = c.req.param("kindId") ?? "";
    const repository = services(c).namecards;
    if (!repository) return c.json(VALUE_INVALID, 404);
    try {
        const catalog = await repository.listPlatformAccountKinds();
        const kind = catalog.find((row) => row.id === kindId);
        if (!kind || !kind.enabled) {
            return c.json(VALUE_INVALID, 404);
        }
        const body = (await c.req.json().catch(() => null)) as {
            value?: unknown;
        } | null;
        if (!body || typeof body.value !== "string") return c.json(VALUE_INVALID, 400);
        const value = normalizePlatformValue(body.value);
        if (!value || value.length > 200 || !accepts(kind, value)) {
            return c.json(VALUE_INVALID, 400);
        }
        await repository.upsertPlatformAccountEntry({
            accountId,
            kindId,
            value,
            at: new Date().toISOString(),
        });
        const entry: PlatformAccountEntry = { kindId, value };
        return c.json(entry);
    } catch (error) {
        const status = statusFromError(error);
        const code = status >= 500 ? "PLATFORM_ACCOUNT_FAILED" : "PLATFORM_ACCOUNT_INVALID";
        return c.json(
            { success: false as const, code, message: messageFromError(error) },
            status as 400 | 500
        );
    }
}

export async function handleDeleteMyPlatformAccount(
    c: Context<AppEnvironment>
): Promise<Response> {
    const accountId = c.get("platformUser")!.id;
    const kindId = c.req.param("kindId") ?? "";
    const repository = services(c).namecards;
    if (!repository) return c.json(VALUE_INVALID, 404);
    const removed = await repository.deletePlatformAccountEntry(accountId, kindId);
    return c.json({ success: true, removed });
}
