import type { PlatformAccountKindList } from '@imsweb/contracts/namecards';
import type { AppEnvironment } from '@/app';
import type { PlatformAccountKindRecord } from '@/ports/repositories/namecards';
import { services } from '@/middleware/hono-context';
import { platformAccountIconPath } from '@imsweb/contracts/paths';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import type { Context } from 'hono';

/** The body the backoffice submits; snake_case is only the storage shape. */
export interface PlatformAccountKindBody {
    name: string;
    group: 'game' | 'social' | 'link';
    pattern: string;
    baseUrl: string | null;
    color: string | null;
    icon: string | null;
    displayOrder: number;
    enabled: boolean;
    uppercase?: boolean;
}

function toKindView(
    record: PlatformAccountKindRecord,
    iconUrl: string | null
) {
    return {
        id: record.id,
        name: record.name,
        group: record.group_key,
        pattern: record.pattern,
        baseUrl: record.base_url,
        color: record.color,
        icon: record.icon,
        iconUrl,
        displayOrder: record.display_order,
        enabled: record.enabled,
        uppercase: record.uppercase
    };
}

/**
 * 图标统一走站内读取路由（对象存储没有公开地址），带版本号做缓存失效；
 * 未上传时给 null，由前端回退到图标键 / CDN / 首字母。
 */
function kindIconUrls(kinds: PlatformAccountKindRecord[]): (string | null)[] {
    return kinds.map((kind) =>
        kind.icon_object_key
            ? `${platformAccountIconPath(kind.id)}?v=${encodeURIComponent(kind.updated_at)}`
            : null
    );
}

/** The catalogue every producer form is generated from. */
export async function handleListPlatformAccountKinds(
    c: Context<AppEnvironment>
): Promise<Response> {
    const kinds = await services(c).namecards!.listPlatformAccountKinds();
    const urls = kindIconUrls(kinds);
    return c.json({
        kinds: kinds.map((kind, index) => toKindView(kind, urls[index] ?? null))
    } satisfies PlatformAccountKindList);
}

export async function handleUpsertPlatformAccountKind(
    c: ValidatedRequestContext<AppEnvironment, 'json', PlatformAccountKindBody>
): Promise<Response> {
    const id = c.req.param('id') ?? '';
    if (!/^[a-z0-9-]{1,32}$/.test(id)) {
        return c.json({ success: false, message: '标识符只能是小写字母、数字与连字符' }, 400);
    }
    const body = c.req.valid('json');
    // The admin form has no case switch, so an edit keeps the stored flag.
    const existing = (
        await services(c).namecards!.listPlatformAccountKinds()
    ).find((row) => row.id === id);
    await services(c).namecards!.upsertPlatformAccountKind({
        id,
        name: body.name,
        group_key: body.group,
        pattern: body.pattern,
        base_url: body.baseUrl,
        color: body.color,
        icon: body.icon,
        display_order: body.displayOrder,
        enabled: body.enabled,
        uppercase: body.uppercase ?? existing?.uppercase ?? false,
        icon_object_key: existing?.icon_object_key ?? null,
        updated_at: existing?.updated_at ?? '' 
    });
    const kinds = await services(c).namecards!.listPlatformAccountKinds();
    const urls = kindIconUrls(kinds);
    return c.json({
        kinds: kinds.map((kind, index) => toKindView(kind, urls[index] ?? null))
    } satisfies PlatformAccountKindList);
}

export async function handleDeletePlatformAccountKind(
    c: Context<AppEnvironment>
): Promise<Response> {
    const id = c.req.param('id') ?? '';
    const removed = await services(c).namecards!.deletePlatformAccountKind(id);
    if (!removed) {
        return c.json({ success: false, message: '平台不存在' }, 404);
    }
    return c.json({ success: true });
}
