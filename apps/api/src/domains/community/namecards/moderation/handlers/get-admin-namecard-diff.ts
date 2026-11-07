import type { AppEnvironment } from '@/app';
import {
    toAdminNamecardDiffResponse,
    type AdminNamecardDiffResponse,
    type NamecardErrorResponse
} from '@/domains/community/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import { cardArtworkView } from '@/domains/community/fudaba/cards/artwork-view';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleGetAdminNamecardDiff(
    c: ValidatedRequestContext<AppEnvironment, 'param', { id: number }>
): Promise<Response> {
    const { id } = c.req.valid('param');
    try {
        const diff = await namecardRepository(c).findCardDiff(id);
        if (!diff) {
            return c.json(
                { error: 'Namecard not found' } satisfies NamecardErrorResponse,
                404
            );
        }
        const response = toAdminNamecardDiffResponse(diff);
        const pagesByNumber =
            (await services(c).fudaba?.listCardPagesBatchByNumbers?.([id])) ??
            new Map();
        const rows = pagesByNumber.get(id);
        const live = cardArtworkView({
            scope: 'admin',
            cardNumber: id,
            cardId: String(id),
            live: rows?.live ?? [],
            pending: []
        }).live;
        const pendingRows = rows?.pending ?? [];
        const pending =
            pendingRows.length > 0
                ? cardArtworkView({
                      scope: 'admin',
                      cardNumber: id,
                      cardId: String(id),
                      live: [],
                      pending: pendingRows
                  }).pending ?? []
                : null;
        return c.json(
            {
                ...response,
                live: { ...response.live, ...(live.length > 0 ? { pages: live } : {}) },
                pending:
                    response.pending && pending
                        ? { ...response.pending, pages: pending }
                        : response.pending
            } satisfies AdminNamecardDiffResponse
        );
    } catch (error) {
        console.error('[admin-namecard-diff]', error);
        return c.json(
            { error: 'Unable to read the namecard revisions' } satisfies NamecardErrorResponse,
            500
        );
    }
}
