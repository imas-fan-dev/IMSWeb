import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import { fudabaRepository, services } from '@/middleware/hono-context';
import { objectReadResponse } from '@/utils/http/object-read-response';

export async function handleServeFudabaOwnerCardMedia(
    c: Context<AppEnvironment>
): Promise<Response> {
    const cardId = c.req.param('cardId') || '';
    const side = c.req.param('side') || '';
    if (!validFudabaCardId(cardId) || !['front', 'back'].includes(side)) {
        return c.text('Not Found', 404);
    }
    const card = await fudabaRepository(c).findCardForOwner(
        cardId,
        c.get('platformUser')!.id
    );
    if (!card) return c.text('Not Found', 404);
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    // `draft=1` asks for the revision still under review. It falls back to the
    // live object because a submitted revision may reuse the existing images.
    const draft = c.req.query('draft') === '1';
    const key =
        side === 'front'
            ? (draft && card.pending_front_object_key) || card.front_object_key
            : (draft && card.pending_back_object_key) || card.back_object_key;
    const response = await objectReadResponse(c.req.raw, storage, key, {
        'Cache-Control': 'private, no-store',
        'Vary': 'Authorization, Cookie'
    }, {
        // App bearer reads stay on the authenticated API origin. Storage hosts
        // need no browser CORS policy, even when they support signed redirects.
        mode: c.get('platformAuthSource') === 'authorization' ? 'proxy' : 'redirect'
    });
    return response ?? c.text('Not Found', 404);
}
