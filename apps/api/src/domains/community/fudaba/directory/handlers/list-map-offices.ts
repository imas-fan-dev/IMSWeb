import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { parseFudabaMapQuery } from '@/domains/community/fudaba/directory/request';
import { fudabaPublicMapOfficeView } from '@/domains/community/fudaba/directory/response';
import { fudabaRepository } from '@/middleware/hono-context';

export async function handleListFudabaMapOffices(
    c: Context<AppEnvironment>
): Promise<Response> {
    const query = parseFudabaMapQuery(c.req.url);
    const rows = await fudabaRepository(c).listPublicMapOffices({
        ...query,
        limit: query.limit + 1
    });
    const truncated = rows.length > query.limit;
    const page = truncated ? rows.slice(0, query.limit) : rows;
    return c.json({
        items: page.map(fudabaPublicMapOfficeView),
        truncated
    });
}
