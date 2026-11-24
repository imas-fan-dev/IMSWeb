import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { FudabaWallResponse } from '@imsweb/contracts/fudaba/wall';
import { validFudabaOfficeSlug } from '@/domains/community/fudaba/directory/request';
import {
    parseWallQuery,
    encodeWallCursor,
} from '@/domains/community/fudaba/directory/wall-query';
import {
    fudabaPublicOfficeView,
    fudabaPublicPlacedCardView,
} from '@/domains/community/fudaba/directory/response';
import { fudabaRepository, services } from '@/middleware/hono-context';

export async function handleGetFudabaWall(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const slug = c.req.param('officeSlug') ?? '';
    if (!validFudabaOfficeSlug(slug))
        return c.json({ error: 'Invalid Fudaba office slug' }, 400);
    const query = parseWallQuery(c.req.url);
    const result = await fudabaRepository(c).findPublicWall(
        slug,
        c.get('platformUser')?.id ?? null,
        query,
    );
    if (!result) return c.json({ error: 'Fudaba office not found' }, 404);
    const hasNextPage = result.office.cards.length > query.limit;
    const rows = result.office.cards.slice(0, query.limit);
    const last = result.cursorPosition;
    const [office, cards] = await Promise.all([
        fudabaPublicOfficeView(services(c).storage, result.office),
        Promise.all(
            rows.map((card) =>
                fudabaPublicPlacedCardView(services(c).storage, card),
            ),
        ),
    ]);
    return c.json({
        office: { ...office, cards },
        wall: result.wall,
        pageInfo: {
            hasNextPage,
            nextCursor:
                hasNextPage && last
                    ? encodeWallCursor(query.scope, last.pinnedAt, last.id)
                    : null,
        },
    } satisfies FudabaWallResponse);
}
