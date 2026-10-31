import { iconPath } from '@imsweb/contracts/paths';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { assertNoFudabaQuery } from '@/domains/community/fudaba/directory/request';
import { fudabaRepository, services } from '@/middleware/hono-context';
import type { FudabaPublicSeriesRecord } from '@/ports/repositories';
import { resolvePublicObjectUrl } from '@/utils/storage/public-object-url';

export async function handleListFudabaPublicSeries(
    c: Context<AppEnvironment>
): Promise<Response> {
    assertNoFudabaQuery(c.req.url);
    return seriesResponse(c, await fudabaRepository(c).listPublicSeries());
}

/**
 * The editor's picker: owners may file a card under a series that has no wiki
 * section yet (「其他」), so this list is not filtered by `wiki_enabled`.
 */
export async function handleListFudabaOwnerSeries(
    c: Context<AppEnvironment>
): Promise<Response> {
    assertNoFudabaQuery(c.req.url);
    return seriesResponse(c, await fudabaRepository(c).listOwnerSeries());
}

async function seriesResponse(
    c: Context<AppEnvironment>,
    rows: FudabaPublicSeriesRecord[]
): Promise<Response> {
    const storage = services(c).storage;
    return c.json({
        items: await Promise.all(rows.map(async (row) => {
            let iconUrl: string | null = null;
            if (row.icon_object_key) {
                if (!storage) {
                    throw Object.assign(
                        new Error('公开对象读取地址未配置'),
                        { status: 503 }
                    );
                }
                iconUrl = await resolvePublicObjectUrl(
                    storage,
                    row.icon_object_key,
                    iconPath(`/agencies/${row.id}.webp`)
                );
            }
            return {
                id: row.id,
                code: row.code,
                displayName: row.display_name,
                displayOrder: row.display_order,
                color: row.color,
                iconUrl,
                imageTransform: row.image_transform,
                activeOfficeCount: row.active_office_count
            };
        }))
    });
}
