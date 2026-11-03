import {
    encodePlatformValue,
    formatPlatformValue,
    platformValueError,
    type MyPlatformAccounts,
    type PlatformAccountEntry,
} from "@imsweb/contracts/namecards";
import type { Context } from "hono";
import type { AppEnvironment } from "@/app";
import type { PlatformAccountKindRecord } from "@/ports/repositories/namecards";
import { platformAccountIconUrls } from "@/utils/http/platform-icon-url";
import { services } from "@/middleware/hono-context";
import { messageFromError, statusFromError } from "@/utils/http/error-response";

const VALUE_INVALID = {
    success: false as const,
    code: "PLATFORM_ACCOUNT_INVALID" as const,
};

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
    const iconUrls = platformAccountIconUrls(catalog);
    const body: MyPlatformAccounts = {
        catalog: catalog.map((kind, index) => ({
            id: kind.id,
            name: kind.name,
            group: kind.group_key,
            pattern: kind.pattern,
            baseUrl: kind.base_url,
            color: kind.color,
            icon: kind.icon,
            iconUrl: iconUrls[index] ?? null,
            displayOrder: kind.display_order,
            enabled: kind.enabled,
            uppercase: kind.uppercase,
        })),
        entries: entries.map((entry) => ({
            kindId: entry.kind_id,
            value: entry.value,
            username: entry.username,
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
            username?: unknown;
        } | null;
        if (!body || typeof body.value !== "string") return c.json(VALUE_INVALID, 400);
        const username =
            typeof body.username === "string" && body.username.trim()
                ? body.username.trim().slice(0, 60)
                : null;
        const format = {
            id: kind.id,
            group: kind.group_key,
            pattern: kind.pattern,
            baseUrl: kind.base_url,
            uppercase: kind.uppercase,
        };
        const value = encodePlatformValue(
            format,
            formatPlatformValue(format, body.value)
        );
        if (!value || value.length > 200 || platformValueError(format, value) !== null) {
            return c.json(VALUE_INVALID, 400);
        }
        await repository.upsertPlatformAccountEntry({
            accountId,
            kindId,
            value,
            username,
            at: new Date().toISOString(),
        });
        const entry: PlatformAccountEntry = { kindId, value, username };
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
