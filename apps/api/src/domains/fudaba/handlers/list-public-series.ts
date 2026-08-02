import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { assertNoFudabaQuery } from '@/domains/fudaba/public-read';
import { fudabaRepository } from '@/middleware/hono-context';

export async function handleListFudabaPublicSeries(
    c: Context<AppEnvironment>
): Promise<Response> {
    assertNoFudabaQuery(c.req.url);
    const rows = await fudabaRepository(c).listPublicSeries();
    return c.json({
        items: rows.map((row) => ({
            code: row.code,
            displayName: row.display_name,
            displayOrder: row.display_order,
            activeOfficeCount: row.active_office_count
        }))
    });
}
