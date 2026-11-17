import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import { fudabaRepository } from '@/middleware/hono-context';
import { respondCardMedia } from '@/domains/community/fudaba/cards/card-media-response';
import { resolveOwnerCardMediaKey } from '@/domains/community/fudaba/cards/card-media-resolver';

export async function handleServeFudabaOwnerCardMedia(
    c: Context<AppEnvironment>
): Promise<Response> {
    const cardId = c.req.param('cardId') || '';
    const side = c.req.param('side') || '';
    if (
        !validFudabaCardId(cardId) ||
        !(
            side === 'front' ||
            side === 'back' ||
            /^middle-\d{1,2}$/.test(side) ||
            /^page-[0-9a-f-]{8,}$/.test(side)
        )
    ) {
        return c.text('Not Found', 404);
    }
    const repository = fudabaRepository(c);
    const accountId = c.get('platformUser')!.id;
    const card = await repository.findCardForOwner(cardId, accountId);
    if (!card) return c.text('Not Found', 404);
    const draft = c.req.query('draft') === '1';
    const key = await resolveOwnerCardMediaKey(
        repository,
        card,
        accountId,
        side,
        draft
    );
    if (!key) return c.text('Not Found', 404);
    return respondCardMedia(c, {
        key,
        width: c.req.query('w'),
        cacheControl: 'private, no-store',
        vary: 'Authorization, Cookie',
        mode:
            c.get('platformAuthSource') === 'authorization'
                ? 'proxy'
                : 'redirect',
        notFound: 'Not Found'
    });
}
